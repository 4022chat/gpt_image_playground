import { useMemo, useRef, useState } from 'react'
import type { PromptTemplate } from '../types'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon, RefreshIcon } from './icons'
import PromptTemplateDetailModal from './PromptTemplateDetailModal'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return undefined
  return value
}

function normalizeTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) throw new Error('JSON 顶层必须是数组')
  const templates: PromptTemplate[] = []

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.prompt !== 'string') {
      throw new Error('JSON 条目必须包含字符串类型的 id、title 和 prompt')
    }
    if (item.description !== undefined && typeof item.description !== 'string') throw new Error('description 必须是字符串')
    if (item.coverUrl !== undefined && typeof item.coverUrl !== 'string') throw new Error('coverUrl 必须是字符串')
    const referenceImageUrls = normalizeStringArray(item.referenceImageUrls)
    const tags = normalizeStringArray(item.tags)
    if (item.referenceImageUrls !== undefined && !referenceImageUrls) throw new Error('referenceImageUrls 必须是字符串数组')
    if (item.tags !== undefined && !tags) throw new Error('tags 必须是字符串数组')
    templates.push({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      ...(typeof item.coverUrl === 'string' ? { coverUrl: item.coverUrl } : {}),
      ...(referenceImageUrls ? { referenceImageUrls } : {}),
      ...(tags ? { tags } : {}),
    })
  }

  return templates
}

export async function fetchTemplates(jsonUrl: string) {
  const response = await fetch(jsonUrl)
  if (!response.ok) throw new Error(`请求失败 (${response.status})`)
  return normalizeTemplates(await response.json())
}

