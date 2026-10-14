// 章节标题识别规则（主进程解析器与渲染进程目录共用）

/**
 * 卷/章节序号可用的字符：
 * 中文数字、阿拉伯数字、全角数字。
 */
export const VOLUME_NUMBER_SOURCE = '一二三四五六七八九十百千万零〇两\\d０-９'

/** 纯数字序号（含全角） */
export const DIGIT_NUMBER_SOURCE = '\\d０-９'

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
export const CHAPTER_PATTERNS: RegExp[] = [
  new RegExp(`^第[${VOLUME_NUMBER_SOURCE}]+[章节回部集篇](?:$|[\\s：:、.．·\\-—])`),
  new RegExp(`^第[${VOLUME_NUMBER_SOURCE}]+卷(?:$|[\\s：:、.．·\\-—])`),
  new RegExp(`^卷[${VOLUME_NUMBER_SOURCE}]+`),
  /^Chapter\s*\d+/i,
  /^Volume\s*\d+/i,
  /^Part\s*\d+/i,
  // 句点后紧跟数字时视为小数（如 3.9 级），不作为章节号。
  new RegExp(`^[${DIGIT_NUMBER_SOURCE}]+(?:、|[.．](?![${DIGIT_NUMBER_SOURCE}]))\\s*\\S+`),
  /^[０-９\d]+\s+\S+/
]

/** 卷标题模式：第X卷 / 卷X / Volume N / Part N */
const VOLUME_TITLE_PATTERN = new RegExp(
  `^第[${VOLUME_NUMBER_SOURCE}]+[卷部集篇]|^卷[${VOLUME_NUMBER_SOURCE}]+|^Volume\\s*\\d+|^Part\\s*\\d+`,
  'i'
)

/** 自动分段标题模式："第 N 段" */
const SECTION_TITLE_PATTERN = /^第\s*\d+\s*段/

/**
 * 根据标题文本判断章节条目类型。
 *
 * 这是主进程 BookshelfManager、ChapterParser 与渲染进程 ChapterList 共用的
 * 唯一实现。此前三处各写了一份等价正则，改一处忘两处会导致目录标签与
 * 持久化的 type 字段不一致。
 */
export function getChapterType(title: string): 'volume' | 'chapter' | 'section' {
  if (VOLUME_TITLE_PATTERN.test(title)) return 'volume'
  if (SECTION_TITLE_PATTERN.test(title)) return 'section'
  return 'chapter'
}

/** 目录中显示的单字类型标签。 */
export function getChapterTypeLabel(chapter: { title: string; type?: string }): string {
  if (chapter.type === 'volume') return '卷'
  if (chapter.type === 'section') return '段'
  return getChapterType(chapter.title) === 'volume' ? '卷' : '章'
}

/**
 * 在按 offset 升序排列的章节数组中，用二分查找定位 offset 所属的章节下标。
 *
 * 旧实现是从数组末尾线性回扫，搜索正文时每个命中都要扫一遍全部章节
 * （5000 章的小说搜一个常见字 ≈ 25 万次比较）。章节 offset 天然有序，
 * 这里改为 O(log n)。
 */
export function findChapterIndexForOffset(
  chapters: readonly { offset: number }[],
  offset: number
): number {
  if (chapters.length === 0) return 0

  let low = 0
  let high = chapters.length - 1

  // 目标：最大的 i 使 chapters[i].offset <= offset
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (chapters[middle].offset <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  // offset 落在第一章之前时归到第 0 章。
  return chapters[0].offset > offset ? 0 : low
}
