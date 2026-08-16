import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { applyManagedApiKey, getManagedProfiles } from '../lib/apiProfiles'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import AccountQrModal from './AccountQrModal'

export default function ManagedApiKeyModal() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showSettings = useStore((s) => s.showSettings)
  const modalOpen = useStore((s) => s.managedApiKeyModalOpen)
  const setModalOpen = useStore((s) => s.setManagedApiKeyModalOpen)
  const inputRef = useRef<HTMLInputElement>(null)
  const managedProfiles = getManagedProfiles(settings)
  const profile = managedProfiles.find((item) => !item.apiKey.trim())
  const visible = !showSettings && (modalOpen || Boolean(profile))
  const [apiKey, setApiKey] = useState('')
  const [showCustomerQrModal, setShowCustomerQrModal] = useState(false)

  usePreventBackgroundScroll(visible)

  useEffect(() => {
    if (!visible) return
    setApiKey('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [profile?.id, visible])

  if (!visible || managedProfiles.length === 0) return null

  const save = () => {
    const value = apiKey.trim()
    if (!value) return

    setSettings(applyManagedApiKey(settings, value))
    setModalOpen(false)
  }

  const close = () => setModalOpen(false)

  return (
    <>
      {createPortal(
        <div data-no-drag-select className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <form
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">填写API Key</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          ①先在 OpenXNex <a href="https://api.opennex.top/register?aff=gYGC" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">注册账号</a>并登录。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          ②再点击 <a href="https://api.opennex.top/console/token" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">添加令牌</a>，智能路由选择价格优先。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">③复制令牌，保存后将应用到全部模型配置。</p>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API Key</span>
          <input
            ref={inputRef}
            id="managed-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            autoComplete="off"
            required
          />
        </label>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowCustomerQrModal(true)}
            className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:border-blue-400/50 dark:hover:bg-blue-400/20 dark:hover:text-blue-200"
          >
            联系客服
          </button>
          <button type="submit" className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50" disabled={!apiKey.trim()}>
            保存并继续
          </button>
        </div>
        </form>
        </div>,
        document.body,
      )}
      <AccountQrModal open={showCustomerQrModal} onClose={() => setShowCustomerQrModal(false)} />
    </>
  )
}
