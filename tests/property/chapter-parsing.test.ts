import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { findChapterIndexForOffset, getChapterType } from '../../src/shared/chapter-patterns'
import { ChapterParser } from '../../src/main/chapter-parser'
import type { Chapter } from '../../src/shared/types'

/**
 * 章节解析属性测试。
 *
 * tasks.md 里列了 5 条 Property 但一直只有 setup 用例（a + b === b + a），
 * fast-check 装了却没用上。这里补上真正有价值的几条：章节 offset 的
 * 正确性是「跳转后正文错位」这类 bug 的唯一防线，适合用随机文本穷举。
 */

/** 生成一段带章节标题的随机小说文本，并记录每个标题行的真实偏移。 */
const chapteredNovel = fc
  .array(
    fc.record({
      title: fc.oneof(
        fc.integer({ min: 1, max: 999 }).map((n) => `第${n}章 标题${n}`),
        fc.integer({ min: 1, max: 999 }).map((n) => `Chapter ${n}`),
        fc.constant('第一章'),
        fc.constant('第二节')
      ),
      // 正文里刻意混入小数、编号列表等容易被误判成章节的行。
      // 注意不能生成「本身就像章节标题」的正文行（如 "Chapter"），
      // 那会让解析器合理地多识别出章节，属性就不再成立。
      body: fc.array(
        fc.oneof(
          fc
            .string({ minLength: 1, maxLength: 40 })
            .map((s) => s.replace(/[\r\n]/g, ' ').replace(/^\s*(第|Chapter|Volume|Part|\d)/i, 'x')),
          fc.constant('3.9 级妖兽出现了'),
          fc.constant('他数了数，一共 12 个人。'),
          fc.constant('')
        ),
        { minLength: 0, maxLength: 6 }
      )
    }),
    { minLength: 1, maxLength: 12 }
  )
  .map((blocks) => {
    const lines: string[] = []
    const expectedOffsets: number[] = []
    let offset = 0

    for (const block of blocks) {
      expectedOffsets.push(offset)
      lines.push(block.title)
      offset += block.title.length + 1
      for (const line of block.body) {
        lines.push(line)
        offset += line.length + 1
      }
    }

    return { text: lines.join('\n'), expectedOffsets }
  })

describe('Property: 章节目录 offset 指向标题行首', () => {
  const parser = new ChapterParser()

  it('每个识别到的章节 offset 都落在对应标题的起始位置', () => {
    fc.assert(
      fc.property(chapteredNovel, ({ text, expectedOffsets }) => {
        const chapters = parser.parse(text)

        // 生成的文本每块都有明确标题，解析结果不应少于块数。
        expect(chapters.length).toBeGreaterThanOrEqual(expectedOffsets.length)

        for (const chapter of chapters) {
          // offset 必须能读回该章节自己的标题（允许解析器裁剪首尾空白）。
          const lineEnd = text.indexOf('\n', chapter.offset)
          const line = text.slice(chapter.offset, lineEnd === -1 ? text.length : lineEnd)
          expect(line.trim()).toBe(chapter.title)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('章节按 offset 严格递增且 length 与下一章无缝衔接', () => {
    fc.assert(
      fc.property(chapteredNovel, ({ text }) => {
        const chapters = parser.parse(text)

        for (let i = 0; i < chapters.length; i++) {
          expect(chapters[i].length).toBeGreaterThanOrEqual(0)

          if (i < chapters.length - 1) {
            // 严格递增：否则阅读进度与搜索定位会互相矛盾。
            expect(chapters[i].offset).toBeLessThan(chapters[i + 1].offset)
            // length 必须正好补到下一章起点，不能有空洞或重叠。
            expect(chapters[i].offset + chapters[i].length).toBe(chapters[i + 1].offset)
          } else {
            // 最后一章必须覆盖到文件末尾。
            expect(chapters[i].offset + chapters[i].length).toBe(text.length)
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  it('CRLF 文本不会让 offset 逐行漂移', () => {
    fc.assert(
      fc.property(chapteredNovel, ({ text }) => {
        const lfChapters = parser.parse(text)
        const crlfText = text.replace(/\n/g, '\r\n')
        const crlfChapters = parser.parse(crlfText)

        // 换行符从 LF 变成 CRLF 后，章节数量与标题必须完全一致；
        // 旧实现按 line.length + 1 累加偏移，每行会多算一个字符。
        expect(crlfChapters.map((c: Chapter) => c.title)).toEqual(
          lfChapters.map((c: Chapter) => c.title)
        )

        for (const chapter of crlfChapters) {
          // 必须在 CRLF 文本上重新定位行尾，不能复用 LF 文本的下标。
          // 末行可能没有换行符，indexOf 返回 -1，此时要取到字符串末尾。
          const lineEnd = crlfText.indexOf('\n', chapter.offset)
          const raw = crlfText.slice(
            chapter.offset,
            lineEnd === -1 ? crlfText.length : lineEnd
          )
          expect(raw.replace(/\r$/, '').trim()).toBe(chapter.title)
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property: 二分查找与线性扫描结果一致', () => {
  const offsets = fc
    .array(fc.integer({ min: 0, max: 100_000 }), { minLength: 0, maxLength: 60 })
    .map((values) => [...new Set(values)].sort((a, b) => a - b))

  const linearReference = (sorted: number[], offset: number): number => {
    if (sorted.length === 0) return 0
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (offset >= sorted[i]) return i
    }
    return 0
  }

  it('任意 offset 下二分结果等于原线性实现', () => {
    fc.assert(
      fc.property(offsets, fc.integer({ min: -500, max: 100_500 }), (sorted, offset) => {
        const chapters = sorted.map((value) => ({ offset: value }))
        expect(findChapterIndexForOffset(chapters, offset)).toBe(
          linearReference(sorted, offset)
        )
      }),
      { numRuns: 500 }
    )
  })

  it('空章节数组返回 0 而不是崩溃', () => {
    expect(findChapterIndexForOffset([], 1234)).toBe(0)
  })
})

describe('Property: 章节类型判定与标题前缀一致', () => {
  it('卷类标题判定为 volume，自动分段判定为 section，其余为 chapter', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (n) => {
        expect(getChapterType(`第${n}卷 风起`)).toBe('volume')
        expect(getChapterType(`第${n}章 风起`)).toBe('chapter')
        expect(getChapterType(`第 ${n} 段`)).toBe('section')
        expect(getChapterType(`Chapter ${n}`)).toBe('chapter')
        expect(getChapterType(`Volume ${n}`)).toBe('volume')
      }),
      { numRuns: 200 }
    )
  })
})
