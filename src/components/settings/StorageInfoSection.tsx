import { useEffect, useState } from 'react'
import { getStorageInfo, openStorageDir, type StorageInfo } from '../../lib/dbTauri'
import { formatBytes } from '../../lib/formatBytes'
import { useStore } from '../../store'

/** 仅客户端：显示本地数据目录与占用空间 */
export default function StorageInfoSection() {
  const showToast = useStore((s) => s.showToast)
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStorageInfo()
      .then(setInfo)
      .catch((err) => {
        console.error('读取存储信息失败：', err)
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  const handleOpen = async () => {
    try {
      await openStorageDir()
    } catch (err) {
      console.error('打开数据目录失败：', err)
      showToast(err instanceof Error ? err.message : '打开数据目录失败', 'error')
    }
  }

  const rows = info
    ? [
        ['数据库', formatBytes(info.dbBytes)],
        ['原图', `${formatBytes(info.imageBytes)}（${info.imageCount} 张）`],
        ['缩略图', formatBytes(info.thumbnailBytes)],
      ]
    : []

  return (
    <div className="rounded-2xl border border-transparent bg-black/[0.04] p-4 dark:bg-white/[0.06] space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">本地存储</h4>
      </div>
      {error ? (
        <p className="text-xs text-red-500 dark:text-red-400 break-all">{error}</p>
      ) : (
        <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="break-all select-text">
            <span className="text-gray-600 dark:text-gray-300">数据目录：</span>
            {info?.dataDir ?? '读取中...'}
          </div>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {rows.map(([label, value]) => (
                <span key={label}>
                  <span className="text-gray-600 dark:text-gray-300">{label}：</span>
                  {value}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        onClick={handleOpen}
        disabled={Boolean(error)}
        className="w-full rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 disabled:hover:bg-gray-100/80 disabled:hover:text-gray-700 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:disabled:hover:bg-white/[0.06] dark:disabled:hover:text-gray-300 flex items-center justify-center gap-2"
      >
        打开数据目录
      </button>
    </div>
  )
}
