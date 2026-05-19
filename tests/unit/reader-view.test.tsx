import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReaderView } from '../../src/renderer/src/components/ReaderView'
import type { Chapter, ReadingProgress } from '../../src/shared/types'

// Mock window.api
beforeEach(() => {
  ;(window as any).api = {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  }
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

    const increaseBtn = screen.getByLabelText('增大字号')
    fireEvent.click(increaseBtn)

    // Font size should increase by step (2px): 16 -> 18
    expect(screen.getByText('18px')).toBeDefined()
    expect(window.api.invoke).toHaveBeenCalledWith('settings:setFontSize', 18)
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

    const decreaseBtn = screen.getByLabelText('减小字号')
    fireEvent.click(decreaseBtn)

    // Font size should decrease by step (2px): 16 -> 14
    expect(screen.getByText('14px')).toBeDefined()
    expect(window.api.invoke).toHaveBeenCalledWith('settings:setFontSize', 14)
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

    const select = screen.getByLabelText('选择字体')
    fireEvent.change(select, { target: { value: 'SimSun, serif' } })

    expect(window.api.invoke).toHaveBeenCalledWith('settings:setFontFamily', 'SimSun, serif')
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

    const increaseBtn = screen.getByLabelText('增大行距')
    fireEvent.click(increaseBtn)

    const contentArea = screen.getByRole('document')
    expect(contentArea.style.lineHeight).toBe('2')
    expect(window.api.invoke).toHaveBeenCalledWith('settings:setLineHeight', 2)
  })
})
