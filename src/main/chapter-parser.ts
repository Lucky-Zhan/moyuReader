import { Chapter } from '../shared/types'
import { CHAPTER_SEGMENT_LENGTH } from '../shared/constants'

const VOLUME_NUMBER_SOURCE = '一二三四五六七八九十百千万零〇两\\d０-９'
const DIGIT_NUMBER_SOURCE = '\\d０-９'

/**
 * 章节标题匹配模式
 * - 中文章节："第X章" / "第X节" / "第X回" / "第X部"
 * - 卷标题："卷X" / "第X卷 标题"
 * - 英文章节："Chapter N" / "Volume N" / "Part N"
 * - 数字序号："1、标题" / "1. 标题" / "1 标题"
 *
 * 中文网络小说常用顿号（、）连接数字和标题，必须与英文句点、全角句点
 * 分开匹配，避免把正文中的普通数字误判成章节。
 */
const CHAPTER_PATTERNS: RegExp[] = [
  new RegExp(`^第[${VOLUME_NUMBER_SOURCE}]+[章节回部集篇](?:$|[\\s：:、.．·\\-—])`),
  new RegExp(`^第[${VOLUME_NUMBER_SOURCE}]+卷(?:$|[\\s：:、.．·\\-—])`),
  new RegExp(`^卷[${VOLUME_NUMBER_SOURCE}]+`),
  /^Chapter\s*\d+/i,
  /^Volume\s*\d+/i,
  /^Part\s*\d+/i,
  new RegExp(`^[${DIGIT_NUMBER_SOURCE}]+[、.．]\\s*\\S+`),
  /^[０-９\d]+[.．]\s*\S+/,
  /^[０-９\d]+\s+\S+/
]

interface VolumeBoundary {
  /** 边界关联的卷序号 */
  index: number
  /** 边界所在行的字符偏移 */
  offset: number
  /** 卷名（若原文提供） */
  title?: string
  /** start 表示卷标题，end 表示上一卷结束 */
  kind: 'start' | 'end'
}

interface ParsedChapters {
  chapters: Chapter[]
  volumeBoundaries: VolumeBoundary[]
}

/**
 * 章节解析器
 * 负责自动识别和划分小说章节
 */
export class ChapterParser {
  /**
   * 解析文本内容，返回章节列表
   * 扫描文本逐行匹配章节标题模式，按 offset 严格递增排列，
   * 并计算每个章节的 length（到下一章节起始位置或文件末尾）。
   * 若文本包含卷完标记，会在真实章节上附加 volumeIndex/volumeTitle；
   * 卷信息不会占用章节数组索引，避免破坏阅读进度、搜索和书签。
   * 若未识别到任何章节标题，按每 CHAPTER_SEGMENT_LENGTH 字符自动分段。
   */
  parse(content: string): Chapter[] {
    const parsed = this.matchChapterPatterns(content)
    const chapters = parsed.chapters

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

    this.assignVolumeMetadata(chapters, parsed.volumeBoundaries)
    return chapters
  }

  /**
   * 扫描文本逐行匹配章节标题，并收集卷边界。
   * “第X卷，……完”是卷结束说明，不是可阅读章节，因此只记录边界；
   * 普通“第X卷 标题”仍保留为 volume 条目以兼容已有文本格式。
   */
  private matchChapterPatterns(content: string): ParsedChapters {
    const chapters: Chapter[] = []
    const volumeBoundaries: VolumeBoundary[] = []
    const lines = content.split('\n')
    let offset = 0

    for (const line of lines) {
      const trimmedLine = line.trimStart()
      const leadingSpaces = line.length - trimmedLine.length
      const title = trimmedLine.trimEnd()
      const lineOffset = offset + leadingSpaces

      const standaloneVolume = this.parseStandaloneVolumeCompletion(title)
      if (standaloneVolume) {
        volumeBoundaries.push({
          ...standaloneVolume,
          offset: lineOffset,
          kind: 'end'
        })
        offset += line.length + 1
        continue
      }

      for (const pattern of CHAPTER_PATTERNS) {
        if (!pattern.test(trimmedLine)) {
          continue
        }

        const chapter: Chapter = {
          title,
          type: this.getChapterType(title),
          offset: lineOffset,
          length: 0
        }
        chapters.push(chapter)

        const inlineVolumeEnd = this.parseInlineVolumeCompletion(title)
        if (inlineVolumeEnd) {
          volumeBoundaries.push({
            ...inlineVolumeEnd,
            offset: lineOffset,
            kind: 'end'
          })
        }

        const volumeHeading = this.parseVolumeHeading(title)
        if (volumeHeading) {
          volumeBoundaries.push({
            ...volumeHeading,
            offset: lineOffset,
            kind: 'start'
          })
        }
        break // 一行只匹配一个模式
      }

      // 偏移量累加：当前行长度 + 换行符
      offset += line.length + 1
    }

    return { chapters, volumeBoundaries }
  }

