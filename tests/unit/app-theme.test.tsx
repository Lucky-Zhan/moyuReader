import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../../src/renderer/src/App'
import {
  AUTO_SAVE_INTERVAL,
  DEFAULT_HIDE_SHORTCUT
} from '../../src/shared/constants'
import type { MoyuApi } from '../../src/shared/moyu-api'
import type { BookMeta, ReaderOpenResult } from '../../src/shared/types'
import { createMockApi } from './mock-api'

const defaultSettings = {
  fontSize: 16,
  fontFamily: 'Consolas, monospace',
  lineHeight: 1.8,
  disguiseTheme: 'dark' as const,
  stealthEnabled: true,
  hideShortcut: DEFAULT_HIDE_SHORTCUT,
  autoSaveInterval: AUTO_SAVE_INTERVAL
}

const defaultBook: BookMeta = {
  id: 'book-1',
  title: '测试小说',
  filePath: '/tmp/test.txt',
  fileSize: 20,
  chapters: [{ title: '第一章', offset: 0, length: 20 }],
  addedAt: 1,
  lastReadAt: 1
}

let api: MoyuApi

function createOpenResult(overrides?: Partial<ReaderOpenResult>): ReaderOpenResult {
  return {
    book: defaultBook,
    progress: {
      chapterIndex: 0,
      scrollPosition: 0,
      percentage: 0
    },
    chapterContent: {
      bookId: 'book-1',
      chapterIndex: 0,
      title: '第一章',
      content: '第一章\n正文内容',
      offset: 0,
      length: 20,
      totalLength: 20,
      totalChapters: 1
    },
    ...overrides
  }
}

beforeEach(() => {
  api = createMockApi()
  vi.mocked(api.settings.get).mockResolvedValue(defaultSettings)
  vi.mocked(api.bookshelf.getAll).mockResolvedValue([defaultBook])
  vi.mocked(api.reader.open).mockResolvedValue(createOpenResult())
  window.api = api
})

describe('App reading progress behavior', () => {
  it('restores saved progress when opening a book', async () => {
    vi.mocked(api.reader.open).mockResolvedValue(createOpenResult({
      progress: {
        chapterIndex: 0,
        scrollPosition: 120,
        percentage: 52
      }
    }))

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))

    await waitFor(() => {
      expect(screen.getByText('阅读进度：52%')).toBeTruthy()
    })
    expect(api.reader.open).toHaveBeenCalledWith('book-1')
    expect(api.reader.getContent).not.toHaveBeenCalled()
  })

  it('loads chapter content lazily when selecting a chapter', async () => {
    const bookWithTwoChapters: BookMeta = {
      ...defaultBook,
      fileSize: 40,
      chapters: [
        { title: '第一章', offset: 0, length: 20 },
        { title: '第二章', offset: 20, length: 20 }
      ]
    }
    vi.mocked(api.bookshelf.getAll).mockResolvedValue([bookWithTwoChapters])
    vi.mocked(api.reader.open).mockResolvedValue(createOpenResult({
      book: bookWithTwoChapters,
      chapterContent: {
        bookId: 'book-1',
        chapterIndex: 0,
        title: '第一章',
        content: '第一章\n正文内容',
        offset: 0,
        length: 20,
        totalLength: 40,
        totalChapters: 2
      }
    }))
    vi.mocked(api.reader.getChapterContent).mockResolvedValue({
      bookId: 'book-1',
      chapterIndex: 1,
      title: '第二章',
      content: '第二章\n新的正文',
      offset: 20,
      length: 20,
      totalLength: 40,
      totalChapters: 2
    })

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    await screen.findByText('第一章')

    fireEvent.click(screen.getByText('第二章'))

    await waitFor(() => {
      expect(screen.getByRole('document').textContent).toContain('第二章\n新的正文')
    })
    expect(api.reader.getChapterContent).toHaveBeenCalledWith('book-1', 1)
    expect(api.bookshelf.updateProgress).toHaveBeenCalledWith('book-1', {
      chapterIndex: 1,
      scrollPosition: 0,
      percentage: 50
    })
  })

  it('searches in main process and opens a selected search result', async () => {
    const bookWithTwoChapters: BookMeta = {
      ...defaultBook,
      fileSize: 40,
      chapters: [
        { title: '第一章', offset: 0, length: 20 },
        { title: '第二章', offset: 20, length: 20 }
      ]
    }
    vi.mocked(api.reader.open).mockResolvedValue(createOpenResult({ book: bookWithTwoChapters }))
    vi.mocked(api.reader.search).mockResolvedValue([
      {
        bookId: 'book-1',
        chapterIndex: 1,
        chapterTitle: '第二章',
        chapterOffset: 4,
        absoluteOffset: 24,
        snippet: '第二章 命中内容'
      }
    ])
    vi.mocked(api.reader.getChapterContent).mockResolvedValue({
      bookId: 'book-1',
      chapterIndex: 1,
      title: '第二章',
      content: '第二章 命中内容',
      offset: 20,
      length: 20,
      totalLength: 40,
      totalChapters: 2
    })

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    await screen.findByRole('document')

    fireEvent.change(screen.getByLabelText('搜索正文'), { target: { value: '命中' } })
    fireEvent.click(screen.getByText('搜索'))
    await screen.findByText('第二章 命中内容')
    fireEvent.click(screen.getByText('第二章 命中内容'))

    await waitFor(() => {
      expect(screen.getByRole('document').textContent).toContain('第二章 命中内容')
    })
    expect(api.reader.search).toHaveBeenCalledWith('book-1', '命中')
    expect(api.reader.getChapterContent).toHaveBeenCalledWith('book-1', 1)
    expect(api.bookshelf.updateProgress).toHaveBeenCalledWith('book-1', {
      chapterIndex: 1,
      scrollPosition: 0,
      percentage: 60
    })
  })

  it('adds bookmarks through the bookmarks API', async () => {
    vi.mocked(api.bookmarks.add).mockResolvedValue({
      id: 'bookmark-1',
      bookId: 'book-1',
      chapterIndex: 0,
      scrollPosition: 0,
      percentage: 0,
      title: '第一章',
      excerpt: '第一章\n正文内容',
      createdAt: 1000
    })

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    await screen.findByRole('document')

    fireEvent.click(screen.getByLabelText('添加书签'))

    await waitFor(() => {
      expect(api.bookmarks.add).toHaveBeenCalledWith('book-1', {
        chapterIndex: 0,
        scrollPosition: 0,
        percentage: 0,
        title: '第一章',
        excerpt: '第一章\n正文内容'
      })
    })
    expect(await screen.findByText('书签 1')).toBeTruthy()
  })
})

