import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterList } from '../../src/renderer/src/components/ChapterList'
import type { Chapter } from '../../src/shared/types'

const mockChapters: Chapter[] = [
  { title: '第一章 开始', offset: 0, length: 3000 },
  { title: '第二章 发展', offset: 3000, length: 3000 },
  { title: '第三章 高潮', offset: 6000, length: 3000 },
  { title: '第四章 结局', offset: 9000, length: 2000 }
]

describe('ChapterList', () => {
  it('renders all chapter titles', () => {
    render(
      <ChapterList
        chapters={mockChapters}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
      />
    )

    expect(screen.getByText('第一章 开始')).toBeTruthy()
    expect(screen.getByText('第二章 发展')).toBeTruthy()
    expect(screen.getByText('第三章 高潮')).toBeTruthy()
    expect(screen.getByText('第四章 结局')).toBeTruthy()
  })

  it('renders header with title "目录"', () => {
    render(
      <ChapterList
        chapters={mockChapters}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
      />
    )

    expect(screen.getByText('目录')).toBeTruthy()
  })

  it('highlights the current chapter with active class', () => {
    render(
      <ChapterList
        chapters={mockChapters}
        currentChapterIndex={1}
        onSelectChapter={vi.fn()}
      />
    )

    const activeItem = screen.getByText('第二章 发展').closest('button')!
    expect(activeItem.className).toContain('active')

    const inactiveItem = screen.getByText('第一章 开始').closest('button')!
    expect(inactiveItem.className).not.toContain('active')
  })

  it('calls onSelectChapter with correct index when clicking a chapter', () => {
    const onSelectChapter = vi.fn()

    render(
      <ChapterList
        chapters={mockChapters}
        currentChapterIndex={0}
        onSelectChapter={onSelectChapter}
      />
    )

    fireEvent.click(screen.getByText('第三章 高潮'))
    expect(onSelectChapter).toHaveBeenCalledWith(2)
  })

  it('renders empty list when no chapters provided', () => {
    render(
      <ChapterList
        chapters={[]}
        currentChapterIndex={0}
        onSelectChapter={vi.fn()}
      />
    )

    expect(screen.getByText('目录')).toBeTruthy()
    const listItems = screen.queryAllByRole('listitem')
    expect(listItems).toHaveLength(0)
  })

  it('sets aria-current on the active chapter', () => {
    render(
      <ChapterList
        chapters={mockChapters}
        currentChapterIndex={2}
        onSelectChapter={vi.fn()}
      />
    )

    const activeItem = screen.getByText('第三章 高潮').closest('button')!
    expect(activeItem.getAttribute('aria-current')).toBe('true')

    const inactiveItem = screen.getByText('第一章 开始').closest('button')!
    expect(inactiveItem.getAttribute('aria-current')).toBeNull()
  })
})