export function PromptTemplatesModal() {
  const promptLibraryModalOpen = useStore((s) => s.promptLibraryModalOpen)
  const setPromptLibraryModalOpen = useStore((s) => s.setPromptLibraryModalOpen)
  const promptSources = useStore((s) => s.promptSources)
  const setPrompt = useStore((s) => s.setPrompt)
  const setAppMode = useStore((s) => s.setAppMode)
  const setPromptSourceTemplates = useStore((s) => s.setPromptSourceTemplates)
  const showToast = useStore((s) => s.showToast)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [showTagFilter, setShowTagFilter] = useState(false)
  const [syncingDefaultSource, setSyncingDefaultSource] = useState(false)
  const templateListRef = useRef<HTMLDivElement>(null)
  const tagFilterRef = useRef<HTMLDivElement>(null)
  const templates = useMemo(() => promptSources.flatMap((source) => source.enabled ? source.templates : []), [promptSources])
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const template of templates) {
      for (const tag of template.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return new Map([...counts].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')))
  }, [templates])
  const tags = useMemo(() => [...tagCounts.keys()], [tagCounts])
  const activeTag = selectedTag && tagCounts.has(selectedTag) ? selectedTag : null
  const filteredTemplates = activeTag ? templates.filter((template) => template.tags?.includes(activeTag)) : templates
  const defaultSource = promptSources.find((source) => source.id === 'zaoju-expression')
  const canSyncDefaultSource = templates.length === 0 && defaultSource?.enabled && defaultSource.templates.length === 0

  const onClose = () => {
    setSelectedTemplate(null)
    setShowTagFilter(false)
    setPromptLibraryModalOpen(false)
  }

  const useTemplate = (template: PromptTemplate) => {
    setPrompt(template.prompt)
    onClose()
    setAppMode('gallery')
  }

  const syncDefaultSource = async () => {
    if (!defaultSource) return
    setSyncingDefaultSource(true)
    try {
      const syncedTemplates = await fetchTemplates(defaultSource.jsonUrl)
      setPromptSourceTemplates(defaultSource.id, syncedTemplates)
      showToast(`已同步 ${syncedTemplates.length} 条 案例`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? `同步失败：${error.message}` : '同步失败', 'error')
    } finally {
      setSyncingDefaultSource(false)
    }
  }

  useCloseOnEscape(promptLibraryModalOpen, onClose)
  useCloseOnEscape(showTagFilter, () => setShowTagFilter(false))
  usePreventBackgroundScroll(promptLibraryModalOpen && !selectedTemplate, [templateListRef, tagFilterRef])

  if (!promptLibraryModalOpen) return null

  return (
    <div data-no-drag-select className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" />
      <section className="relative flex h-[min(52rem,calc(100vh-1.5rem))] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 sm:h-[min(52rem,calc(100vh-3rem))]" onClick={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b border-gray-100 p-5 dark:border-white/[0.08]">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">提示词模板库</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">已启用来源共 {templates.length} 条模板</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { onClose(); setAppMode('prompt-library') }} className="rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]">提示词管理</button>
            <button type="button" onClick={onClose} className="rounded-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white" aria-label="关闭模板库">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-white/[0.08]">
          <button type="button" onClick={() => { setSelectedTag(null); setShowTagFilter(false) }} aria-pressed={activeTag === null} className={`inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${activeTag === null ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'}`}>
            <span className="truncate">{activeTag ?? '全部'}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeTag === null ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400'}`}>{activeTag ? tagCounts.get(activeTag) : templates.length}</span>
          </button>
          <button type="button" onClick={() => setShowTagFilter(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gray-100/80 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
            筛选标签
            <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">{tags.length}</span>
          </button>
        </div>
        {showTagFilter && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 p-3 backdrop-blur-sm dark:bg-black/60 sm:items-center sm:p-6" onClick={() => setShowTagFilter(false)}>
            <div ref={tagFilterRef} className="flex max-h-[min(32rem,calc(100vh-2rem))] w-full flex-col overflow-hidden rounded-t-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 sm:max-w-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
              <header className="flex shrink-0 items-center justify-between border-b border-gray-100 p-5 dark:border-white/[0.08]">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">筛选标签</h3>
                <button type="button" onClick={() => setShowTagFilter(false)} className="rounded-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white" aria-label="关闭标签筛选">
                  <CloseIcon className="h-5 w-5" />
                </button>
              </header>
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[null, ...tags].map((tag) => {
                    const isActive = activeTag === tag
                    return (
                      <button key={tag ?? 'all'} type="button" onClick={() => { setSelectedTag(tag); setShowTagFilter(false) }} aria-pressed={isActive} className={`inline-flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'}`}>
                        <span className="truncate">{tag ?? '全部'}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400'}`}>{tag ? tagCounts.get(tag) : templates.length}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={templateListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">{templates.length === 0 ? '暂无已启用来源的提示词模板。' : '当前标签下没有提示词模板。'}</p>
              {canSyncDefaultSource && <button type="button" onClick={() => void syncDefaultSource()} disabled={syncingDefaultSource} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"><RefreshIcon className="h-4 w-4" />{syncingDefaultSource ? '同步中' : '同步默认案例'}</button>}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {filteredTemplates.map((template) => (
                <article key={`${template.sourceId}-${template.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-1 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                  {template.coverUrl && <button type="button" onClick={() => setSelectedTemplate(template)} className="block w-full overflow-hidden rounded-xl" aria-label={`查看 ${template.title} 详情`}><img src={template.coverUrl} alt={template.title} className="aspect-[16/9] w-full object-cover transition-transform hover:scale-[1.02]" /></button>}
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{template.title}</h3>
                    {template.description && <p className="line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{template.description || '暂无描述'}</p>}
                    {template.tags?.length ? <div className="flex h-7 gap-1.5 overflow-hidden">{template.tags.map((tag) => <span key={tag} className="shrink-0 rounded-lg bg-gray-100/80 px-2 py-1 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{tag}</span>)}</div> : null}
                    {template.referenceImageUrls?.length ? <div className="flex gap-2 overflow-x-auto">{template.referenceImageUrls.map((url) => <img key={url} src={url} alt="参考图" className="h-14 w-14 shrink-0 rounded-xl object-cover" />)}</div> : null}
                    <button type="button" onClick={() => useTemplate(template)} className="mt-auto rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600">一键做同款</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      {selectedTemplate && <PromptTemplateDetailModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onUse={() => useTemplate(selectedTemplate)} />}
    </div>
  )
}