describe('App theme behavior', () => {
  it('applies the persisted disguise theme on startup', async () => {
    vi.mocked(api.settings.get).mockResolvedValue({
      ...defaultSettings,
      disguiseTheme: 'paper'
    })
    vi.mocked(api.bookshelf.getAll).mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('.app')?.className).toContain('theme-paper')
    })
    expect(api.stealth.setDisguise).toHaveBeenCalledWith('paper')
  })

  it('persists theme changes and updates the window disguise', async () => {
    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    await screen.findByRole('document')

    fireEvent.click(screen.getByLabelText('阅读设置'))
    fireEvent.click(screen.getByText('纸张'))

    await waitFor(() => {
      expect(document.querySelector('.app')?.className).toContain('theme-paper')
    })
    expect(api.settings.setDisguiseTheme).toHaveBeenCalledWith('paper')
    expect(api.stealth.setDisguise).toHaveBeenCalledWith('paper')
  })

  it('persists stealth mode changes and stops mouse tracking calls while disabled', async () => {
    render(<App />)

    await screen.findByLabelText('阅读设置')
    fireEvent.click(screen.getByLabelText('阅读设置'))
    fireEvent.click(screen.getByLabelText('隐身模式'))

    await waitFor(() => {
      expect(api.settings.setStealthEnabled).toHaveBeenCalledWith(false)
    })

    vi.mocked(api.stealth.mouseLeave).mockClear()
    fireEvent.mouseLeave(document.querySelector('.app')!)
    expect(api.stealth.mouseLeave).not.toHaveBeenCalled()
  })

  it('forwards native window focus changes to stealth tracking', async () => {
    render(<App />)

    await screen.findByText('测试小说')
    vi.mocked(api.stealth.mouseLeave).mockClear()
    vi.mocked(api.stealth.mouseEnter).mockClear()

    fireEvent.blur(window)
    fireEvent.focus(window)

    expect(api.stealth.mouseLeave).toHaveBeenCalledOnce()
    expect(api.stealth.mouseEnter).toHaveBeenCalledOnce()
  })
})
