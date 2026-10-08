import { invoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core'
import type { AgentConversation, TaskRecord, StoredImage, StoredImageThumbnail } from '../types'
import { base64ToBytes, bytesToBase64 } from './dataUrl'

// 与 src-tauri/src/storage/images.rs 中的 RAW_DATA_URL_MIME 保持一致
const RAW_DATA_URL_MIME = 'text/x-data-url'

type FileMeta = {
  mime: string
  width: number | null
  height: number | null
  source: StoredImage['source'] | null
  createdAt: number | null
  thumbnailVersion: number | null
}

/** Rust 侧返回 { code, message }，转成带 code 的 Error，便于上层沿用现有的错误处理 */
export async function call<T>(cmd: string, args?: InvokeArgs, opts?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(cmd, args, opts)
  } catch (err) {
    const info = err as { code?: string; message?: string } | string | null
    if (typeof info === 'object' && info?.message) throw Object.assign(new Error(info.message), { code: info.code })
    throw new Error(String(err))
  }
}

const toDocs = (items: Array<{ id: string }>) => items.map((item) => ({ id: item.id, data: JSON.stringify(item) }))

/**
 * base64 dataUrl 解码成二进制。读回时会重新编码成规范 base64，因此只接受规范形式，
 * 保证读回的 dataUrl 与原串完全一致（图片 id 是原串的哈希）；其他情况按原文保存，读取时原样返回
 */
export function dataUrlToPayload(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const raw = { mime: RAW_DATA_URL_MIME, bytes: new TextEncoder().encode(dataUrl) }
  const comma = dataUrl.indexOf(',')
  const head = comma > 0 ? dataUrl.slice(0, comma) : ''
  if (!head.startsWith('data:') || !head.endsWith(';base64')) return raw
  const mime = head.slice(5, -7)
  // mime 会放进请求头：只接受可打印 ASCII，且首尾不能有空格（请求头会去掉首尾空白）
  if (!/^[!-~]([ -~]*[!-~])?$/.test(mime) || mime === RAW_DATA_URL_MIME) return raw
  const base64 = dataUrl.slice(comma + 1)
  if (base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return raw
  const bytes = base64ToBytes(base64)
  // 字符集和长度合规后，只有末尾一组可能含非零的多余比特，重新编码末尾一组即可确认是否规范
  const tailLen = 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  if (base64 && bytesToBase64(bytes.subarray(bytes.length - tailLen)) !== base64.slice(-4)) return raw
  return { mime, bytes }
}

export function payloadToDataUrl(mime: string, bytes: Uint8Array): string {
  if (mime === RAW_DATA_URL_MIME) return new TextDecoder().decode(bytes)
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/** 响应格式：4 字节小端 JSON 长度 + 元数据 JSON + 文件内容；空响应表示不存在 */
function decodeFile(res: ArrayBuffer): { meta: FileMeta; dataUrl: string } | undefined {
  const buf = new Uint8Array(res)
  if (!buf.length) return undefined
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true)
  const meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len))) as FileMeta
  return { meta, dataUrl: payloadToDataUrl(meta.mime, buf.subarray(4 + len)) }
}

/** 元数据可能来自外部备份：非有限数值和未知 source 直接忽略；id 可能含任意字符，编码后再放进请求头 */
function putFile(cmd: string, id: string, dataUrl: string, meta: Record<string, unknown>) {
  const payload = dataUrlToPayload(dataUrl)
  const headers: Record<string, string> = { 'x-id': encodeURIComponent(id), 'x-mime': payload.mime }
  for (const [key, value] of Object.entries(meta)) {
    if (Number.isFinite(value)) headers[`x-${key}`] = String(value)
  }
  if (meta.source === 'upload' || meta.source === 'generated' || meta.source === 'mask') headers['x-source'] = meta.source
  return call<null>(cmd, payload.bytes, { headers })
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return call('tasks_get_all')
}

export async function putTask(task: TaskRecord): Promise<IDBValidKey> {
  await call('task_put', { id: task.id, data: JSON.stringify(task) })
  return task.id
}

export async function deleteTask(id: string): Promise<undefined> {
  await call('task_delete', { id })
  return undefined
}

export async function commitTaskDeletion(deletedTaskIds: string[], updatedTasks: TaskRecord[], updatedConversations: AgentConversation[]): Promise<undefined> {
  await call('tasks_commit_deletion', { deletedIds: deletedTaskIds, tasks: toDocs(updatedTasks), conversations: toDocs(updatedConversations) })
  return undefined
}

export async function clearTasks(): Promise<undefined> {
  await call('tasks_clear')
  return undefined
}

// ===== Agent conversations =====

export function getAllAgentConversations(): Promise<AgentConversation[]> {
  return call('conversations_get_all')
}

export async function putAgentConversation(conversation: AgentConversation): Promise<IDBValidKey> {
  await call('conversation_put', { id: conversation.id, data: JSON.stringify(conversation) })
  return conversation.id
}

export async function clearAgentConversations(): Promise<undefined> {
  await call('conversations_clear')
  return undefined
}

export async function replaceAgentConversations(conversations: AgentConversation[]): Promise<undefined> {
  await call('conversations_replace', { conversations: toDocs(conversations) })
  return undefined
}

// ===== Images =====

export async function getImage(id: string): Promise<StoredImage | undefined> {
  const file = decodeFile(await call<ArrayBuffer>('image_get', { id }))
  if (!file) return undefined
  return {
    id,
    dataUrl: file.dataUrl,
    createdAt: file.meta.createdAt ?? undefined,
    source: file.meta.source ?? undefined,
    width: file.meta.width ?? undefined,
    height: file.meta.height ?? undefined,
  }
}

export async function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const file = decodeFile(await call<ArrayBuffer>('thumbnail_get', { id }))
  if (!file) return undefined
  return {
    id,
    thumbnailDataUrl: file.dataUrl,
    width: file.meta.width ?? undefined,
    height: file.meta.height ?? undefined,
    thumbnailVersion: file.meta.thumbnailVersion ?? undefined,
  }
}

export async function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  await putFile('thumbnail_put', thumbnail.id, thumbnail.thumbnailDataUrl, {
    width: thumbnail.width,
    height: thumbnail.height,
    'thumbnail-version': thumbnail.thumbnailVersion,
  })
  return thumbnail.id
}

/** 不提供一次性读取全部原图的命令，按 id 逐个读取 */
export async function getAllImages(): Promise<StoredImage[]> {
  const images: StoredImage[] = []
  for (const id of await getAllImageIds()) {
    const image = await getImage(id)
    if (image) images.push(image)
  }
  return images
}

export function getAllImageIds(): Promise<string[]> {
  return call('image_ids')
}

export async function putImage(image: StoredImage): Promise<IDBValidKey> {
  await putFile('image_put', image.id, image.dataUrl, {
    width: image.width,
    height: image.height,
    source: image.source,
    'created-at': image.createdAt,
  })
  return image.id
}

export async function deleteImage(id: string): Promise<undefined> {
  await call('image_delete', { id })
  return undefined
}

export async function clearImages(): Promise<undefined> {
  await call('images_clear')
  return undefined
}

/** 与 Rust 侧 StorageInfo 对应，设置页“数据管理”中展示 */
export type StorageInfo = {
  dataDir: string
  dbBytes: number
  imageBytes: number
  imageCount: number
  thumbnailBytes: number
}

export function getStorageInfo(): Promise<StorageInfo> {
  return call('storage_info')
}

export async function openStorageDir(): Promise<void> {
  await call('storage_open_dir')
}
