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

/** 仅把指向其他站点的 http/https 地址视为外部链接，blob:、data: 和应用自身页面不处理 */
function toExternalUrl(raw: string | URL | undefined | null) {
  if (!raw) return null
  try {
    const url = new URL(String(raw), window.location.href)
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
