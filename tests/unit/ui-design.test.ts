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

describe('目录抽屉的滚动区域', () => {
  const drawerCss = read('src/renderer/src/components/ChapterDrawer.css')
  const chapterListCss = read('src/renderer/src/components/ChapterList.css')

  /**
   * 抽屉是 flex 列：头部 72px + 列表。ChapterList.css 给 .chapter-list 设了
   * height: 100%，在抽屉里会让列表按**总高**撑开，底部溢出正好一个头部的高度，
   * 滚动条轨道随之超出可视区——表现为滚动条和内容对不上、拖到底也看不全最后一章。
   */
  it('抽屉内的章节列表不能沿用 height: 100%', () => {
    const rule = drawerCss.match(/\.chapter-drawer \.chapter-list \{[^}]*\}/)?.[0]
    expect(rule, '缺少 .chapter-drawer .chapter-list 覆盖规则').toBeTruthy()
    expect(rule).toMatch(/height:\s*auto/)
    expect(rule).toMatch(/flex:\s*1/)
    expect(rule).toMatch(/min-height:\s*0/)
  })

  it('基础样式仍保留 height: 100%（书架侧栏布局依赖它）', () => {
    const rule = chapterListCss.match(/^\.chapter-list \{[^}]*\}/m)?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/height:\s*100%/)
  })

  it('列表自身可滚动且允许收缩', () => {
    const rule = chapterListCss.match(/^\.chapter-list-items \{[^}]*\}/m)?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/overflow-y:\s*auto/)
    expect(rule).toMatch(/flex:\s*1/)
  })

  /**
   * 抽屉必须是「把正文挤到右侧」而不是「浮在正文上面」。
   * 实测覆盖式布局在 900px 窗口下会盖住正文 108px、约 8 个段落，
   * 且正文不重排，用户滚动时看不到被盖住的那几行。
   */
  it('抽屉靠 flex 占位而非绝对定位覆盖正文', () => {
    // 先去掉注释：说明文字里会提到 position: absolute，不应被当成声明。
    const rule = drawerCss
      .match(/^\.chapter-drawer \{[^}]*\}/m)?.[0]
      ?.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/position:\s*relative/)
    expect(rule).not.toMatch(/position:\s*absolute/)
    expect(rule).not.toMatch(/inset:/)
    // 关闭时宽度归零，不占布局且不可点击。
    expect(rule).toMatch(/width:\s*0/)
    expect(rule).toMatch(/pointer-events:\s*none/)
  })

  it('抽屉打开时才展开宽度并恢复可点击', () => {
    const rule = drawerCss.match(/\.chapter-drawer\.is-open \{[^}]*\}/)?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/width:\s*min\(336px, 86vw\)/)
    expect(rule).toMatch(/pointer-events:\s*auto/)
  })

  it('抽屉在 DOM 中靠后但视觉上置左', () => {
    const rule = drawerCss.match(/^\.chapter-drawer \{[^}]*\}/m)?.[0]
    expect(rule).toMatch(/order:\s*-1/)
  })

  it('遮罩不再压暗正文', () => {
    const rule = drawerCss.match(/^\.chapter-drawer-backdrop \{[^}]*\}/m)?.[0]
    expect(rule).toBeTruthy()
    expect(rule).toMatch(/background:\s*transparent/)
    expect(rule).not.toMatch(/backdrop-filter/)
  })
})
