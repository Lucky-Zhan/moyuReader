import { Chapter } from '../shared/types'
import { CHAPTER_SEGMENT_LENGTH } from '../shared/constants'
import {
  CHAPTER_PATTERNS,
  VOLUME_NUMBER_SOURCE,
  getChapterType
} from '../shared/chapter-patterns'

const DIGIT_NUMBER_SOURCE = '\\d０-９'

/**
 * 持久化章节元数据的解析器版本。
 * 提升版本后，书架管理器会在首次读取书籍时用新规则重建目录。
 */
export const CHAPTER_PARSER_VERSION = 3

interface ChapterCandidate {
  chapter: Chapter
  patternIndex: number
  lineIndex: number
}

/** 一行文本及其在原文中的起始偏移。 */
interface LineSlice {
  text: string
  start: number
}

/**
 * 按行切分文本，同时记录每行的真实起始偏移。
 *
 * 不能用 `content.split('\n')` 配合 `offset += line.length + 1` 累加偏移：
 * Windows 换行是 `\r\n`，那样每行会多算一个字符，章节 offset 会逐渐漂移，
 * 最终落在换行符而不是标题开头，导致跳转后正文错位。
 */
function splitLines(content: string): LineSlice[] {
  const lines: LineSlice[] = []
  let start = 0

  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) !== 10) continue

    // 行内容不含 CR/LF，偏移仍指向该行在原文中的真实起点。
    const end = index > start && content.charCodeAt(index - 1) === 13 ? index - 1 : index
    lines.push({ text: content.slice(start, end), start })
    start = index + 1
  }

  lines.push({ text: content.slice(start), start })
  return lines
}

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
    const candidates: ChapterCandidate[] = []
    const volumeBoundaries: VolumeBoundary[] = []
    const lines = splitLines(content)

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const { text: line, start: offset } = lines[lineIndex]
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
        continue
      }

      for (let patternIndex = 0; patternIndex < CHAPTER_PATTERNS.length; patternIndex++) {
        const pattern = CHAPTER_PATTERNS[patternIndex]
        if (!pattern.test(trimmedLine)) {
          continue
        }

        const chapter: Chapter = {
          title,
          type: getChapterType(title),
          offset: lineOffset,
          length: 0
        }
        candidates.push({ chapter, patternIndex, lineIndex })

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
    }

    // 数字序号模式（pattern 7/8）风险最高：正文里“3 个人走进了房间”这类句子
    // 会被误判成章节，而“1、标题 / 2、标题”又确实是常见目录格式。因此只在
    // 空格分隔形态上做严格判定，其余形态保留原有兼容性。
    const chapters = candidates
      .filter((candidate) => {
        if (candidate.patternIndex < 6) return true
        return !this.isLikelyNumericBodyLine(candidate.chapter.title)
      })
      .map(({ chapter }) => chapter)

    return { chapters, volumeBoundaries }
  }

  /** 判断数字序号是否更像正文句子，而不是章节标题。 */
  private isLikelyNumericBodyLine(title: string): boolean {
    const match = title.match(/^([０-９\d]+)(、|[.．]|\s)\s*(.*)$/)
    if (!match) return false

    const number = Number(match[1].replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30)))
    const suffix = match[3].trim()
    if (!Number.isSafeInteger(number) || number <= 0) return false

    // 句点后紧跟数字的小数已经由匹配规则排除，这里保留二次保护，避免
    // 后续新增数字模式时再次把“3.9级”纳入目录。
    if ((match[2] === '.' || match[2] === '．') && /^\d/.test(suffix)) return true

    // “姓名：分数/数值”这类榜单行通常没有句末标点，但明显不是章节标题。
    if (/[：:]\s*[０-９\d]+/.test(suffix)) return true

    // 空格分隔的数字开头（pattern 8）最容易被正文句子命中：“3 个人走进了房间，
    // 他们分别是甲、乙、丙。”。真实目录用空格分隔时标题都很短，且不会出现
    // 句中标点，因此这里只对空格形态做严格判定。
    if (match[2] === ' ') {
      if (/[，,；;：:]/.test(suffix) || suffix.length > 30) return true
    }

    // 以句号、分号或感叹号收尾的数字条目更符合说明/列表语气。
    if (/[。！？；.!?;]$/.test(suffix)) return true

    return false
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
