import { useEffect, useRef } from 'react'
import type { Chapter } from '../../../shared/types'
import './ChapterList.css'

function getChapterTypeLabel(chapter: Chapter): string {
  if (chapter.type === 'volume') return '卷'
  if (chapter.type === 'section') return '段'
  if (/^第[一二三四五六七八九十百千万零\d]+[卷部集篇]|^卷[一二三四五六七八九十百千万零\d]+/.test(chapter.title)) {
    return '卷'
  }
  if (/^第\s*\d+\s*段/.test(chapter.title)) return '段'
  return '章'
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
 * 章节目录侧边栏组件
 * 显示章节列表，高亮当前章节，点击跳转到对应章节
 */
export function ChapterList({
  chapters,
  currentChapterIndex,
  onSelectChapter
}: ChapterListProps): JSX.Element {
  const activeRef = useRef<HTMLButtonElement>(null)

  // 当前章节变化时，滚动到可见区域
  useEffect(() => {
    if (activeRef.current && activeRef.current.scrollIntoView) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentChapterIndex])

  return (
    <div className="chapter-list" role="navigation" aria-label="章节目录">
      <div className="chapter-list-header">目录</div>
      <div className="chapter-list-items" role="list">
        {chapters.map((chapter, index) => (
          <button
            key={index}
            ref={index === currentChapterIndex ? activeRef : undefined}
            className={`chapter-list-item${index === currentChapterIndex ? ' active' : ''}`}
            onClick={() => onSelectChapter(index)}
            title={chapter.title}
            role="listitem"
            aria-current={index === currentChapterIndex ? 'true' : undefined}
          >
            <span className="chapter-list-item-type">{getChapterTypeLabel(chapter)}</span>
            <span className="chapter-list-item-title">{chapter.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
