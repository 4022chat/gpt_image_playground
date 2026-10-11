// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../types'

const calls = vi.hoisted(() => [] as string[])
const installUpdate = vi.hoisted(() => vi.fn(async () => { calls.push('install') }))
const downloadUpdate = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))
const getReadyUpdate = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null))

vi.mock('../lib/clientUpdate', () => ({
  downloadUpdate,
  getReadyUpdate,
  installUpdate,
}))
vi.mock('../lib/tauriStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tauriStorage')>()),
  flushTauriStorageBeforeExit: vi.fn(async () => { calls.push('flush') }),
}))

const { requestClientUpdateInstall, startClientUpdateDownload, startClientUpdateInstall, useClientUpdate } = await import('./useClientUpdate')
const { useStore } = await import('../store')

const runningTask = { id: 't', status: 'running', prompt: 'p' } as TaskRecord

describe('client update install', () => {
  beforeEach(() => {
    calls.length = 0
    installUpdate.mockClear()
    downloadUpdate.mockClear()
    useClientUpdate.setState({ status: 'ready', readyVersion: '1.2.0', error: '' })
    useStore.setState({ tasks: [], agentConversations: [], batchProgress: null, confirmDialog: null })
  })

  it('安装前先写入尚未保存的设置', async () => {
    await startClientUpdateInstall()
    expect(calls).toEqual(['flush', 'install'])
  })

  it('没有进行中的操作且已下载最新版本时直接安装', async () => {
    requestClientUpdateInstall('1.2.0')
    await vi.waitFor(() => expect(installUpdate).toHaveBeenCalled())
    expect(useStore.getState().confirmDialog).toBeNull()
  })

  it('有进行中的任务或批量未全部开始时先确认，确认后才安装', async () => {
    useStore.setState({ tasks: [runningTask] })
    requestClientUpdateInstall('1.2.0')
    const dialog = useStore.getState().confirmDialog
    expect(dialog?.message).toContain('中断')
    expect(installUpdate).not.toHaveBeenCalled()
    dialog?.action?.()
    await vi.waitFor(() => expect(calls).toEqual(['flush', 'install']))

    useStore.setState({ tasks: [], batchProgress: { total: 3, started: 1, finished: 0 }, confirmDialog: null })
    requestClientUpdateInstall('1.2.0')
    expect(useStore.getState().confirmDialog?.title).toBe('安装更新')
  })

  it('已下载的版本过旧时，取消保留安装包，也可改为下载新版本', async () => {
    requestClientUpdateInstall('1.3.0')
    const buttons = useStore.getState().confirmDialog?.buttons ?? []
    expect(buttons.map((b) => b.label)).toEqual(['取消', '下载新版本', '继续安装'])
    buttons[0].action()
    expect(useClientUpdate.getState()).toMatchObject({ status: 'ready', readyVersion: '1.2.0' })
    expect(installUpdate).not.toHaveBeenCalled()
    buttons[1].action()
    expect(downloadUpdate).toHaveBeenCalledWith('1.3.0', expect.any(Function))
  })

  it('已下载的版本过旧且有进行中的操作时，提醒会中断并以警示色显示“继续安装”', () => {
    useStore.setState({ tasks: [runningTask] })
    requestClientUpdateInstall('1.3.0')
    const dialog = useStore.getState().confirmDialog
    expect(dialog?.message).toContain('已下载的是 v1.2.0')
    expect(dialog?.message).toContain('中断')
    expect(dialog?.buttons?.find((b) => b.label === '继续安装')?.tone).toBe('warning')
  })

  it('下载失败后按磁盘上的实际情况显示安装包状态', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    downloadUpdate.mockRejectedValueOnce(new Error('网络错误'))
    getReadyUpdate.mockResolvedValueOnce('1.2.0')
    await startClientUpdateDownload('1.3.0')
    expect(useClientUpdate.getState()).toMatchObject({ status: 'ready', readyVersion: '1.2.0', error: '网络错误' })
  })
})
