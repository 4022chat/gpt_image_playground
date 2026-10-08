import { isTauri as detectTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export const isTauri = detectTauri()

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
