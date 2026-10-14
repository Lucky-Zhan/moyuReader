import { useMemo } from 'react'
import type { KeyboardEvent, RefObject, WheelEvent } from 'react'
import type { ChapterContent } from '@shared/types'

export interface ReaderSurfaceProps {
  contentRef: RefObject<HTMLDivElement>
  content: string
  loadedChapterContents: ChapterContent[]
  fontSize: number
  fontFamily: string
  lineHeight: number
  onScroll: () => void
  onWheel: (event: WheelEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onClick: () => void
}

/**
 * 把章节正文切成段落。
 *
 * 之前直接把整章字符串塞进 JSX，React 只会生成**一个文本节点**，而 HTML
 * 会把 `\n` 折叠成空格：整章正文挤成一大坨，段落缩进和空行全部丢失。
 * 这里按换行切分并渲染成独立的 <p>，同时跳过纯空白行，让空行只作为
 * 段落间距存在，而不是渲染出一堆空节点。
 *
 * 空行本身不丢信息：`\n\n` 与 `\n` 在阅读上都是"分段"，统一由 CSS 的
 * 段落间距表达。
 */
function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = []
  let start = 0

  for (let index = 0; index <= text.length; index++) {
    const isBreak = index === text.length || text.charCodeAt(index) === 10
    if (!isBreak) continue

    const end = index > start && text.charCodeAt(index - 1) === 13 ? index - 1 : index
    const line = text.slice(start, end)
    if (line.trim().length > 0) {
      paragraphs.push(line)
    }
    start = index + 1
  }

  return paragraphs
}

/** 单章正文：按段落渲染，保留段落边界。 */
function ChapterBody({ content }: { content: string }): JSX.Element {
  const paragraphs = useMemo(() => splitParagraphs(content), [content])

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="reader-paragraph">
          {paragraph}
        </p>
      ))}
    </>
  )
}

/** The text canvas is kept free of toolbar state so native scrolling stays hot. */
export function ReaderSurface({
  contentRef,
  content,
  loadedChapterContents,
  fontSize,
  fontFamily,
  lineHeight,
  onScroll,
  onWheel,
  onKeyDown,
  onClick
}: ReaderSurfaceProps): JSX.Element {
  return (
    <div
      ref={contentRef}
      className="reader-content"
      tabIndex={0}
      onScroll={onScroll}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onClick={onClick}
      style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight }}
      role="document"
      aria-label="阅读内容"
    >
      {loadedChapterContents.length > 0 ? (
        loadedChapterContents.map((chapter) => (
          <div
            key={chapter.chapterIndex}
            className="reader-chapter-block"
            data-reader-chapter-index={chapter.chapterIndex}
          >
            <ChapterBody content={chapter.content} />
          </div>
        ))
      ) : (
        <ChapterBody content={content} />
      )}
    </div>
  )
}

export default ReaderSurface
