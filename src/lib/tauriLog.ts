import { invoke } from '@tauri-apps/api/core'
import { attachLogger, error as logError, LogLevel, warn as logWarn } from '@tauri-apps/plugin-log'

// 单条日志的长度上限，避免把图片 data URL 等大对象整个写进日志文件
const MAX_MESSAGE_LENGTH = 10000

function format(args: unknown[]) {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg
    if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
    try {
      return JSON.stringify(arg) ?? String(arg)
    } catch {
      return String(arg)
    }
  }).join(' ').slice(0, MAX_MESSAGE_LENGTH)
    // 日志文件可能被附在反馈中，遮盖 API 密钥；控制台仍原样打印
    .replace(/(Bearer\s+|\bsk-)[A-Za-z0-9._-]{8,}/g, '$1***')
}

function write(send: typeof logWarn, args: unknown[]) {
  // 写入失败时不能再调用 console，否则会被包装函数再次转发
  void send(format(args)).catch(() => {})
}

/**
 * 客户端启动时尽早调用：console.warn / console.error 照常打印到控制台，同时写入日志文件；
 * 未捕获的异常和未处理的 Promise 拒绝也一并记录
 */
export function installTauriLog() {
  const rawWarn = console.warn.bind(console)
  const rawError = console.error.bind(console)

  console.warn = (...args) => {
    rawWarn(...args)
    write(logWarn, args)
  }
  console.error = (...args) => {
    rawError(...args)
    write(logError, args)
  }
  window.addEventListener('error', (e) => write(logError, ['未捕获的异常：', e.error ?? e.message]))
  window.addEventListener('unhandledrejection', (e) => write(logError, ['未处理的 Promise 拒绝：', e.reason]))

  // Rust 侧日志转发到控制台时用原始 console 打印，不经过上面的包装，避免再写回插件形成回环
  void attachLogger(({ level, message }) => (level === LogLevel.Error ? rawError : rawWarn)(message))
    .catch((err) => rawError('监听 Rust 日志失败：', err))
}

/** 开关由 Rust 侧的文件 target 统一拦截，前端日志照常发送，关闭后只是不写入文件 */
export function setTauriLogEnabled(value: boolean) {
  void invoke('log_set_enabled', { enabled: value }).catch((err) => console.warn('切换日志记录失败：', err))
}

export async function openTauriLogDir() {
  await invoke('log_open_dir')
}
