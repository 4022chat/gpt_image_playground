import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

interface AccountQrModalProps {
  open: boolean
  onClose: () => void
}

export default function AccountQrModal({ open, onClose }: AccountQrModalProps) {
  const showToast = useStore((s) => s.showToast)
  useCloseOnEscape(open, onClose)
  usePreventBackgroundScroll(open)

  const copyModelPrice = async (value: string) => {
    try {
      await copyTextToClipboard(value)
      showToast(`已复制：${value}`, 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制失败', err), 'error')
    }
  }

  if (!open) return null

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        className="relative z-10 w-full max-w-sm rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">联系客服</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭客服二维码"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4">
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            ①先在 OpenXNex <a href="https://api.opennex.top/register?aff=gYGC" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">注册账号</a>并登录。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            ②再点击 <a href="https://api.opennex.top/console/token" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">添加令牌</a>，智能路由选择价格优先。
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/70 bg-white p-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <img src="https://i.ibb.co/MktscWYG/qrcode.png" alt="客服二维码" className="mx-auto block aspect-square w-full max-w-[190px] object-contain" />
        </div>
        <p className="mt-4 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">使用微信扫一扫咨询客服</p>
        {/* 查看操作指南 */}
      </div>
    </div>,
    document.body,
  )
}
