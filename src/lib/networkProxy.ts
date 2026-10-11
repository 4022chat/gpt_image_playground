import { invoke } from '@tauri-apps/api/core'

/** 仅客户端：网络代理设置，保存在本机数据库中，不随备份导出 */
export type ProxyMode = 'system' | 'none' | 'custom'

export interface ProxySetting {
  mode: ProxyMode
  url: string
}

export function getProxySetting() {
  return invoke<ProxySetting>('proxy_get')
}

/** 地址不合法时以错误文案拒绝，不保存也不应用；成功时返回规范化后的设置 */
export function setProxySetting(setting: ProxySetting) {
  return invoke<ProxySetting>('proxy_set', { mode: setting.mode, url: setting.url })
}