  /**
   * 根据卷结束/卷标题边界给真实章节标注卷信息。
   * 章节数组不插入虚拟卷条目，因此所有原有索引保持稳定。
   */
  private assignVolumeMetadata(chapters: Chapter[], boundaries: VolumeBoundary[]): void {
    if (boundaries.length === 0) {
      return
    }

    const ordered = [...boundaries].sort((a, b) => {
      if (a.offset !== b.offset) return a.offset - b.offset
      // 同一行的 start 先应用，end 留给当前章节之后。
      return a.kind === 'start' ? -1 : 1
    })

    const volumeTitles = new Map<number, string>()
    for (const boundary of ordered) {
      if (boundary.title) {
        // 同一卷可能有多个阶段说明，靠后的说明通常是完整卷名。
        volumeTitles.set(boundary.index, boundary.title)
      }
    }

    const firstBoundary = ordered[0]
    let volumeIndex = firstBoundary.kind === 'start'
      ? firstBoundary.index
      : Math.max(1, firstBoundary.index)
    let boundaryIndex = 0

    for (const chapter of chapters) {
      while (boundaryIndex < ordered.length) {
        const boundary = ordered[boundaryIndex]
        const shouldApplyBeforeChapter = boundary.kind === 'start'
          ? boundary.offset <= chapter.offset
          : boundary.offset < chapter.offset

        if (!shouldApplyBeforeChapter) break
        volumeIndex = boundary.kind === 'start' ? boundary.index : boundary.index + 1
        boundaryIndex++
      }

      chapter.volumeIndex = volumeIndex
      const volumeTitle = volumeTitles.get(volumeIndex)
      if (volumeTitle) {
        chapter.volumeTitle = volumeTitle
      }

      // 内联“第X卷完”与当前章节标题处于同一 offset，边界从下一章生效。
      while (
        boundaryIndex < ordered.length &&
        ordered[boundaryIndex].kind === 'end' &&
        ordered[boundaryIndex].offset === chapter.offset
      ) {
        volumeIndex = ordered[boundaryIndex].index + 1
        boundaryIndex++
      }
    }
  }

  /** 解析独立一行的“第X卷，卷名，完”标记。 */
  private parseStandaloneVolumeCompletion(title: string): Omit<VolumeBoundary, 'offset' | 'kind'> | null {
    const match = title.match(new RegExp(`^第([${VOLUME_NUMBER_SOURCE}]+)卷(?:[，,、:：\\s]*)?(.*)$`))
    if (!match) return null

    const suffix = match[2].trim()
    if (!/(?:完|结束)/.test(suffix)) return null

    const volumeIndex = parseChineseNumber(match[1])
    if (volumeIndex === null) return null

    const volumeTitle = suffix
      .replace(/[（(]\s*(?:完|结束)\s*[）)]\s*$/, '')
      .replace(/[，,、:：\s]+(?:完|结束)[。．.!！]?\s*$/, '')
      .replace(/[。．.!！]+\s*$/, '')
      .trim()

    return {
      index: volumeIndex,
      title: volumeTitle || undefined
    }
  }

  /** 解析章节标题中的“（第X卷完）”标记。 */
  private parseInlineVolumeCompletion(title: string): Omit<VolumeBoundary, 'offset' | 'kind'> | null {
    const match = title.match(new RegExp(`第([${VOLUME_NUMBER_SOURCE}]+)卷\\s*完`))
    if (!match) return null

    const volumeIndex = parseChineseNumber(match[1])
    return volumeIndex === null ? null : { index: volumeIndex }
  }

  /** 解析普通卷标题（不含“完”），保留为兼容性的 volume 章节条目。 */
  private parseVolumeHeading(title: string): Omit<VolumeBoundary, 'offset' | 'kind'> | null {
    const match = title.match(new RegExp(`^第([${VOLUME_NUMBER_SOURCE}]+)卷(?:[，,、:：\\s]+)(.+)$`))
    if (!match || /(?:完|结束)/.test(match[2])) return null

    const volumeIndex = parseChineseNumber(match[1])
    return volumeIndex === null ? null : { index: volumeIndex, title: match[2].trim() }
  }

  /** 按固定长度分段（无章节标记时的回退策略）。 */
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
    if (new RegExp(`^第[${VOLUME_NUMBER_SOURCE}]+[卷部集篇]|^卷[${VOLUME_NUMBER_SOURCE}]+|^Volume\\s*\\d+|^Part\\s*\\d+`, 'i').test(title)) {
      return 'volume'
    }
    return 'chapter'
  }
}

/** 将阿拉伯、全角或常见中文数字转换为卷序号。 */
function parseChineseNumber(value: string): number | null {
  const normalized = value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
  if (/^\d+$/.test(normalized)) {
    const number = Number(normalized)
    return Number.isSafeInteger(number) && number > 0 ? number : null
  }

  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }

  let total = 0
  let section = 0
  let number = 0
  for (const char of normalized) {
    if (char in digits) {
      number = digits[char]
      continue
    }
    const unit = units[char]
    if (!unit) return null
    if (unit === 10000) {
      section += number
      total += (section || 1) * unit
      section = 0
    } else {
      section += (number || 1) * unit
    }
    number = 0
  }

  const result = total + section + number
  return Number.isSafeInteger(result) && result > 0 ? result : null
}
