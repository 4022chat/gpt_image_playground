import type { ApiProfile } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage, type CallApiOptions, type CallApiResult } from './imageApiShared'

function dataUrlToPart(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error('输入图片必须是 Base64 data URL')
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  }
}

const GEMINI_SIZE_PRESETS: Record<string, { aspectRatio: string, imageSize: GeminiImageSize }> = {
  '1024x1024': { aspectRatio: '1:1', imageSize: '1K' },
  '1376x768': { aspectRatio: '16:9', imageSize: '1K' },
  '768x1376': { aspectRatio: '9:16', imageSize: '1K' },
  '1200x896': { aspectRatio: '4:3', imageSize: '1K' },
  '896x1200': { aspectRatio: '3:4', imageSize: '1K' },
  '1264x848': { aspectRatio: '3:2', imageSize: '1K' },
  '848x1264': { aspectRatio: '2:3', imageSize: '1K' },
  '1152x928': { aspectRatio: '5:4', imageSize: '1K' },
  '928x1152': { aspectRatio: '4:5', imageSize: '1K' },
  '1584x672': { aspectRatio: '21:9', imageSize: '1K' },
  '2048x2048': { aspectRatio: '1:1', imageSize: '2K' },
  '2752x1536': { aspectRatio: '16:9', imageSize: '2K' },
  '1536x2752': { aspectRatio: '9:16', imageSize: '2K' },
  '2400x1792': { aspectRatio: '4:3', imageSize: '2K' },
  '1792x2400': { aspectRatio: '3:4', imageSize: '2K' },
  '2528x1696': { aspectRatio: '3:2', imageSize: '2K' },
  '1696x2528': { aspectRatio: '2:3', imageSize: '2K' },
  '2304x1856': { aspectRatio: '5:4', imageSize: '2K' },
  '1856x2304': { aspectRatio: '4:5', imageSize: '2K' },
  '3168x1344': { aspectRatio: '21:9', imageSize: '2K' },
  '4096x4096': { aspectRatio: '1:1', imageSize: '4K' },
  '5504x3072': { aspectRatio: '16:9', imageSize: '4K' },
  '3072x5504': { aspectRatio: '9:16', imageSize: '4K' },
  '4800x3584': { aspectRatio: '4:3', imageSize: '4K' },
  '3584x4800': { aspectRatio: '3:4', imageSize: '4K' },
  '5056x3392': { aspectRatio: '3:2', imageSize: '4K' },
  '3392x5056': { aspectRatio: '2:3', imageSize: '4K' },
  '4608x3712': { aspectRatio: '5:4', imageSize: '4K' },
  '3712x4608': { aspectRatio: '4:5', imageSize: '4K' },
  '6336x2688': { aspectRatio: '21:9', imageSize: '4K' },
}

const GEMINI_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
] as const

type GeminiImageSize = '1K' | '2K' | '4K'

function getAspectRatio(size: string): string | undefined {
  const normalized = size.trim().replace(/\s+/g, '')
  const preset = GEMINI_SIZE_PRESETS[normalized]
  if (preset) return preset.aspectRatio

  const ratioMatch = normalized.match(/^(\d+)(?::|x)(\d+)$/i)
  if (!ratioMatch) return undefined

  const width = Number(ratioMatch[1])
  const height = Number(ratioMatch[2])
  if (!width || !height) return undefined

  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const ratio = `${width / gcd(width, height)}:${height / gcd(width, height)}`
  return GEMINI_ASPECT_RATIOS.includes(ratio as typeof GEMINI_ASPECT_RATIOS[number]) ? ratio : undefined
}

function getImageSize(quality: CallApiOptions['params']['quality'], size: string): GeminiImageSize {
  if (quality === 'high') return '4K'
  if (quality === 'medium') return '2K'
  if (quality === 'low') return '1K'

  return GEMINI_SIZE_PRESETS[size.trim().replace(/\s+/g, '')]?.imageSize ?? '1K'
}

function getGeminiUrl(baseUrl: string, model: string, useApiProxy: boolean, proxyConfig: ReturnType<typeof readClientDevProxyConfig>): string {
  const path = `v1beta/models/${encodeURIComponent(model)}:generateContent`
  if (useApiProxy) return `${proxyConfig?.prefix ?? '/api-proxy'}/${path}`
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/v1beta')) return `${normalized}/models/${encodeURIComponent(model)}:generateContent`
  return `${normalized}/${path}`
}

async function callGeminiImageApiSingle(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  const parts = [
    { text: opts.prompt },
    ...opts.inputImageDataUrls.map(dataUrlToPart),
  ]
  const imageConfig: Record<string, string> = {
    imageSize: getImageSize(opts.params.quality, opts.params.size),
  }
  const aspectRatio = getAspectRatio(opts.params.size)
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio

  const response = await fetch(getGeminiUrl(profile.baseUrl, profile.model, useApiProxy, proxyConfig), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig,
      },
    }),
  })

  if (!response.ok) throw new Error(await getApiErrorMessage(response))
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string, data?: string } }> } }>
  }
  const images = (payload.candidates ?? []).flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.inlineData)
    .filter((data): data is { mimeType?: string, data: string } => Boolean(data?.data))
    .map((data) => `data:${data.mimeType || 'image/png'};base64,${data.data}`)

  if (!images.length) {
    const err = new Error('Gemini 接口未返回图片数据')
    ;(err as any).rawResponsePayload = JSON.stringify(payload, null, 2)
    throw err
  }
  return { images }
}

export async function callGeminiImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const n = opts.params.n > 0 ? opts.params.n : 1
  const results = await Promise.all(Array.from({ length: n }, () => callGeminiImageApiSingle(opts, profile)))
  const images = results.flatMap((result) => result.images)
  return {
    images,
    actualParams: { n: images.length },
    actualParamsList: images.map(() => ({ n: 1 })),
  }
}
