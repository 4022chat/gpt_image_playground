import { isTauri as detectTauri } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'

export const isTauri = detectTauri()

/** 插件抛出的是字符串或普通 Error，统一成浏览器 fetch 的错误：取消时抛 signal.reason（AbortError），其余抛 TypeError */
function toFetchError(err: unknown, signal?: AbortSignal | null) {
  if (signal?.aborted) return signal.reason ?? new DOMException('请求已停止', 'AbortError')
  return new TypeError(`Failed to fetch: ${err instanceof Error ? err.message : String(err)}`)
}

/** 请求用户配置的 API 或远程图片；客户端中 http/https 请求由 Rust 侧发出，不受 CORS 限制 */
export async function apiFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  // data:、blob: 和相对地址继续走原生 fetch；每次调用时读取 globalThis.fetch，测试会替换它
  if (!isTauri || !/^https?:\/\//i.test(String(input))) return globalThis.fetch(input, init)

  const signal = init.signal
  const headers = new Headers(init.headers)
  // 插件默认附带 Origin: http://tauri.localhost，部分中转会因此拒绝请求；开启 unsafe-headers 后空值会在 Rust 侧被移除
  if (!headers.has('Origin')) headers.set('Origin', '')

  const res = await tauriFetch(input, { ...init, headers }).catch((err) => {
    throw toFetchError(err, signal)
  })
  if (!res.body) return res

  // 读取响应体时的取消和断流同样转换成浏览器的错误类型
  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    pull: async (ctrl) => {
      try {
        const chunk = await reader.read()
        if (chunk.done) return ctrl.close()
        ctrl.enqueue(chunk.value)
      } catch (err) {
        ctrl.error(toFetchError(err, signal))
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
  const wrapped = new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
  Object.defineProperty(wrapped, 'url', { value: res.url })
  return wrapped
}

/** 仅把指向其他站点的 http/https 地址和 mailto: 视为外部链接，blob:、data: 和应用自身页面不处理 */
function toExternalUrl(raw: string | URL | undefined | null) {
  if (!raw) return null
  try {
    const url = new URL(String(raw), window.location.href)
    if (url.protocol === 'mailto:') return url.href
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin === window.location.origin) return null
    return url.href
  } catch {
    return null
  }
}

export async function openExternal(url: string) {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await openUrl(url)
  } catch (err) {
    console.error('打开外部链接失败：', err)
  }
}

/** 客户端中 target="_blank" 和 window.open 不会打开系统浏览器，统一转给 openExternal */
export function installExternalLinkHandler() {
  const handleClick = (e: MouseEvent) => {
    if (e.button > 1) return
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a || a.target !== '_blank' || a.hasAttribute('download')) return
    const url = toExternalUrl(a.getAttribute('href'))
    if (!url) return
    e.preventDefault()
    void openExternal(url)
  }
  // 捕获阶段监听，避免被弹窗等容器的 stopPropagation 截断
  window.addEventListener('click', handleClick, true)
  window.addEventListener('auxclick', handleClick, true)

  const rawOpen = window.open.bind(window)
  window.open = (url, target, features) => {
    const external = toExternalUrl(url)
    if (!external) return rawOpen(url, target, features)
    void openExternal(external)
    return null
  }
}

// 刷新、前进后退、查找、打印、查看源码、保存页面等浏览器快捷键，在客户端中会刷掉进行中的任务或打开无关界面；
// 缩放（Ctrl+加减号/0）和开发者工具（F12、Ctrl+Shift+I）不在其中
const BLOCKED_KEYS = new Set(['f5', 'f3', 'f7', 'browserrefresh', 'browserback', 'browserforward', 'browsersearch'])
const BLOCKED_CTRL_KEYS = new Set(['r', 'p', 'f', 'g', 'u', 's'])
const EDITABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])

/**
 * 客户端中屏蔽浏览器自带的快捷键和右键菜单。
 * 不用 WebView2 的 AreBrowserAcceleratorKeysEnabled，它会连同 F12 和缩放快捷键一起禁用；
 * 这里只阻止默认行为，不阻止事件传播，应用自己的快捷键和右键菜单照常收到事件
 */
export function installBrowserBehaviorGuards() {
  window.addEventListener('keydown', (e) => {
    // 自动填充等派发的 keydown 可能没有 key
    const key = e.key?.toLowerCase()
    if (BLOCKED_KEYS.has(key) || ((e.ctrlKey || e.metaKey) && !e.altKey && BLOCKED_CTRL_KEYS.has(key))) e.preventDefault()
  }, true)

  window.addEventListener('contextmenu', (e) => {
    const el = e.target
    // 输入框中保留剪切、复制、粘贴；复选框等非文本输入弹出的是整页菜单（含刷新、打印），同样屏蔽
    const editable = el instanceof HTMLElement && (
      el.isContentEditable
      || el instanceof HTMLTextAreaElement
      || (el instanceof HTMLInputElement && EDITABLE_INPUT_TYPES.has(el.type))
    )
    if (editable) return
    // 在选中的文字上右键时保留菜单，方便复制；在选区外右键弹出的是整页菜单，仍然屏蔽
    const sel = window.getSelection()
    const onSelection = sel && !sel.isCollapsed && sel.rangeCount > 0 && Array.from(sel.getRangeAt(0).getClientRects()).some((r) =>
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
    if (!onSelection) e.preventDefault()
  }, true)
}
