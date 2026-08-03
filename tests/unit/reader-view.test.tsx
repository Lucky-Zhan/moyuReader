import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReaderView } from '../../src/renderer/src/components/ReaderView'
import type { Chapter, ReadingProgress } from '../../src/shared/types'
import { createMockApi } from './mock-api'

// Mock window.api
beforeEach(() => {
  window.api = createMockApi()
})

const sampleContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n'.repeat(100)

const sampleChapters: Chapter[] = [
  { title: '第一章', offset: 0, length: 1500 },
  { title: '第二章', offset: 1500, length: 1500 }
]

const defaultProgress: ReadingProgress = {
  chapterIndex: 0,
  scrollPosition: 0,
  percentage: 0
}

function openFontSettings(): void {
  fireEvent.click(screen.getByLabelText('阅读排版设置'))
}

describe('ReaderView', () => {
  it('renders content text', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    // Content should be rendered
    const contentArea = screen.getByRole('document')
    expect(contentArea).toBeDefined()
    expect(contentArea.textContent).toContain('Line 1')
  })

  it('displays progress percentage in status bar', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={{ ...defaultProgress, percentage: 42 }}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    // Initial percentage should be shown (starts at progress.percentage)
    const statusBar = document.querySelector('.reader-status-bar')
    expect(statusBar).not.toBeNull()
    expect(statusBar!.textContent).toContain('42%')
  })

  it('renders back button and calls onBack when clicked', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const backBtn = screen.getByLabelText('返回')
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('keeps font settings collapsed until the reader opens them', () => {
    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
      />
    )

    const settings = document.querySelector('.reader-font-settings') as HTMLDetailsElement
    expect(settings.open).toBe(false)
    expect(screen.getByLabelText('阅读排版设置')).toBeDefined()

    openFontSettings()
    expect(settings.open).toBe(true)
    expect(screen.getByLabelText('选择字体')).toBeDefined()

    fireEvent.click(screen.getByLabelText('阅读排版设置'))
    expect(settings.open).toBe(false)
  })

  it('keeps the full reading toolbar collapsed until requested', () => {
    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
      />
    )

    const toolbarDrawer = document.querySelector('.reader-toolbar-drawer') as HTMLDetailsElement
    expect(toolbarDrawer.open).toBe(false)

    fireEvent.click(screen.getByLabelText('显示/隐藏阅读工具栏'))
    expect(toolbarDrawer.open).toBe(true)

    fireEvent.click(screen.getByLabelText('显示/隐藏阅读工具栏'))
    expect(toolbarDrawer.open).toBe(false)
  })

  it('renders font size controls with default size', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    // Default font size is 16px
    expect(screen.getByText('16px')).toBeDefined()
  })

  it('increases font size when + button is clicked', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const increaseBtn = screen.getByLabelText('增大字号')
    fireEvent.click(increaseBtn)

    // Font size should increase by step (2px): 16 -> 18
    expect(screen.getByText('18px')).toBeDefined()
    expect(window.api.settings.setFontSize).toHaveBeenCalledWith(18)
  })

  it('decreases font size when - button is clicked', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const decreaseBtn = screen.getByLabelText('减小字号')
    fireEvent.click(decreaseBtn)

    // Font size should decrease by step (2px): 16 -> 14
    expect(screen.getByText('14px')).toBeDefined()
    expect(window.api.settings.setFontSize).toHaveBeenCalledWith(14)
  })

  it('disables decrease button at minimum font size (12px)', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const decreaseBtn = screen.getByLabelText('减小字号')
    // Click twice to go from 16 -> 14 -> 12
    fireEvent.click(decreaseBtn)
    fireEvent.click(decreaseBtn)

    expect(screen.getByText('12px')).toBeDefined()
    expect(decreaseBtn).toHaveProperty('disabled', true)
  })

  it('disables increase button at maximum font size (48px)', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const increaseBtn = screen.getByLabelText('增大字号')
    // Click 16 times to go from 16 to 48 (step 2)
    for (let i = 0; i < 16; i++) {
      fireEvent.click(increaseBtn)
    }

    expect(screen.getByText('48px')).toBeDefined()
    expect(increaseBtn).toHaveProperty('disabled', true)
  })

  it('renders font family selector with options', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const select = screen.getByLabelText('选择字体')
    expect(select).toBeDefined()
    // Should have multiple font options
    const options = select.querySelectorAll('option')
    expect(options.length).toBeGreaterThan(1)
  })

  it('changes font family when a new option is selected', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const select = screen.getByLabelText('选择字体')
    fireEvent.change(select, { target: { value: 'SimSun, serif' } })

    expect(window.api.settings.setFontFamily).toHaveBeenCalledWith('SimSun, serif')
  })

  it('handles ArrowDown key for page down', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const contentArea = screen.getByRole('document')
    fireEvent.keyDown(contentArea, { key: 'ArrowDown' })

    // In jsdom, scrollTop doesn't actually change, but we verify the handler doesn't throw
    expect(contentArea).toBeDefined()
  })

  it('handles ArrowUp key for page up', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const contentArea = screen.getByRole('document')
    fireEvent.keyDown(contentArea, { key: 'ArrowUp' })

    // In jsdom, scrollTop doesn't actually change, but we verify the handler doesn't throw
    expect(contentArea).toBeDefined()
  })

  it('applies font size and family to content area style', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const contentArea = screen.getByRole('document')
    expect(contentArea.style.fontSize).toBe('16px')
    expect(contentArea.style.fontFamily).toBe('Consolas, monospace')
  })

  it('restores scroll position when progress changes', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    const { rerender } = render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const contentArea = screen.getByRole('document') as HTMLDivElement
    rerender(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={{ chapterIndex: 1, scrollPosition: 240, percentage: 45 }}
        navigationKey={1}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    expect(contentArea.scrollTop).toBe(240)
    expect(screen.getByText('阅读进度：45%')).toBeDefined()
  })

  it('does not force scrollTop again for progress emitted by scrolling', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    })

    const { rerender } = render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    const contentArea = screen.getByRole('document') as HTMLDivElement
    contentArea.scrollTop = 120
    fireEvent.scroll(contentArea)

    const emittedProgress = onProgressChange.mock.calls.at(-1)?.[0] as ReadingProgress
    contentArea.scrollTop = 180

    rerender(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={emittedProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    expect(contentArea.scrollTop).toBe(180)
  })

  it('opens the next chapter when scrolling near the bottom', () => {
    const onSelectChapter = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    })

    render(
      <ReaderView
        content={sampleContent}
        chapterContent={{
          bookId: 'book-1',
          chapterIndex: 0,
          title: '第一章',
          content: sampleContent,
          offset: 0,
          length: sampleContent.length,
          totalLength: sampleContent.length * 2,
          totalChapters: 2
        }}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onSelectChapter={onSelectChapter}
      />
    )

    const contentArea = screen.getByRole('document') as HTMLDivElement
    contentArea.scrollTop = 470
    fireEvent.scroll(contentArea)
    fireEvent.scroll(contentArea)

    expect(onSelectChapter).toHaveBeenCalledTimes(1)
    expect(onSelectChapter).toHaveBeenCalledWith(1)
  })

  it('opens the next chapter with a downward wheel on a short chapter', () => {
    const onSelectChapter = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 400
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    })

    render(
      <ReaderView
        content="短章节"
        chapterContent={{
          bookId: 'book-1',
          chapterIndex: 0,
          title: '第一章',
          content: '短章节',
          offset: 0,
          length: 4,
          totalLength: 8,
          totalChapters: 2
        }}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onSelectChapter={onSelectChapter}
      />
    )

    fireEvent.wheel(screen.getByRole('document'), { deltaY: 120 })

    expect(onSelectChapter).toHaveBeenCalledWith(1)
  })

  it('appends the next chapter to the same scroll stream', async () => {
    const nextChapter: ChapterContent = {
      bookId: 'book-1',
      chapterIndex: 1,
      title: '第二章',
      content: '第二章\n下一段正文',
      offset: 1500,
      length: 1500,
      totalLength: 3000,
      totalChapters: 2
    }
    const onLoadChapterContent = vi.fn().mockResolvedValue(nextChapter)

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    })

    render(
      <ReaderView
        content={sampleContent}
        chapterContent={{
          bookId: 'book-1',
          chapterIndex: 0,
          title: '第一章',
          content: '第一章\n本章正文',
          offset: 0,
          length: 1500,
          totalLength: 3000,
          totalChapters: 2
        }}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onLoadChapterContent={onLoadChapterContent}
      />
    )

    const contentArea = screen.getByRole('document') as HTMLDivElement
    contentArea.scrollTop = 470
    fireEvent.scroll(contentArea)

    await waitFor(() => {
      expect(onLoadChapterContent).toHaveBeenCalledWith(1)
      expect(contentArea.textContent).toContain('第二章\n下一段正文')
    })
  })

  it('prepends the previous chapter when scrolling back to the top', async () => {
    const previousChapter: ChapterContent = {
      bookId: 'book-1',
      chapterIndex: 0,
      title: '第一章',
      content: '第一章\n上一段正文',
      offset: 0,
      length: 1500,
      totalLength: 3000,
      totalChapters: 2
    }
    const onLoadChapterContent = vi.fn().mockResolvedValue(previousChapter)

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    })

    render(
      <ReaderView
        content="第二章\n本章正文"
        chapterContent={{
          bookId: 'book-1',
          chapterIndex: 1,
          title: '第二章',
          content: '第二章\n本章正文',
          offset: 1500,
          length: 1500,
          totalLength: 3000,
          totalChapters: 2
        }}
        chapters={sampleChapters}
        progress={{ ...defaultProgress, chapterIndex: 1 }}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onLoadChapterContent={onLoadChapterContent}
      />
    )

    const contentArea = screen.getByRole('document') as HTMLDivElement
    contentArea.scrollTop = 0
    fireEvent.scroll(contentArea)

    await waitFor(() => {
      expect(onLoadChapterContent).toHaveBeenCalledWith(0)
      expect(contentArea.textContent).toContain('第一章\n上一段正文')
    })
  })

  it('changes line height when line height controls are clicked', () => {
    const onProgressChange = vi.fn()
    const onBack = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={onProgressChange}
        onBack={onBack}
      />
    )

    openFontSettings()
    const increaseBtn = screen.getByLabelText('增大行距')
    fireEvent.click(increaseBtn)

    const contentArea = screen.getByRole('document')
    expect(contentArea.style.lineHeight).toBe('2')
    expect(window.api.settings.setLineHeight).toHaveBeenCalledWith(2)
  })

  it('submits search queries and opens selected search results', () => {
    const onSearch = vi.fn()
    const onSelectSearchResult = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onSearch={onSearch}
        onSelectSearchResult={onSelectSearchResult}
        searchResults={[
          {
            bookId: 'book-1',
            chapterIndex: 1,
            chapterTitle: '第二章',
            chapterOffset: 10,
            absoluteOffset: 1510,
            snippet: '命中的正文片段'
          }
        ]}
      />
    )

    fireEvent.change(screen.getByLabelText('搜索正文'), { target: { value: '正文' } })
    fireEvent.click(screen.getByText('搜索'))
    fireEvent.click(screen.getByText('命中的正文片段'))

    expect(onSearch).toHaveBeenCalledWith('正文')
    expect(onSelectSearchResult).toHaveBeenCalledWith(expect.objectContaining({
      chapterIndex: 1,
      snippet: '命中的正文片段'
    }))
  })

  it('supports adding, jumping to and removing bookmarks', () => {
    const onAddBookmark = vi.fn()
    const onSelectBookmark = vi.fn()
    const onRemoveBookmark = vi.fn()

    render(
      <ReaderView
        content={sampleContent}
        chapters={sampleChapters}
        progress={defaultProgress}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onAddBookmark={onAddBookmark}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
        bookmarks={[
          {
            id: 'bookmark-1',
            bookId: 'book-1',
            chapterIndex: 0,
            scrollPosition: 10,
            percentage: 12,
            title: '第一章',
            excerpt: '书签摘录',
            createdAt: 1000
          }
        ]}
      />
    )

    fireEvent.click(screen.getByLabelText('添加书签'))
    fireEvent.click(screen.getByText('书签 1'))
    fireEvent.click(screen.getByText('第一章'))
    fireEvent.click(screen.getByLabelText('删除书签 第一章'))

    expect(onAddBookmark).toHaveBeenCalled()
    expect(onSelectBookmark).toHaveBeenCalledWith(expect.objectContaining({ id: 'bookmark-1' }))
    expect(onRemoveBookmark).toHaveBeenCalledWith('bookmark-1')
  })
})
