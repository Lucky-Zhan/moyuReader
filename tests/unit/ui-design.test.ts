import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  ALLOWED_FONT_FAMILIES
} from '../../src/shared/constants'

/**
 * 界面回归测试。
 *
 * 这些断言锁住的是「已经修过一次、很容易被改回去」的设计问题：过小的字号、
 * 用代码字体渲染中文正文、以及五个主题里有主题色值完全重复。纯 CSS 无法用
 * jsdom 断言，因此这里直接检查样式源文件与常量。
 */

const read = (relative: string): string =>
  readFileSync(resolve(__dirname, '../../', relative), 'utf8')

const tokens = read('src/renderer/src/styles/tokens.css')
const bookshelfCss = read('src/renderer/src/components/BookshelfView.css')
const readerCss = read('src/renderer/src/components/ReaderView.css')
const themeCss = read('src/renderer/src/components/DisguiseTheme.css')

describe('阅读默认排版', () => {
  it('默认字体不是等宽代码字体', () => {
    expect(DEFAULT_FONT_FAMILY).not.toMatch(/Consolas|monospace/i)
    expect(DEFAULT_FONT_FAMILY).toMatch(/serif/i)
  })

  it('默认字号不小于 16px', () => {
    expect(DEFAULT_FONT_SIZE).toBeGreaterThanOrEqual(16)
  })

  it('默认行距适合长文阅读', () => {
    expect(DEFAULT_LINE_HEIGHT).toBeGreaterThanOrEqual(1.6)
    expect(DEFAULT_LINE_HEIGHT).toBeLessThanOrEqual(2.4)
  })

  it('字体选项里同时提供阅读字体和等宽字体', () => {
    const joined = ALLOWED_FONT_FAMILIES.join(' ')
    expect(joined).toMatch(/serif/i)
    expect(joined).toMatch(/monospace/i)
  })

  it('默认字体在允许列表中，否则设置无法持久化', () => {
    expect(ALLOWED_FONT_FAMILIES).toContain(DEFAULT_FONT_FAMILY)
  })
})

describe('字号刻度', () => {
  it('定义了完整的字号 token', () => {
    for (const token of ['--text-2xs', '--text-xs', '--text-sm', '--text-base', '--text-2xl']) {
      expect(tokens).toContain(`${token}:`)
    }
  })

  it('最小字号 token 不小于 11px', () => {
    const match = tokens.match(/--text-2xs:\s*(\d+)px/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(11)
  })

  it('正文基准不小于 15px', () => {
    const match = tokens.match(/--text-base:\s*(\d+)px/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(15)
  })
})

describe('样式表不再硬编码过小字号', () => {
  const sheets: Array<[string, string]> = [
    ['BookshelfView.css', bookshelfCss],
    ['ReaderView.css', readerCss]
  ]

  it.each(sheets)('%s 中不存在小于 11px 的字号', (_name, css) => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]))
    // 允许 0（用于隐藏文本的伪装主题），其余必须 >= 11。
    const tooSmall = sizes.filter((size) => size > 0 && size < 11)
    expect(tooSmall).toEqual([])
  })

  it('阅读区宽度跟随 --reader-measure 而不是写死 720px', () => {
    expect(readerCss).toContain('var(--reader-measure)')
    expect(readerCss).not.toMatch(/width:\s*min\([^)]*720px/)
  })
})

describe('伪装主题', () => {
  const themeBlocks = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const name of ['dark', 'light', 'paper', 'code', 'terminal']) {
      const start = themeCss.indexOf(`.theme-${name} {`)
      expect(start, `缺少 .theme-${name}`).toBeGreaterThan(-1)
      const end = themeCss.indexOf('}', start)
      out[name] = themeCss.slice(start, end)
    }
    return out
  }

  it('每个主题都定义了背景色与强调色', () => {
    const blocks = themeBlocks()
    for (const [name, block] of Object.entries(blocks)) {
      expect(block, `${name} 缺少 --app-bg`).toContain('--app-bg:')
      expect(block, `${name} 缺少 --accent`).toContain('--accent:')
    }
  })

  it('深色与代码主题的配色不再完全相同', () => {
    const blocks = themeBlocks()
    const pick = (block: string, key: string): string =>
      block.match(new RegExp(`${key}:\\s*([^;]+);`))?.[1].trim() ?? ''
    // 曾经两个主题每个色值都逐字相同，切换主题毫无反馈。
    expect(pick(blocks.code, '--app-bg')).not.toBe(pick(blocks.dark, '--app-bg'))
    expect(pick(blocks.code, '--accent')).not.toBe(pick(blocks.dark, '--accent'))
  })

  it('五个主题的背景色两两不同', () => {
    const blocks = themeBlocks()
    const backgrounds = Object.values(blocks).map(
      (block) => block.match(/--app-bg:\s*([^;]+);/)?.[1].trim()
    )
    expect(new Set(backgrounds).size).toBe(5)
  })
})

describe('提示气泡统一定义', () => {
  it('只在共享样式表中定义一次', () => {
    const tooltip = read('src/renderer/src/styles/tooltip.css')
    expect(tooltip).toContain('[data-tooltip]::after')
    // 组件样式表不应再各自实现一份。
    for (const [name, css] of [
      ['BookshelfView.css', bookshelfCss],
      ['ReaderView.css', readerCss],
      ['DisguiseTheme.css', themeCss]
    ] as Array<[string, string]>) {
      expect(css, `${name} 仍保留本地 tooltip 实现`).not.toContain('[data-tooltip]::after')
    }
  })
})
