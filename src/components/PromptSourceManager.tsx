import { useState, type SyntheticEvent } from 'react'
import type { PromptSource } from '../types'
import { useStore } from '../store'
import { fetchTemplates } from './PromptLibrary'
import { EditIcon, LinkIcon, PlusIcon, RefreshIcon, TrashIcon } from './icons'

interface SourceForm {
  name: string
  jsonUrl: string
  homepageUrl: string
  enabled: boolean
}

const EMPTY_SOURCE_FORM: SourceForm = {
  name: '',
  jsonUrl: '',
  homepageUrl: '',
  enabled: true,
}

function formatFetchedAt(lastFetchedAt?: number) {
  if (!lastFetchedAt) return '尚未拉取'
  return new Date(lastFetchedAt).toLocaleString('zh-CN', { hour12: false })
}

export default function PromptSourceManager() {
  const promptSources = useStore((s) => s.promptSources)
  const addPromptSource = useStore((s) => s.addPromptSource)
  const updatePromptSource = useStore((s) => s.updatePromptSource)
  const deletePromptSource = useStore((s) => s.deletePromptSource)
  const restoreDefaultPromptSources = useStore((s) => s.restoreDefaultPromptSources)
  const setPromptSourceEnabled = useStore((s) => s.setPromptSourceEnabled)
  const setPromptSourceTemplates = useStore((s) => s.setPromptSourceTemplates)
  const showToast = useStore((s) => s.showToast)
  const [form, setForm] = useState<SourceForm | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const setPromptLibraryModalOpen = useStore((s) => s.setPromptLibraryModalOpen)
  const enabledTemplateCount = promptSources.reduce((count, source) => count + (source.enabled ? source.templates.length : 0), 0)

  const openEdit = (source: PromptSource) => {
    setEditingId(source.id)
    setForm({
      name: source.name,
      jsonUrl: source.jsonUrl,
      homepageUrl: source.homepageUrl ?? '',
      enabled: source.enabled,
    })
  }

  const closeForm = () => {
    setEditingId(null)
    setForm(null)
  }

  const submitForm = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    const name = form.name.trim()
    const jsonUrl = form.jsonUrl.trim()
    const homepageUrl = form.homepageUrl.trim()
    if (!name || !jsonUrl) {
      showToast('请填写来源名称和 JSON URL', 'error')
      return
    }
    const source = {
      name,
      jsonUrl,
      homepageUrl: homepageUrl || undefined,
      enabled: form.enabled,
    }
    if (editingId) updatePromptSource(editingId, source)
    else addPromptSource(source)
    closeForm()
  }

  const fetchSource = async (source: PromptSource) => {
    if (!source.jsonUrl.trim()) {
      showToast('请先填写 JSON URL', 'error')
      return
    }
    setFetchingId(source.id)
    try {
      const templates = await fetchTemplates(source.jsonUrl)
      setPromptSourceTemplates(source.id, templates)
      showToast(`已拉取 ${templates.length} 条提示词`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? `拉取失败：${error.message}` : '拉取失败', 'error')
    } finally {
      setFetchingId(null)
    }
  }

  return (
    <main data-home-main className="pb-6 pt-4">
      <div className="safe-area-x mx-auto max-w-7xl">
        <section className="space-y-4 rounded-3xl border border-white/50 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 dark:border-white/[0.08]">
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">提示词来源管理</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">配置、启用并拉取提示词来源。</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPromptLibraryModalOpen(true)} className="rounded-xl bg-gray-100/80 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]">模板库 {enabledTemplateCount}</button>
              <button type="button" onClick={() => { const count = promptSources.length; restoreDefaultPromptSources(); const restored = useStore.getState().promptSources.length - count; showToast(restored ? `已恢复 ${restored} 个默认来源` : '默认来源已完整', 'success') }} className="inline-flex items-center gap-2 rounded-xl bg-gray-100/80 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"><RefreshIcon className="h-4 w-4" />恢复默认</button>
              <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_SOURCE_FORM) }} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"><PlusIcon className="h-4 w-4" />新增</button>
            </div>
          </div>

          {form && (
            <form onSubmit={submitForm} className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02] sm:grid-cols-2">
              <label className="text-sm text-gray-600 dark:text-gray-300">来源名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50" /></label>
              <label className="text-sm text-gray-600 dark:text-gray-300">JSON URL<input value={form.jsonUrl} onChange={(event) => setForm({ ...form, jsonUrl: event.target.value })} type="url" className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50" /></label>
              <label className="text-sm text-gray-600 dark:text-gray-300">来源主页（可选）<input value={form.homepageUrl} onChange={(event) => setForm({ ...form, homepageUrl: event.target.value })} type="url" className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50" /></label>
              <label className="flex items-end gap-2 pb-2 text-sm text-gray-600 dark:text-gray-300"><input checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} type="checkbox" className="h-4 w-4 accent-blue-500" />启用此来源</label>
              <div className="flex gap-2 sm:col-span-2"><button type="submit" className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600">保存</button><button type="button" onClick={closeForm} className="rounded-xl bg-gray-100/80 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">取消</button></div>
            </form>
          )}

          <section className="space-y-3">
            {promptSources.length === 0 ? (
              <p className="py-6 text-sm text-gray-500 dark:text-gray-400">还没有提示词来源。</p>
            ) : promptSources.map((source) => (
              <div key={source.id} className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-gray-800 dark:text-gray-100">{source.name}</strong><span className="text-xs text-gray-500 dark:text-gray-400">{source.templates.length} 条 · {formatFetchedAt(source.lastFetchedAt)}</span></div><p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{source.homepageUrl || '未填写 JSON URL'}</p></div>
                <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input checked={source.enabled} onChange={(event) => setPromptSourceEnabled(source.id, event.target.checked)} type="checkbox" className="h-4 w-4 accent-blue-500" />启用</label>{source.homepageUrl && <a href={source.homepageUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-gray-100/80 p-2 text-gray-600 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]" title="打开来源主页"><LinkIcon className="h-4 w-4" /></a>}<button type="button" onClick={() => void fetchSource(source)} disabled={fetchingId === source.id} className="inline-flex items-center gap-1 rounded-xl bg-gray-100/80 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"><RefreshIcon className="h-4 w-4" />{fetchingId === source.id ? '拉取中' : '立即拉取'}</button><button type="button" onClick={() => openEdit(source)} className="rounded-xl bg-gray-100/80 p-2 text-gray-600 transition-colors hover:bg-gray-200/80 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]" title="编辑来源"><EditIcon className="h-4 w-4" /></button><button type="button" onClick={() => deletePromptSource(source.id)} className="rounded-xl bg-red-50 p-2 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20" title="删除来源"><TrashIcon className="h-4 w-4" /></button></div>
              </div>
            ))}
          </section>
        </section>
      </div>
    </main>
  )
}
