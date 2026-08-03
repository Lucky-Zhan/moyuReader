import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BookshelfView from '../../src/renderer/src/components/BookshelfView'
import type { MoyuApi } from '../../src/shared/moyu-api'
import type { BookMeta } from '../../src/shared/types'
import { createMockApi } from './mock-api'

let api: MoyuApi

beforeEach(() => {
  vi.clearAllMocks()
  api = createMockApi()
  window.api = api
})

function createBook(id: string, title: string, fileSize = 100): BookMeta {
  return {
    id,
    title,
    filePath: `/tmp/${id}.txt`,
    fileSize,
    chapters: [],
    addedAt: 1,
    lastReadAt: 1
  }
}

function mockBookshelfProgress(percentage = 0): void {
  vi.mocked(api.bookshelf.getProgress).mockResolvedValue({
    chapterIndex: 0,
    scrollPosition: 0,
    percentage
  })
}

describe('BookshelfView', () => {
  it('shows empty state when no books', async () => {
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('书架为空，请导入小说')).toBeTruthy()
    })
  })

  it('renders book list with titles and progress', async () => {
    mockBookshelfProgress(37)
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([
      createBook('1', '测试小说'),
      createBook('2', '另一本书', 200)
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('测试小说')).toBeTruthy()
      expect(screen.getByText('另一本书')).toBeTruthy()
      expect(screen.getAllByText('进度：37%').length).toBe(2)
    })
  })

  it('truncates long titles to 50 characters with ellipsis', async () => {
    mockBookshelfProgress()
    const longTitle = 'A'.repeat(60)
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([createBook('1', longTitle)])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      const expected = 'A'.repeat(50) + '…'
      expect(screen.getByText(expected)).toBeTruthy()
    })
  })

  it('calls onOpenBook when clicking a book', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([
      createBook('book-1', '点击测试')
    ])
    const onOpenBook = vi.fn()

    render(<BookshelfView onOpenBook={onOpenBook} />)

    await waitFor(() => {
      expect(screen.getByText('点击测试')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('点击测试'))
    expect(onOpenBook).toHaveBeenCalledWith('book-1')
  })

  it('shows delete confirmation dialog', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([
      createBook('book-1', '删除测试')
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('删除测试')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText('确定要删除这本小说吗？删除后将无法恢复。')).toBeTruthy()
  })

  it('calls bookshelf.remove on confirm delete', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll)
      .mockResolvedValueOnce([createBook('book-1', '删除确认')])
      .mockResolvedValueOnce([])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('删除确认')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除'))
    fireEvent.click(screen.getByText('确认删除'))

    await waitFor(() => {
      expect(api.bookshelf.remove).toHaveBeenCalledWith('book-1')
    })
  })

  it('cancels delete when clicking cancel', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([
      createBook('book-1', '取消删除')
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('取消删除')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText('确定要删除这本小说吗？删除后将无法恢复。')).toBeTruthy()

    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByText('确定要删除这本小说吗？删除后将无法恢复。')).toBeNull()
  })

  it('enables inline edit on edit button click', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll).mockResolvedValueOnce([
      createBook('book-1', '编辑测试')
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('编辑测试')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('编辑'))

    const input = screen.getByDisplayValue('编辑测试') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.maxLength).toBe(50)
  })

  it('saves edited title on Enter key', async () => {
    mockBookshelfProgress()
    vi.mocked(api.bookshelf.getAll)
      .mockResolvedValueOnce([createBook('book-1', '旧书名')])
      .mockResolvedValueOnce([createBook('book-1', '新书名')])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('旧书名')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('编辑'))

    const input = screen.getByDisplayValue('旧书名')
    fireEvent.change(input, { target: { value: '新书名' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(api.bookshelf.updateTitle).toHaveBeenCalledWith('book-1', '新书名')
    })
  })

  it('calls file.importMany when import button is clicked', async () => {
    vi.mocked(api.bookshelf.getAll)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{ success: true }])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('书架为空，请导入小说')).toBeTruthy()
    })

    const importButtons = screen.getAllByText('导入小说')
    fireEvent.click(importButtons[0])

    await waitFor(() => {
      expect(api.file.importMany).toHaveBeenCalled()
    })
  })

  it('exports and restores backups from the bookshelf header', async () => {
    vi.mocked(api.bookshelf.getAll)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    vi.mocked(api.backup.export).mockResolvedValueOnce({ success: true })
    vi.mocked(api.backup.restore).mockResolvedValueOnce({ success: true, importedBooks: 2 })

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('书架为空，请导入小说')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('备份'))
    fireEvent.click(screen.getByText('恢复'))

    await waitFor(() => {
      expect(api.backup.export).toHaveBeenCalled()
      expect(api.backup.restore).toHaveBeenCalled()
    })
  })
})
