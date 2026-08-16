import { useRef } from 'react'
import type { PromptTemplate } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

interface PromptTemplateDetailModalProps {
  template: PromptTemplate
  onClose: () => void
  onUse: () => void
}

export default function PromptTemplateDetailModal({ template, onClose, onUse }: PromptTemplateDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  return (
    <div data-no-drag-select className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-md dark:bg-black/40" />
      <section ref={modalRef} className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10 md:max-h-[90vh] md:flex-row" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-20 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/[0.08] dark:hover:text-gray-300" aria-label="关闭模板详情">
          <CloseIcon className="h-6 w-6" />
        </button>
        <div className="relative flex h-64 shrink-0 items-center justify-center bg-gray-100 dark:bg-black/20 md:h-auto md:w-1/2 md:min-h-[24rem]">
          {template.coverUrl ? <img src={template.coverUrl} alt={template.title} className="max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain" /> : <span className="text-sm text-gray-400 dark:text-gray-500">暂无案例图片</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5">
          <div className="flex-1">
            <h2 className="pr-8 text-lg font-bold text-gray-800 dark:text-gray-100">{template.title}</h2>
            {template.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{template.description}</p> : null}
            {template.tags?.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">标签</h3>
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => <span key={tag} className="rounded-lg bg-gray-100/80 px-2 py-1 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{tag}</span>)}
                </div>
              </div>
            ) : null}
            {template.referenceImageUrls?.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">参考图</h3>
                <div className="flex flex-wrap gap-2">
                  {template.referenceImageUrls.map((url) => <img key={url} src={url} alt="参考图" className="h-16 w-16 rounded-xl object-cover" />)}
                </div>
              </div>
            ) : null}
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">提示词</h3>
              <p className="h-80 overflow-y-auto overscroll-contain rounded-xl bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap dark:bg-white/[0.03] dark:text-gray-300">{template.prompt}</p>
            </div>
          </div>
          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/[0.08]">
            <button type="button" onClick={onUse} className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600">一键做同款</button>
          </div>
        </div>
      </section>
    </div>
  )
}
