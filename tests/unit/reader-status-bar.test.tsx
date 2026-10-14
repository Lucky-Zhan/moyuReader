import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReaderView } from '../../src/renderer/src/components/ReaderView'
import type { Chapter } from '../../src/shared/types'
import { createMockApi } from './mock-api'

beforeEach(() => { window.api = createMockApi() })

const chapters: Chapter[] = [
  { title: '第一章', offset: 0, length: 1500 },
  { title: '第二章', offset: 1500, length: 1500 }
]

describe('verify reader status bar', () => {
  it('title and counter follow the visible chapter after scrolling', async () => {
    const nextChapter = { bookId:'b', chapterIndex:1, title:'第二章', content:'第二章正文', offset:1500, length:1500, totalLength:3000, totalChapters:2 }
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable:true, value:1000 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable:true, value:500 })
    // jsdom 不做布局：手动给章节块一个 offsetTop/offsetHeight，模拟真实排版。
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        const idx = this.getAttribute?.('data-reader-chapter-index')
        return idx === null || idx === undefined ? 0 : Number(idx) * 500
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable:true, value: 500 })

    render(
      <ReaderView
        content={'x'.repeat(100)}
        chapterContent={{ bookId:'b', chapterIndex:0, title:'第一章', content:'第一章正文', offset:0, length:1500, totalLength:3000, totalChapters:2 }}
        chapters={chapters}
        progress={{ chapterIndex:0, scrollPosition:0, percentage:0 }}
        onProgressChange={vi.fn()}
        onBack={vi.fn()}
        onLoadChapterContent={vi.fn().mockResolvedValue(nextChapter)}
      />
    )
    const el = screen.getByRole('document') as HTMLDivElement
    el.scrollTop = 470
    fireEvent.scroll(el)
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    await waitFor(() => expect(screen.getByRole('document').textContent).toContain('第二章正文'))
    // 第二章已追加到同一滚动流；再滚动一次，让活动章节重新计算。
    el.scrollTop = 645
    fireEvent.scroll(el)
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    const bar = document.querySelector('.reader-status-bar')!
    expect(bar.textContent).toContain('第二章')
    expect(bar.textContent).toContain('2/2')
  })
})
