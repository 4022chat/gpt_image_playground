import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  CURRENT_THUMBNAIL_VERSION: 2,
  getImage: vi.fn(),
  getImageThumbnail: vi.fn(),
  getStoredFreshImageThumbnail: vi.fn(),
}))

vi.mock('./db', () => db)

import {
  cacheImage,
  cacheThumbnail,
  clearImageCaches,
  deleteImageCacheEntry,
  ensureImageThumbnailCached,
  getCachedImage,
  scheduleThumbnailBackfill,
  subscribeImageThumbnail,
} from './imageCache'

describe('imageCache', () => {
  beforeEach(() => {
    URL.revokeObjectURL = vi.fn()
    clearImageCaches()
    vi.clearAllMocks()
    db.getImage.mockResolvedValue(undefined)
    db.getImageThumbnail.mockResolvedValue(undefined)
    db.getStoredFreshImageThumbnail.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('evicts the least recently used images and thumbnails', async () => {
    for (let i = 0; i < 8; i++) cacheImage(`image-${i}`, `data-${i}`)
    expect(getCachedImage('image-0')).toBe('data-0')
    cacheImage('image-8', 'data-8')

    expect(getCachedImage('image-1')).toBeUndefined()
    expect(getCachedImage('image-0')).toBe('data-0')

    for (let i = 0; i < 200; i++) {
      cacheThumbnail(`thumbnail-${i}`, {
        src: `thumbnail-data-${i}`,
        thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
      })
    }
    await expect(ensureImageThumbnailCached('thumbnail-0')).resolves.toMatchObject({ src: 'thumbnail-data-0' })
    cacheThumbnail('thumbnail-200', {
      src: 'thumbnail-data-200',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })
    db.getStoredFreshImageThumbnail.mockResolvedValue({
      thumbnailDataUrl: 'stored-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })

    await expect(ensureImageThumbnailCached('thumbnail-1')).resolves.toMatchObject({ src: 'stored-thumbnail' })
    expect(db.getStoredFreshImageThumbnail).toHaveBeenCalledWith('thumbnail-1')
  })

  it('keeps thumbnails in use and revokes blob URLs only after the last user leaves', () => {
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const version = db.CURRENT_THUMBNAIL_VERSION
    const releaseA = subscribeImageThumbnail('shown', () => {})
    const releaseB = subscribeImageThumbnail('shown', () => {})
    cacheThumbnail('shown', { src: 'blob:shown', thumbnailVersion: version })
    for (let i = 0; i < 200; i++) cacheThumbnail(`other-${i}`, { src: `blob:other-${i}`, thumbnailVersion: version })

    // 最久未用但正在显示的项被跳过，淘汰下一个
    expect(revoke.mock.calls).toEqual([['blob:other-0']])

    // 显示中被替换或删除，推迟到最后一个使用者离开再撤销
    cacheThumbnail('shown', { src: 'blob:shown-2', thumbnailVersion: version })
    deleteImageCacheEntry('shown')
    releaseA()
    releaseA()
    expect(revoke).not.toHaveBeenCalledWith('blob:shown')
    releaseB()
    expect(revoke).toHaveBeenCalledWith('blob:shown')
    expect(revoke).toHaveBeenCalledWith('blob:shown-2')
    expect(revoke).toHaveBeenCalledTimes(3)

    // dataUrl 不需要撤销
    cacheThumbnail('data', { src: 'data:image/webp;base64,AA==', thumbnailVersion: version })
    clearImageCaches()
    expect(revoke).not.toHaveBeenCalledWith('data:image/webp;base64,AA==')
  })

  it('only caches thumbnails from the current version', async () => {
    cacheThumbnail('image', {
      src: 'stale-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION - 1,
    })
    db.getStoredFreshImageThumbnail.mockResolvedValue({
      thumbnailDataUrl: 'fresh-thumbnail',
      width: 640,
      height: 480,
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })

    await expect(ensureImageThumbnailCached('image')).resolves.toEqual({
      src: 'fresh-thumbnail',
      width: 640,
      height: 480,
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })
    expect(db.getStoredFreshImageThumbnail).toHaveBeenCalledOnce()

    db.getStoredFreshImageThumbnail.mockClear()
    await ensureImageThumbnailCached('image')
    expect(db.getStoredFreshImageThumbnail).not.toHaveBeenCalled()
  })

  it('deletes individual entries and clears both caches', async () => {
    cacheImage('deleted', 'deleted-data')
    cacheThumbnail('deleted', {
      src: 'deleted-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })
    deleteImageCacheEntry('deleted')
    db.getStoredFreshImageThumbnail.mockResolvedValueOnce({
      thumbnailDataUrl: 'stored-deleted-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })

    expect(getCachedImage('deleted')).toBeUndefined()
    await expect(ensureImageThumbnailCached('deleted')).resolves.toMatchObject({
      src: 'stored-deleted-thumbnail',
    })
    expect(db.getStoredFreshImageThumbnail).toHaveBeenCalledWith('deleted')

    cacheImage('cleared', 'cleared-data')
    cacheThumbnail('cleared', {
      src: 'cleared-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })
    clearImageCaches()
    db.getStoredFreshImageThumbnail.mockClear()
    db.getStoredFreshImageThumbnail.mockResolvedValueOnce({
      thumbnailDataUrl: 'stored-cleared-thumbnail',
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    })

    expect(getCachedImage('cleared')).toBeUndefined()
    await expect(ensureImageThumbnailCached('cleared')).resolves.toMatchObject({
      src: 'stored-cleared-thumbnail',
    })
    expect(db.getStoredFreshImageThumbnail).toHaveBeenCalledWith('cleared')
  })

  it('prioritizes visible thumbnail backfills and notifies subscribers', async () => {
    vi.useFakeTimers()
    db.getImage.mockResolvedValue({ width: 1000, height: 1000 })
    db.getImageThumbnail.mockImplementation(async (id: string) => ({
      thumbnailDataUrl: `${id}-thumbnail`,
      width: 1000,
      height: 1000,
      thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
    }))
    const onThumbnail = vi.fn()
    const unsubscribe = subscribeImageThumbnail('visible', onThumbnail)

    scheduleThumbnailBackfill(['background'])
    scheduleThumbnailBackfill(['visible'], 'visible')
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(db.getImageThumbnail).toHaveBeenCalledTimes(2))

    expect(db.getImage.mock.calls.map(([id]) => id)).toEqual(['visible', 'background'])
    expect(db.getImageThumbnail.mock.calls.map(([id]) => id)).toEqual(['visible', 'background'])
    expect(onThumbnail).toHaveBeenCalledWith({
      src: 'visible-thumbnail',
      width: 1000,
      height: 1000,
    })
    unsubscribe()
  })

  it('allows a failed thumbnail backfill to be scheduled again', async () => {
    vi.useFakeTimers()
    db.getImage.mockResolvedValue({ width: 1000, height: 1000 })
    db.getImageThumbnail
      .mockRejectedValueOnce(new Error('thumbnail failed'))
      .mockResolvedValueOnce({
        thumbnailDataUrl: 'retried-thumbnail',
        thumbnailVersion: db.CURRENT_THUMBNAIL_VERSION,
      })

    scheduleThumbnailBackfill(['image'])
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(db.getImageThumbnail).toHaveBeenCalledOnce())

    scheduleThumbnailBackfill(['image'])
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(db.getImageThumbnail).toHaveBeenCalledTimes(2))
  })
})
