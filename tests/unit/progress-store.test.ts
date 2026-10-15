import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ProgressStore } from '../../src/main/progress-store'

describe('ProgressStore', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyureader-progress-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('persists progress and lastReadAt across instances', () => {
    const store = new ProgressStore(dir)
    store.updateProgress('b1', { chapterIndex: 3, scrollPosition: 120, percentage: 40 }, 1234)

    // 新实例必须从磁盘读回，而不是依赖内存缓存。
    const reloaded = new ProgressStore(dir)
    expect(reloaded.getProgress('b1')).toEqual({
      chapterIndex: 3,
      scrollPosition: 120,
      percentage: 40
    })
    expect(reloaded.getLastReadAt('b1')).toBe(1234)
  })

  it('overwrites the previous value on repeated writes', () => {
    const store = new ProgressStore(dir)
    store.updateProgress('b1', { chapterIndex: 1, scrollPosition: 10, percentage: 5 }, 1)
    store.updateProgress('b1', { chapterIndex: 2, scrollPosition: 20, percentage: 9 }, 2)

    expect(new ProgressStore(dir).getProgress('b1')).toEqual({
      chapterIndex: 2,
      scrollPosition: 20,
      percentage: 9
    })
  })

  it('falls back to a direct write when the atomic rename fails', () => {
    // Windows 上 rename 到已存在的目标会抛 EPERM/EEXIST，而本方法从第二次
    // 写入起目标必然已存在。若没有回退，Windows 用户从第二次滚动起就再也
    // 存不上进度。
    const store = new ProgressStore(dir)
    store.updateProgress('b1', { chapterIndex: 1, scrollPosition: 10, percentage: 5 }, 1)

    // 让临时文件路径不可写，迫使原子替换失败。
    fs.mkdirSync(path.join(dir, 'reading-progress.json.tmp'))

    expect(() =>
      store.updateProgress('b1', { chapterIndex: 9, scrollPosition: 90, percentage: 9 }, 9)
    ).not.toThrow()

    // 回退路径必须真正把新数据写进目标文件。
    expect(new ProgressStore(dir).getProgress('b1')).toEqual({
      chapterIndex: 9,
      scrollPosition: 90,
      percentage: 9
    })
  })

  it('removes a book entry', () => {
    const store = new ProgressStore(dir)
    store.updateProgress('b1', { chapterIndex: 1, scrollPosition: 10, percentage: 5 }, 1)
    store.remove('b1')

    expect(store.getProgress('b1')).toBeNull()
    expect(store.getLastReadAt('b1')).toBeUndefined()
  })

  it('replaces all entries at once', () => {
    const store = new ProgressStore(dir)
    store.updateProgress('old', { chapterIndex: 1, scrollPosition: 1, percentage: 1 }, 1)

    store.replace({ fresh: { chapterIndex: 2, scrollPosition: 2, percentage: 2 } }, { fresh: 42 })

    expect(store.getProgress('old')).toBeNull()
    expect(store.getProgress('fresh')).toEqual({
      chapterIndex: 2,
      scrollPosition: 2,
      percentage: 2
    })
    expect(store.getLastReadAt('fresh')).toBe(42)
  })

  it('recovers from a corrupted file instead of breaking the reader', () => {
    fs.writeFileSync(path.join(dir, 'reading-progress.json'), '{ this is not json', 'utf-8')

    const store = new ProgressStore(dir)

    expect(store.getProgress('b1')).toBeNull()
    // 损坏后仍应能正常写入。
    store.updateProgress('b1', { chapterIndex: 0, scrollPosition: 0, percentage: 0 }, 5)
    expect(new ProgressStore(dir).getProgress('b1')).not.toBeNull()
  })

  it('tolerates a file whose fields have the wrong shape', () => {
    fs.writeFileSync(
      path.join(dir, 'reading-progress.json'),
      JSON.stringify({ version: 1, progress: 'nope', lastReadAt: 42 }),
      'utf-8'
    )

    const store = new ProgressStore(dir)

    expect(store.getAllProgress()).toEqual({})
    expect(store.getAllLastReadAt()).toEqual({})
  })
})
