import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChapterDrawer from '../../src/renderer/src/components/ChapterDrawer'
import type { Chapter } from '../../src/shared/types'

const chapters: Chapter[] = [
  { title: '第一章 开始', offset: 0, length: 1200 },
  { title: '第二章 继续', offset: 1200, length: 1200 }
]

describe('ChapterDrawer', () => {
  it('does not render while closed', () => {
    render(
      <ChapterDrawer
        open={false}
        chapters={chapters}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a dialog while open without requiring window.api', () => {
    const originalApi = window.api
    // @ts-expect-error renderer API is intentionally absent in this presentation-only test.
    delete window.api

    render(
      <ChapterDrawer
        open
        chapters={chapters}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('第一章 开始')).toBeTruthy()
    window.api = originalApi
  })

  it('closes from Escape or the backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ChapterDrawer
        open
        chapters={chapters}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(container.querySelector('.chapter-drawer-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('selects a chapter once and closes once', () => {
    const onSelectChapter = vi.fn()
    const onClose = vi.fn()
    render(
      <ChapterDrawer
        open
        chapters={chapters}
        currentChapterIndex={0}
        onSelectChapter={onSelectChapter}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByText('第二章 继续'))
    expect(onSelectChapter).toHaveBeenCalledTimes(1)
    expect(onSelectChapter).toHaveBeenCalledWith(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus to close and restores focus to the trigger', async () => {
    const onClose = vi.fn()
    const triggerRef = { current: null as HTMLButtonElement | null }
    const Trigger = ({ open }: { open: boolean }): JSX.Element => (
      <>
        <button ref={(node) => { triggerRef.current = node }}>目录</button>
        <ChapterDrawer
          open={open}
          chapters={chapters}
          currentChapterIndex={0}
          onSelectChapter={vi.fn()}
          onClose={onClose}
          triggerRef={triggerRef}
        />
      </>
    )

    const { rerender } = render(<Trigger open />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('关闭目录')))

    rerender(<Trigger open={false} />)
    await waitFor(() => expect(document.activeElement).toBe(triggerRef.current))
  })
})
