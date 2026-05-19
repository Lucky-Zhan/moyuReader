import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BookshelfView from '../../src/renderer/src/components/BookshelfView'

// Mock window.api
const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { api: { invoke: typeof mockInvoke } }).api = {
    invoke: mockInvoke
  }
})

function mockBookshelfProgress(percentage = 0): void {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'bookshelf:getProgress') {
      return Promise.resolve({ chapterIndex: 0, scrollPosition: 0, percentage })
    }
    return Promise.resolve(undefined)
  })
}

describe('BookshelfView', () => {
  it('shows empty state when no books', async () => {
    mockInvoke.mockResolvedValueOnce([])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('书架为空，请导入小说')).toBeTruthy()
    })
  })

  it('renders book list with titles and progress', async () => {
    mockBookshelfProgress(37)
    mockInvoke.mockResolvedValueOnce([
      { id: '1', title: '测试小说', chapters: [], fileSize: 100 },
      { id: '2', title: '另一本书', chapters: [], fileSize: 200 }
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
    mockInvoke.mockResolvedValueOnce([
      { id: '1', title: longTitle, chapters: [], fileSize: 100 }
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      const expected = 'A'.repeat(50) + '…'
      expect(screen.getByText(expected)).toBeTruthy()
    })
  })

  it('calls onOpenBook when clicking a book', async () => {
    mockBookshelfProgress()
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '点击测试', chapters: [], fileSize: 100 }
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
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '删除测试', chapters: [], fileSize: 100 }
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('删除测试')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText('确定要删除这本小说吗？删除后将无法恢复。')).toBeTruthy()
  })

  it('calls bookshelf:remove on confirm delete', async () => {
    mockBookshelfProgress()
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '删除确认', chapters: [], fileSize: 100 }
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('删除确认')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('删除'))
    // After confirm dialog appears, mock the remove call and reload
    mockInvoke.mockResolvedValueOnce(undefined) // bookshelf:remove
    mockInvoke.mockResolvedValueOnce([]) // bookshelf:getAll reload

    fireEvent.click(screen.getByText('确认删除'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('bookshelf:remove', 'book-1')
    })
  })

  it('cancels delete when clicking cancel', async () => {
    mockBookshelfProgress()
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '取消删除', chapters: [], fileSize: 100 }
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
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '编辑测试', chapters: [], fileSize: 100 }
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
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '旧书名', chapters: [], fileSize: 100 }
    ])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('旧书名')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('编辑'))

    const input = screen.getByDisplayValue('旧书名')
    fireEvent.change(input, { target: { value: '新书名' } })

    mockInvoke.mockResolvedValueOnce(undefined) // bookshelf:updateTitle
    mockInvoke.mockResolvedValueOnce([
      { id: 'book-1', title: '新书名', chapters: [], fileSize: 100 }
    ])

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('bookshelf:updateTitle', 'book-1', '新书名')
    })
  })

  it('calls file:import when import button is clicked', async () => {
    mockInvoke.mockResolvedValueOnce([])

    render(<BookshelfView onOpenBook={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('书架为空，请导入小说')).toBeTruthy()
    })

    mockInvoke.mockResolvedValueOnce({ success: true }) // file:import
    mockInvoke.mockResolvedValueOnce([]) // bookshelf:getAll reload

    const importButtons = screen.getAllByText('导入小说')
    fireEvent.click(importButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('file:import')
    })
  })
})
