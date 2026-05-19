import { Chapter } from '../shared/types'
import { CHAPTER_SEGMENT_LENGTH } from '../shared/constants'

/**
 * 章节标题匹配模式
 * - 中文章节："第X章" / "第X节" / "第X卷" / "第X回" / "第X部"
 * - 卷标题："卷X" 
 * - 英文章节："Chapter N" / "Volume N" / "Part N"
 * - 数字序号："1. 标题" / "1 标题"
 */
const CHAPTER_PATTERNS: RegExp[] = [
  /^第[一二三四五六七八九十百千万零\d]+[章节卷回部集篇]/,
  /^卷[一二三四五六七八九十百千万零\d]+/,
  /^Chapter\s*\d+/i,
  /^Volume\s*\d+/i,
  /^Part\s*\d+/i,
  /^\d+[.\s]+\S+/
]

/**
 * 章节解析器
 * 负责自动识别和划分小说章节
 */
export class ChapterParser {
  /**
   * 解析文本内容，返回章节列表
   * 扫描文本逐行匹配章节标题模式，按 offset 严格递增排列，
   * 并计算每个章节的 length（到下一章节起始位置或文件末尾）
   * 若未识别到任何章节标题，按每 CHAPTER_SEGMENT_LENGTH 字符自动分段
   */
  parse(content: string): Chapter[] {
    const chapters = this.matchChapterPatterns(content)

    // 若未识别到任何章节标题，按固定长度自动分段
    if (chapters.length === 0) {
      return this.segmentByLength(content)
    }

    // 确保章节按 offset 严格递增排列
    chapters.sort((a, b) => a.offset - b.offset)

    // 计算每个章节的 length
    for (let i = 0; i < chapters.length; i++) {
      if (i < chapters.length - 1) {
        chapters[i].length = chapters[i + 1].offset - chapters[i].offset
      } else {
        // 最后一个章节：从 offset 到文件末尾
        chapters[i].length = content.length - chapters[i].offset
      }
    }

    return chapters
  }

  /**
   * 扫描文本逐行匹配章节标题模式，记录每个匹配的行偏移量
   */
  private matchChapterPatterns(content: string): Chapter[] {
    const chapters: Chapter[] = []
    const lines = content.split('\n')
    let offset = 0

    for (const line of lines) {
      const trimmedLine = line.trimStart()
      const leadingSpaces = line.length - trimmedLine.length

      for (const pattern of CHAPTER_PATTERNS) {
        const match = trimmedLine.match(pattern)
        if (match) {
          chapters.push({
            title: trimmedLine.trimEnd(),
            type: this.getChapterType(trimmedLine),
            offset: offset + leadingSpaces,
            length: 0
          })
          break // 一行只匹配一个模式
        }
      }

      // 偏移量累加：当前行长度 + 换行符
      offset += line.length + 1
    }

    return chapters
  }

  /**
   * 按固定长度分段（无章节标记时的回退策略）
   * 每 CHAPTER_SEGMENT_LENGTH 字符为一段，标题为"第 N 段"
   */
  private segmentByLength(content: string): Chapter[] {
    if (content.length === 0) {
      return []
    }

    const chapters: Chapter[] = []
    let offset = 0
    let segmentIndex = 1

    while (offset < content.length) {
      const length = Math.min(CHAPTER_SEGMENT_LENGTH, content.length - offset)
      chapters.push({
        title: `第 ${segmentIndex} 段`,
        type: 'section',
        offset,
        length
      })
      offset += length
      segmentIndex++
    }

    return chapters
  }

  private getChapterType(title: string): Chapter['type'] {
    if (/^第[一二三四五六七八九十百千万零\d]+[卷部集篇]|^卷[一二三四五六七八九十百千万零\d]+|^Volume\s*\d+|^Part\s*\d+/i.test(title)) {
      return 'volume'
    }
    return 'chapter'
  }
}
