import type { BookMeta, ReadingProgress, Chapter } from '../shared/types'
import { BookshelfManager } from './bookshelf-manager'

/** 当前阅读状态 */
export interface ReaderState {
  bookId: string | null
  content: string | null
  chapters: Chapter[]
  progress: ReadingProgress
}

/**
 * 阅读控制器
 * 负责阅读界面的状态管理
 */
export class ReaderController {
  private bookshelf: BookshelfManager
  private currentBookId: string | null = null
  private currentContent: string | null = null
  private currentChapters: Chapter[] = []
  private currentProgress: ReadingProgress = {
    chapterIndex: 0,
    scrollPosition: 0,
    percentage: 0
  }

  constructor(bookshelf: BookshelfManager) {
    this.bookshelf = bookshelf
  }

  /**
   * 打开书籍并恢复阅读进度
   * @param bookId 书籍 ID
   * @returns 书籍内容和阅读进度，如果书籍不存在则返回 null
   */
  openBook(bookId: string): { content: string; progress: ReadingProgress } | null {
    const books = this.bookshelf.getAllBooks()
    const book = books.find((b) => b.id === bookId)
    if (!book) return null

    const content = this.bookshelf.getBookContent(bookId)
    if (content === null) return null

    this.currentBookId = bookId
    this.currentContent = content
    this.currentChapters = book.chapters

    // 恢复阅读进度
    const savedProgress = this.bookshelf.getProgress(bookId)
    if (savedProgress) {
      this.currentProgress = { ...savedProgress }
    } else {
      this.currentProgress = {
        chapterIndex: 0,
        scrollPosition: 0,
        percentage: 0
      }
    }

    return {
      content,
      progress: { ...this.currentProgress }
    }
  }

  /**
   * 跳转到指定章节
   * @param chapterIndex 章节索引
   */
  goToChapter(chapterIndex: number): void {
    if (chapterIndex < 0 || chapterIndex >= this.currentChapters.length) return

    this.currentProgress.chapterIndex = chapterIndex

    // 计算跳转后的百分比
    if (this.currentContent && this.currentContent.length > 0) {
      const chapter = this.currentChapters[chapterIndex]
      this.currentProgress.percentage = this.calculatePercentage(
        chapter.offset,
        this.currentContent.length
      )
    }

    this.currentProgress.scrollPosition = 0
  }

  /**
   * 计算阅读百分比
   * @param position 当前位置
   * @param totalLength 总长度
   * @returns 百分比整数，范围 [0, 100]
   */
  calculatePercentage(position: number, totalLength: number): number {
    if (totalLength <= 0) return 0
    const percentage = Math.round((position / totalLength) * 100)
    return Math.max(0, Math.min(100, percentage))
  }

  /**
   * 获取当前阅读状态
   */
  getCurrentState(): ReaderState {
    return {
      bookId: this.currentBookId,
      content: this.currentContent,
      chapters: [...this.currentChapters],
      progress: { ...this.currentProgress }
    }
  }
}
