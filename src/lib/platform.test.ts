import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from './platform'

const tauriFetch = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: tauriFetch }))

describe('apiFetch（客户端）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    tauriFetch.mockReset()
  })

  it('data: 和 blob: 地址走调用时的全局 fetch', async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', nativeFetch)

    await apiFetch('data:text/plain,hi')
    await apiFetch('blob:http://tauri.localhost/abc')

    expect(nativeFetch).toHaveBeenCalledTimes(2)
    expect(tauriFetch).not.toHaveBeenCalled()
  })

  it('http/https 地址走插件，并清空 Origin', async () => {
    tauriFetch.mockResolvedValue(new Response('{"a":1}', { status: 201, headers: { 'Content-Type': 'application/json' } }))

    const res = await apiFetch('https://api.example.com/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer k' } })

    const init = tauriFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('Origin')).toBe('')
    expect(headers.get('Authorization')).toBe('Bearer k')
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ a: 1 })
  })

  it('保留 res.url，传入 Headers 实例时与 Origin 正确合并', async () => {
    const pluginRes = new Response('ok')
    Object.defineProperty(pluginRes, 'url', { value: 'https://cdn.example.com/final.png' })
    tauriFetch.mockResolvedValue(pluginRes)

    const res = await apiFetch('https://api.example.com/a.png', { headers: new Headers({ 'X-Key': 'k' }) })

    const headers = (tauriFetch.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('X-Key')).toBe('k')
    expect(headers.get('Origin')).toBe('')
    expect(res.url).toBe('https://cdn.example.com/final.png')
  })

  it('网络失败转换为 TypeError', async () => {
    tauriFetch.mockRejectedValue('error sending request')

    await expect(apiFetch('http://127.0.0.1:1/v1')).rejects.toThrow(TypeError)
  })

  it('取消时抛出 AbortError，包括读取响应体期间', async () => {
    const controller = new AbortController()
    controller.abort()
    tauriFetch.mockRejectedValue(new Error('Request cancelled'))
    await expect(apiFetch('https://api.example.com', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })

    const streamController = new AbortController()
    const body = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        ctrl.enqueue(new TextEncoder().encode('data: 1\n\n'))
        streamController.signal.addEventListener('abort', () => ctrl.error('Request cancelled'))
      },
    })
    tauriFetch.mockResolvedValue(new Response(body))
    const res = await apiFetch('https://api.example.com', { signal: streamController.signal })
    const reader = res.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: 1\n\n')
    const pending = reader.read()
    streamController.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
