import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BookshelfView from '../../src/renderer/src/components/BookshelfView'
import type { MoyuApi } from '../../src/shared/moyu-api'
import type { BookMeta } from '../../src/shared/types'
import { createMockApi } from './mock-api'

let api: MoyuApi
beforeEach(() => { vi.clearAllMocks(); api = createMockApi(); window.api = api })

function book(id: string, title: string): BookMeta {
  return { id, title, filePath:`/tmp/${id}.txt`, fileSize:100, chapters:[], addedAt:1, lastReadAt:1 }
}

describe('verify bookshelf fixes', () => {
  it('Enter then blur commits the title only once', async () => {
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([{ book: book('1','旧名'), progress: null }])
    render(<BookshelfView onOpenBook={vi.fn()} />)
    await screen.findByText('旧名')
    fireEvent.click(screen.getByLabelText(/^重命名《/))
    const input = screen.getByDisplayValue('旧名')
    fireEvent.change(input, { target: { value: '新名' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await waitFor(() => expect(api.bookshelf.updateTitle).toHaveBeenCalled())
    expect(vi.mocked(api.bookshelf.updateTitle).mock.calls).toEqual([['1','新名']])
  })

  it('Escape cancels without saving', async () => {
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([{ book: book('1','原名'), progress: null }])
    render(<BookshelfView onOpenBook={vi.fn()} />)
    await screen.findByText('原名')
    fireEvent.click(screen.getByLabelText(/^重命名《/))
    const input = screen.getByDisplayValue('原名')
    fireEvent.change(input, { target: { value: '不该保存' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByDisplayValue('不该保存')).toBeNull())
    expect(api.bookshelf.updateTitle).not.toHaveBeenCalled()
  })

  it('uses one getLibrary call instead of N getProgress calls', async () => {
    const many = Array.from({ length: 6 }, (_, i) => book(String(i), `书${i}`))
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue(many.map(b => ({ book: b, progress: null })))
    render(<BookshelfView onOpenBook={vi.fn()} />)
    await screen.findByText('书0')
    expect(api.bookshelf.getLibrary).toHaveBeenCalledTimes(1)
    expect(api.bookshelf.getProgress).not.toHaveBeenCalled()
  })

  it('delete dialog focuses cancel, closes on Escape, restores focus', async () => {
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([{ book: book('1','删除测试'), progress: null }])
    render(<BookshelfView onOpenBook={vi.fn()} />)
    await screen.findByText('删除测试')
    const del = screen.getByLabelText(/^删除《/)
    del.focus()
    fireEvent.click(del)
    await waitFor(() => expect(document.activeElement?.textContent).toBe('取消'))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(document.activeElement).toBe(del)
  })
})
