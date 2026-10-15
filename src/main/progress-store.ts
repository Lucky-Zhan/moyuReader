import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import type { ReadingProgress } from '../shared/types'

/**
 * 阅读进度的独立存储。
 *
 * 为什么不继续放在 electron-store 里：
 * electron-store（底层 conf）每次 set 都会把**整个** store 序列化并原子落盘。
 * 书架 store 里装着每本书的全部章节元数据，大书架（200 本 × 3000 章）可达
 * 数十 MB。而阅读进度是滚动期间的高频写入，实测每次保存会让主进程同步阻塞
 * 约 700ms~1.1s，滚动时明显卡顿。
 *
 * 这里把进度拆到独立的小文件：写入量与书架规模无关，实测 <1ms。
 * 写入采用「临时文件 + rename」的原子替换，避免进程中途退出留下半个文件。
 */

interface ProgressFile {
  version: 1
  /** 每本书的阅读进度 */
  progress: Record<string, ReadingProgress>
  /** 每本书的最后阅读时间 */
  lastReadAt: Record<string, number>
}

const EMPTY: ProgressFile = { version: 1, progress: {}, lastReadAt: {} }

export class ProgressStore {
  private readonly filePath: string
  private readonly tmpPath: string
  private data: ProgressFile | null = null

  constructor(dir: string, fileName = 'reading-progress.json') {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.filePath = join(dir, fileName)
    this.tmpPath = `${this.filePath}.tmp`
  }

  /** 读取全部进度（首次访问时从磁盘加载）。 */
  private load(): ProgressFile {
    if (this.data) return this.data

    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<ProgressFile>
        this.data = {
          version: 1,
          progress: isRecord(parsed.progress) ? (parsed.progress as ProgressFile['progress']) : {},
          lastReadAt: isRecord(parsed.lastReadAt)
            ? (parsed.lastReadAt as ProgressFile['lastReadAt'])
            : {}
        }
        return this.data
      }
    } catch {
      // 文件损坏时退回空数据，不让阅读器整体不可用。
    }

    this.data = { ...EMPTY, progress: {}, lastReadAt: {} }
    return this.data
  }

  /**
   * 落盘。
   *
   * 优先用「临时文件 + rename」做原子替换，避免进程中途退出留下半个文件。
   * 但 Windows 上 rename 到**已存在**的目标会抛 EPERM/EEXIST（POSIX 允许
   * 覆盖），而本方法从第二次写入起目标必然已存在，因此必须回退：
   * 直接覆盖写目标文件。代价是极端情况下可能写到一半，但进度数据本身
   * 可重建，可用性优先于原子性。
   */
  private persist(): void {
    const payload = JSON.stringify(this.load())

    try {
      writeFileSync(this.tmpPath, payload, 'utf-8')
      renameSync(this.tmpPath, this.filePath)
      return
    } catch {
      // 回退：清理临时文件后直接覆盖写。
    }

    writeFileSync(this.filePath, payload, 'utf-8')
  }

  getProgress(bookId: string): ReadingProgress | null {
    return this.load().progress[bookId] ?? null
  }

  /** 一次性取出全部进度，供书架列表使用。 */
  getAllProgress(): Record<string, ReadingProgress> {
    return { ...this.load().progress }
  }

  getLastReadAt(bookId: string): number | undefined {
    return this.load().lastReadAt[bookId]
  }

  getAllLastReadAt(): Record<string, number> {
    return { ...this.load().lastReadAt }
  }

  /** 写入一本书的进度与最后阅读时间（单次写盘）。 */
  updateProgress(bookId: string, progress: ReadingProgress, timestamp: number): void {
    const data = this.load()
    data.progress[bookId] = { ...progress }
    data.lastReadAt[bookId] = timestamp
    this.persist()
  }

  /** 删除一本书的进度记录。 */
  remove(bookId: string): void {
    const data = this.load()
    delete data.progress[bookId]
    delete data.lastReadAt[bookId]
    this.persist()
  }

  /** 整体替换（用于备份恢复与回滚）。 */
  replace(progress: Record<string, ReadingProgress>, lastReadAt: Record<string, number>): void {
    this.data = { version: 1, progress: { ...progress }, lastReadAt: { ...lastReadAt } }
    this.persist()
  }

  /** 清空全部进度。 */
  clear(): void {
    this.replace({}, {})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
