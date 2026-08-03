import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chapter } from '../../../shared/types'
import './ChapterList.css'

const CHAPTER_ROW_HEIGHT = 36
const VOLUME_ROW_HEIGHT = 30
const VIRTUALIZE_THRESHOLD = 120
const VIRTUALIZE_OVERSCAN = 8
const DEFAULT_VIEWPORT_HEIGHT = 600

type ChapterListEntry =
  | {
      kind: 'volume'
      key: string
      volumeIndex: number
      title?: string
    }
  | {
      kind: 'chapter'
      key: string
      chapter: Chapter
      index: number
    }

function getChapterTypeLabel(chapter: Chapter): string {
  if (chapter.type === 'volume') return '卷'
  if (chapter.type === 'section') return '段'
  if (/^第[一二三四五六七八九十百千万零\d]+[卷部集篇]|^卷[一二三四五六七八九十百千万零\d]+/.test(chapter.title)) {
    return '卷'
  }
  if (/^第\s*\d+\s*段/.test(chapter.title)) return '段'
  return '章'
}

function getEntryHeight(entry: ChapterListEntry): number {
  return entry.kind === 'volume' ? VOLUME_ROW_HEIGHT : CHAPTER_ROW_HEIGHT
}

function findEntryAtOffset(offsets: number[], offset: number): number {
  let low = 0
  let high = offsets.length - 1

  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (offsets[middle] <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return low
}

export interface ChapterListProps {
  /** 章节列表 */
  chapters: Chapter[]
  /** 当前阅读章节索引 */
  currentChapterIndex: number
  /** 选择章节回调 */
  onSelectChapter: (index: number) => void
}

/**
 * 章节目录侧边栏组件。
 * 卷标题是目录虚拟项，不占用 chapters 数组索引；这样目录分组不会影响
 * 阅读进度、搜索结果和书签保存的 chapterIndex。
 */
export function ChapterList({
  chapters,
  currentChapterIndex,
  onSelectChapter
}: ChapterListProps): JSX.Element {
  const activeRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<ChapterListEntry[]>(() => {
    const result: ChapterListEntry[] = []
    let lastVolumeIndex: number | null = null

    chapters.forEach((chapter, index) => {
      if (
        chapter.volumeIndex !== undefined &&
        chapter.volumeIndex !== lastVolumeIndex
      ) {
        result.push({
          kind: 'volume',
          key: `volume-${chapter.volumeIndex}-${index}`,
          volumeIndex: chapter.volumeIndex,
          title: chapter.volumeTitle
        })
        lastVolumeIndex = chapter.volumeIndex
      }

      result.push({
        kind: 'chapter',
        key: `chapter-${index}`,
        chapter,
        index
      })
    })

    return result
  }, [chapters])

  const shouldVirtualize = entries.length > VIRTUALIZE_THRESHOLD
  const entryOffsets = useMemo(() => {
    const offsets = [0]
    for (const entry of entries) {
      offsets.push(offsets[offsets.length - 1] + getEntryHeight(entry))
    }
    return offsets
  }, [entries])
  const totalHeight = entryOffsets[entryOffsets.length - 1] ?? 0
  const activeEntryIndex = useMemo(
    () => entries.findIndex((entry) => entry.kind === 'chapter' && entry.index === currentChapterIndex),
    [currentChapterIndex, entries]
  )
  const [scrollTop, setScrollTop] = useState(() => {
    if (!shouldVirtualize || activeEntryIndex < 0) return 0
    return Math.max(0, entryOffsets[activeEntryIndex] - VIRTUALIZE_OVERSCAN * CHAPTER_ROW_HEIGHT)
  })
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT)

  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: entries.length,
        topPadding: 0,
        bottomPadding: 0,
        visibleEntries: entries
      }
    }

    const firstVisible = findEntryAtOffset(entryOffsets, Math.max(0, scrollTop))
    const startIndex = Math.max(0, firstVisible - VIRTUALIZE_OVERSCAN)
    const endOffset = scrollTop + Math.max(viewportHeight, DEFAULT_VIEWPORT_HEIGHT)
    let endIndex = Math.min(entries.length, firstVisible + 1)
    while (
      endIndex < entries.length &&
      entryOffsets[endIndex] < endOffset + VIRTUALIZE_OVERSCAN * CHAPTER_ROW_HEIGHT
    ) {
      endIndex++
    }

    return {
      startIndex,
      endIndex,
      topPadding: entryOffsets[startIndex],
      bottomPadding: totalHeight - entryOffsets[endIndex],
      visibleEntries: entries.slice(startIndex, endIndex)
    }
  }, [entries, entryOffsets, scrollTop, shouldVirtualize, totalHeight, viewportHeight])

  // 当前章节变化时，滚动到可见区域。
  useEffect(() => {
    if (activeEntryIndex < 0) return

    if (shouldVirtualize && listRef.current) {
      const nextScrollTop = Math.max(
        0,
        entryOffsets[activeEntryIndex] - VIRTUALIZE_OVERSCAN * CHAPTER_ROW_HEIGHT
      )
      if (Math.abs(listRef.current.scrollTop - nextScrollTop) > 2) {
        listRef.current.scrollTop = nextScrollTop
      }
      setScrollTop(nextScrollTop)
      setViewportHeight(listRef.current.clientHeight || DEFAULT_VIEWPORT_HEIGHT)
      return
    }

    if (activeRef.current && activeRef.current.scrollIntoView) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeEntryIndex, currentChapterIndex, entryOffsets, shouldVirtualize])

  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    if (!shouldVirtualize) return
    setScrollTop(event.currentTarget.scrollTop)
    setViewportHeight(event.currentTarget.clientHeight || DEFAULT_VIEWPORT_HEIGHT)
  }

  const renderEntry = (entry: ChapterListEntry): JSX.Element => {
    if (entry.kind === 'volume') {
      return (
        <div key={entry.key} className="chapter-list-volume" aria-label={`第${entry.volumeIndex}卷`}>
          <span className="chapter-list-volume-index">第{entry.volumeIndex}卷</span>
          {entry.title && <span className="chapter-list-volume-title">{entry.title}</span>}
        </div>
      )
    }

    const { chapter, index } = entry
    const nested = chapter.volumeIndex !== undefined && chapter.type !== 'volume'
    return (
      <button
        key={entry.key}
        ref={index === currentChapterIndex ? activeRef : undefined}
        className={`chapter-list-item${index === currentChapterIndex ? ' active' : ''}${nested ? ' nested' : ''}`}
        style={shouldVirtualize ? { height: CHAPTER_ROW_HEIGHT } : undefined}
        onClick={() => onSelectChapter(index)}
        title={chapter.title}
        role="listitem"
        aria-current={index === currentChapterIndex ? 'true' : undefined}
      >
        <span className="chapter-list-item-type">{getChapterTypeLabel(chapter)}</span>
        <span className="chapter-list-item-title">{chapter.title}</span>
      </button>
    )
  }

  return (
    <div className="chapter-list" role="navigation" aria-label="章节目录">
      <div className="chapter-list-header">目录</div>
      <div
        ref={listRef}
        className="chapter-list-items"
        role="list"
        onScroll={handleScroll}
      >
        {virtualWindow.topPadding > 0 && (
          <div
            className="chapter-list-spacer"
            style={{ height: virtualWindow.topPadding }}
            aria-hidden="true"
          />
        )}
        {virtualWindow.visibleEntries.map(renderEntry)}
        {virtualWindow.bottomPadding > 0 && (
          <div
            className="chapter-list-spacer"
            style={{ height: virtualWindow.bottomPadding }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}
