import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../../src/renderer/src/App'
import {
  AUTO_SAVE_INTERVAL,
  DEFAULT_HIDE_SHORTCUT
} from '../../src/shared/constants'

const defaultSettings = {
  fontSize: 16,
  fontFamily: 'Consolas, monospace',
  lineHeight: 1.8,
  disguiseTheme: 'dark',
  stealthEnabled: true,
  hideShortcut: DEFAULT_HIDE_SHORTCUT,
  autoSaveInterval: AUTO_SAVE_INTERVAL
}

beforeEach(() => {
  ;(window as any).api = {
    invoke: vi.fn((channel: string, ...args: unknown[]) => {
      switch (channel) {
        case 'settings:get':
          return Promise.resolve(defaultSettings)
        case 'bookshelf:getAll':
          return Promise.resolve([
            {
              id: 'book-1',
              title: '测试小说',
              chapters: [{ title: '第一章', offset: 0, length: 20 }]
            }
          ])
        case 'reader:getContent':
          return Promise.resolve('第一章\n正文内容')
        case 'bookshelf:getProgress':
          return Promise.resolve({ chapterIndex: 0, scrollPosition: 0, percentage: 0 })
        default:
          return Promise.resolve(undefined)
      }
    }),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  }
})

describe('App reading progress behavior', () => {
  it('restores saved progress when opening a book', async () => {
    ;(window.api.invoke as any).mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(defaultSettings)
      if (channel === 'bookshelf:getAll') {
        return Promise.resolve([
          {
            id: 'book-1',
            title: '测试小说',
            chapters: [{ title: '第一章', offset: 0, length: 20 }]
          }
        ])
      }
      if (channel === 'reader:getContent') return Promise.resolve('第一章\n正文内容')
      if (channel === 'bookshelf:getProgress') {
        return Promise.resolve({ chapterIndex: 0, scrollPosition: 120, percentage: 52 })
      }
      return Promise.resolve(undefined)
    })

    render(<App />)

    await screen.findByText('测试小说')
    fireEvent.click(screen.getByText('测试小说'))

    await waitFor(() => {
      expect(screen.getByText('阅读进度：52%')).toBeTruthy()
    })
    expect(window.api.invoke).toHaveBeenCalledWith('bookshelf:getProgress', 'book-1')
  })
})

describe('App theme behavior', () => {
  it('applies the persisted disguise theme on startup', async () => {
    ;(window.api.invoke as any).mockImplementation((channel: string) => {
      if (channel === 'settings:get') {
        return Promise.resolve({ ...defaultSettings, disguiseTheme: 'paper' })
      }
      if (channel === 'bookshelf:getAll') return Promise.resolve([])
      return Promise.resolve(undefined)
    })

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('.app')?.className).toContain('theme-paper')
    })
    expect(window.api.invoke).toHaveBeenCalledWith('stealth:setDisguise', 'paper')
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
    expect(window.api.invoke).toHaveBeenCalledWith('settings:setDisguiseTheme', 'paper')
    expect(window.api.invoke).toHaveBeenCalledWith('stealth:setDisguise', 'paper')
  })

  it('persists stealth mode changes and stops mouse tracking calls while disabled', async () => {
    render(<App />)

    await screen.findByLabelText('阅读设置')
    fireEvent.click(screen.getByLabelText('阅读设置'))
    fireEvent.click(screen.getByLabelText('隐身模式'))

    await waitFor(() => {
      expect(window.api.invoke).toHaveBeenCalledWith('settings:setStealthEnabled', false)
    })

    ;(window.api.invoke as any).mockClear()
    fireEvent.mouseLeave(document.querySelector('.app')!)
    expect(window.api.invoke).not.toHaveBeenCalledWith('stealth:mouseLeave')
  })
})
