import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './platform'

/** 客户端中用户选定的保存目录；token 对应 Rust 侧记下的目录，前端无法借此写入其他位置 */
export interface SaveDir {
  token: number
  path: string
}

// “文件保存位置”为“默认地址”时直接写入默认保存地址，由 App 按设置同步
let saveToDefaultDir = false

export function setSaveToDefaultDir(enabled: boolean) {
  saveToDefaultDir = enabled
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 以二进制请求体传给 Rust，避免几百 MB 的数据经过 base64 或 JSON 数组
const toBytes = async (data: Blob | Uint8Array) => data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data

/**
 * 保存单个文件：网页版触发浏览器下载；客户端弹出系统保存对话框，由 Rust 写入所选路径，
 * 或在“默认地址”模式下直接写入默认保存地址（同名自动加序号）。
 * 返回保存位置（网页版为文件名），用户取消时返回 null
 */
export async function saveFile(data: Blob | Uint8Array, fileName: string): Promise<string | null> {
  if (!isTauri) {
    triggerDownload(data instanceof Blob ? data : new Blob([data as BlobPart]), fileName)
    return fileName
  }
  if (saveToDefaultDir) return await saveFileToDir(await invoke<SaveDir>('download_dir_use'), data, fileName)
  return await invoke<string | null>('save_file', await toBytes(data), { headers: { 'x-name': encodeURIComponent(fileName) } })
}

/**
 * 仅客户端：弹出目录选择框，用于一次保存多个文件；用户取消时返回 null。
 * “默认地址”模式下不弹框，直接返回默认保存地址，地址不可用时抛出 Rust 给出的原因
 */
export function pickSaveDir() {
  return invoke<SaveDir | null>(saveToDefaultDir ? 'download_dir_use' : 'save_dir_pick')
}

/** 仅客户端：写入 pickSaveDir 选定的目录，已有同名文件时自动加序号，返回实际写入的完整路径 */
export async function saveFileToDir(dir: SaveDir, data: Blob | Uint8Array, fileName: string) {
  return await invoke<string>('save_dir_write', await toBytes(data), {
    headers: { 'x-name': encodeURIComponent(fileName), 'x-token': String(dir.token) },
  })
}

/** 仅客户端：默认保存地址，用于在设置中显示 */
export function getDefaultSaveDir() {
  return invoke<string>('download_dir_get')
}

/** 仅客户端：弹出目录选择框更改默认保存地址，返回新地址；用户取消时返回 null */
export function changeDefaultSaveDir() {
  return invoke<string | null>('download_dir_pick')
}

/** 仅客户端：在资源管理器中打开默认保存地址 */
export function openDefaultSaveDir() {
  return invoke<void>('download_dir_open')
}
