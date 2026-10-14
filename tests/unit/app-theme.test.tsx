import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../../src/renderer/src/App'
import {
  AUTO_SAVE_INTERVAL,
  DEFAULT_HIDE_SHORTCUT,
  DEFAULT_MOUSE_LEAVE_ACTION,
  DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  DEFAULT_MOUSE_RETURN_DELAY
} from '../../src/shared/constants'
import type { MoyuApi } from '../../src/shared/moyu-api'
import type { BookMeta, ReaderOpenResult } from '../../src/shared/types'
import { createMockApi, getRegisteredEventHandler } from './mock-api'

const defaultSettings = {
  fontSize: 16,
  fontFamily: 'Consolas, monospace',
  lineHeight: 1.8,
  disguiseTheme: 'dark' as const,
  stealthEnabled: true,
  hideShortcut: DEFAULT_HIDE_SHORTCUT,
  mouseLeaveAction: DEFAULT_MOUSE_LEAVE_ACTION,
  mouseLeaveDelay: DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  mouseReturnDelay: DEFAULT_MOUSE_RETURN_DELAY,
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
  vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([{ book: defaultBook, progress: null }])
  vi.mocked(api.reader.open).mockResolvedValue(createOpenResult())
  window.api = api
})

describe('App reading progress behavior', () => {
  it('flushes pending progress when the window is hidden by the global shortcut', async () => {
    // 全局快捷键直接在主进程 hide()，渲染进程只能通过 stealth:hidden 得知。
    // 若此时还有防抖中的进度没落盘，窗口一隐藏就丢了。
    vi.mocked(api.reader.open).mockResolvedValue(
      createOpenResult({
        progress: { chapterIndex: 0, scrollPosition: 100, percentage: 50 }
      })
    )

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    await screen.findByText('阅读进度：50%')

    // 滚动事件经 requestAnimationFrame 合并，jsdom 不会自动执行回调，
    // 这里手动驱动一帧，确保 processScroll 真的把进度写进了防抖队列。
    vi.mocked(api.bookshelf.updateProgress).mockClear()
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })

    try {
      fireEvent.scroll(screen.getByRole('document'), { target: { scrollTop: 240 } })
      act(() => {
        rafCallbacks.forEach((cb) => cb(0))
      })

      // 防抖（250ms）尚未到期，此时不应有任何写入。
      expect(api.bookshelf.updateProgress).not.toHaveBeenCalled()

      const handleHidden = getRegisteredEventHandler(api, 'onStealthHidden')
      expect(handleHidden).toBeTypeOf('function')
      act(() => {
        handleHidden?.()
      })

      // 关键：同步断言。hide 事件处理器必须立刻落盘，
      // 不能用 waitFor 兜底——否则 250ms 防抖定时器自己到期也会让断言通过，
      // 测试就失去了意义。
      expect(api.bookshelf.updateProgress).toHaveBeenCalledTimes(1)
      expect(api.bookshelf.updateProgress).toHaveBeenCalledWith(
        'book-1',
        expect.objectContaining({ chapterIndex: 0 })
      )
    } finally {
      rafSpy.mockRestore()
    }
  })

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
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([
      { book: bookWithTwoChapters, progress: null }
    ])
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
    fireEvent.click(await screen.findByLabelText('显示目录'))
    // 正文已按段落渲染，"第一章" 会同时出现在目录和正文里，
    // 因此这里限定在目录抽屉内查找。
    const chapterDrawer = await screen.findByRole('dialog')
    expect(within(chapterDrawer).getByText('第一章')).toBeDefined()

    fireEvent.click(within(chapterDrawer).getByText('第二章'))

    await waitFor(() => {
      expect(screen.getByRole('document').textContent).toContain('第二章')
      expect(screen.getByRole('document').textContent).toContain('新的正文')
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
    vi.mocked(api.bookshelf.getLibrary).mockResolvedValue([])

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

  it('persists stealth mouse leave behavior and delay changes', async () => {
    render(<App />)

    await screen.findByLabelText('阅读设置')
    fireEvent.click(screen.getByLabelText('阅读设置'))
    fireEvent.change(screen.getByLabelText('鼠标移出行为'), {
      target: { value: 'hide' }
    })
    fireEvent.change(screen.getByLabelText('延迟秒数'), {
      target: { value: '7000' }
    })
    fireEvent.change(screen.getByLabelText('显形延迟秒数'), {
      target: { value: '3000' }
    })

    await waitFor(() => {
      expect(api.settings.setMouseLeaveAction).toHaveBeenCalledWith('hide')
      expect(api.settings.setMouseLeaveDelay).toHaveBeenCalledWith(7000)
      expect(api.settings.setMouseReturnDelay).toHaveBeenCalledWith(3000)
    })
  })

  it('starts window dragging from blank reader chrome without hijacking controls', async () => {
    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))
    const toolbar = await screen.findByRole('toolbar', { name: '阅读工具栏' })
    toolbar.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 20,
      screenX: 240,
      screenY: 20
    }))

    expect(api.window.drag.start).toHaveBeenCalledOnce()

    screen.getByLabelText('返回').dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 20,
      screenX: 240,
      screenY: 20
    }))
    expect(api.window.drag.start).toHaveBeenCalledOnce()
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
