import { create } from 'zustand'
import type { UpdateProgress } from '../lib/clientUpdate'
import { discardUpdate, downloadUpdate, getReadyUpdate, installUpdate } from '../lib/clientUpdate'

interface ClientUpdateState {
  status: 'idle' | 'downloading' | 'ready' | 'installing'
  progress: UpdateProgress | null
  // 本地有效安装包的版本，可能低于弹窗中的最新版本
  readyVersion: string
  error: string
}

/** 客户端应用内更新的状态；放在模块级 store 中，关闭弹窗后下载继续，再次打开仍能看到进度 */
export const useClientUpdate = create<ClientUpdateState>(() => ({
  status: 'idle',
  progress: null,
  readyVersion: '',
  error: '',
}))

const errorMessage = (err: unknown) => err instanceof Error ? err.message : String(err)

const isBusy = () => {
  const status = useClientUpdate.getState().status
  return status === 'downloading' || status === 'installing'
}

async function readReady() {
  try {
    return await getReadyUpdate()
  } catch (err) {
    console.warn('检查本地更新包失败：', err)
    return null
  }
}

/** 打开弹窗时检查本地是否已有校验通过的安装包，有则直接显示“安装” */
export async function refreshClientUpdate() {
  if (isBusy()) return
  const version = await readReady()
  // 校验期间可能已开始下载或安装，此时不能用旧结果覆盖状态
  if (isBusy()) return
  useClientUpdate.setState({ status: version ? 'ready' : 'idle', readyVersion: version ?? '', error: '' })
}

export async function startClientUpdateDownload(version: string) {
  useClientUpdate.setState({ status: 'downloading', progress: null, error: '' })
  try {
    await downloadUpdate(version, (progress) => useClientUpdate.setState({ progress }))
    useClientUpdate.setState({ status: 'ready', readyVersion: version })
  } catch (err) {
    console.warn('下载客户端更新失败：', err)
    useClientUpdate.setState({ status: 'idle', error: errorMessage(err) })
  }
}

export async function startClientUpdateInstall() {
  useClientUpdate.setState({ status: 'installing', error: '' })
  try {
    // 成功时应用会退出并由安装程序重新打开，不会返回
    await installUpdate()
  } catch (err) {
    console.warn('安装客户端更新失败：', err)
    // 安装包可能已在 Rust 侧校验失败并被删除，重新确认后决定显示“安装”还是“下载”
    const version = await readReady()
    useClientUpdate.setState({ status: version ? 'ready' : 'idle', readyVersion: version ?? '', error: errorMessage(err) })
  }
}

/** 放弃安装已下载的旧版本：删除安装包，按钮回到“下载” */
export async function discardClientUpdate() {
  try {
    await discardUpdate()
    useClientUpdate.setState({ status: 'idle', readyVersion: '', error: '' })
  } catch (err) {
    console.warn('删除客户端更新包失败：', err)
    useClientUpdate.setState({ error: errorMessage(err) })
  }
}
