import type { ReactNode } from 'react'
import { trackDataTransfer } from '../../lib/dataOperations'
import { formatBytes } from '../../lib/formatBytes'
import { copyTextToClipboard, getClipboardFailureMessage } from '../../lib/clipboard'
import { changeDefaultSaveDir, migrateDefaultSaveDir, type MoveIssue, type MoveReport } from '../../lib/saveFile'
import { useStore } from '../../store'
import { CopyIcon } from '../icons'

// 与首次保存询问弹窗中的地址框一致；更改数据目录的确认框也使用
export function PathBox({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div data-selectable-text className="space-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2.5 text-xs leading-relaxed dark:bg-white/[0.04]">
      {rows.map(([label, path]) => (
        <div key={label} className="flex gap-3">
          <span className="shrink-0 text-gray-400 dark:text-gray-500">{label}</span>
          <span className="min-w-0 break-all text-gray-600 dark:text-gray-300">{path}</span>
        </div>
      ))}
    </div>
  )
}

// 条目多时限高滚动；右上角按钮复制全部路径，每行一条
function IssueList({ title, items }: { title: string, items: MoveIssue[] }) {
  const copy = async () => {
    try {
      await copyTextToClipboard(items.map((item) => item.path).join('\n'))
      useStore.getState().showToast('已复制全部路径', 'success')
    } catch (err) {
      useStore.getState().showToast(getClipboardFailureMessage('复制失败', err), 'error')
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{title}</div>
      <div className="relative rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
        <ul data-selectable-text className="custom-scrollbar max-h-48 space-y-2 overflow-y-auto overscroll-contain py-2.5 pl-3 pr-10 text-xs leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>
              <div className="break-all text-gray-600 dark:text-gray-300">{item.path}</div>
              <div className="break-all text-gray-400 dark:text-gray-500">{item.error}</div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void copy()}
          title="复制全部路径"
          aria-label="复制全部路径"
          className="absolute right-1.5 top-1.5 rounded-lg p-1.5 text-gray-400 transition hover:bg-black/[0.05] hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
        >
          <CopyIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function showResult(report: MoveReport) {
  const store = useStore.getState()
  if (!report.failed.length && !report.notRemoved.length) {
    store.showToast(`已将 ${report.moved} 项移动到新地址${report.renamed ? `，其中 ${report.renamed} 项因重名自动改名` : ''}`, 'success')
    return
  }
  const content: ReactNode = (
    <div className="space-y-3">
      {report.failed.length > 0 && <IssueList title={`未能移动，仍在原地址（${report.failed.length} 项）`} items={report.failed} />}
      {report.notRemoved.length > 0 && <IssueList title={`已复制到新地址，但原位置未能删除（${report.notRemoved.length} 项）`} items={report.notRemoved} />}
    </div>
  )
  store.setConfirmDialog({
    title: '迁移未全部完成',
    message: `已将 ${report.moved} 项移动到新地址，以下内容需要处理。可关闭占用它们的程序后手动移动或删除。`,
    content,
    confirmText: '我知道了',
    showCancel: false,
    tone: 'warning',
  })
}

/** 仅客户端：弹出目录选择框更改默认保存地址；原地址中有文件时询问是否迁移。返回新地址，取消时返回 null */
export async function changeSaveDirWithMigration() {
  const change = await changeDefaultSaveDir()
  if (!change?.previous) return change?.path ?? null
  const prev = change.previous
  const store = useStore.getState()
  if (prev.blocked) {
    store.setConfirmDialog({
      title: '无法迁移原有文件',
      message: `默认保存地址已更改，原有文件保持不动。\n${prev.blocked}。`,
      content: <PathBox rows={[['原地址', prev.path], ['新地址', change.path]]} />,
      confirmText: '我知道了',
      showCancel: false,
    })
    return change.path
  }
  store.setConfirmDialog({
    title: '迁移原有文件',
    message: `默认保存地址已更改。原地址中有 **${prev.files}** 个文件（${formatBytes(prev.bytes)}），是否一并移动到新地址？`,
    content: (
      <div className="space-y-3">
        <PathBox rows={[['原地址', prev.path], ['新地址', change.path]]} />
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          <span className="font-medium text-amber-600 dark:text-amber-400">将移动该文件夹中的全部内容</span>
          ，包括子文件夹以及与本应用无关的文件。同名文件自动加序号，不覆盖新地址中已有的文件；{prev.keepSource ? '原文件夹本身会保留。' : '原文件夹移空后会被删除。'}
        </p>
      </div>
    ),
    confirmText: '迁移',
    cancelText: '不迁移',
    busyText: '迁移中…',
    awaitAction: true,
    action: async () => {
      try {
        const report = await trackDataTransfer(() => migrateDefaultSaveDir())
        showResult(report)
        // 已换成结果对话框时不再关闭
        return !report.failed.length && !report.notRemoved.length
      } catch (err) {
        console.error('迁移原有文件失败：', err)
        useStore.getState().showToast(typeof err === 'string' ? err : '迁移原有文件失败', 'error')
        return true
      }
    },
  })
  return change.path
}
