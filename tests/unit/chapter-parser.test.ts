import { describe, it, expect } from 'vitest'
import { ChapterParser } from '../../src/main/chapter-parser'

describe('ChapterParser', () => {
  const parser = new ChapterParser()

  describe('中文章节标题匹配', () => {
    it('应识别"第X章"格式', () => {
      const content = '前言内容\n第一章 开始\n正文内容'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第一章 开始')
      expect(chapters[0].offset).toBe(content.indexOf('第一章'))
    })

    it('应识别"第X节"格式', () => {
      const content = '第一节 引言\n内容'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第一节 引言')
      expect(chapters[0].offset).toBe(0)
    })

    it('应识别阿拉伯数字章节号', () => {
      const content = '第1章 开始\n内容\n第2章 继续'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('第1章 开始')
      expect(chapters[1].title).toBe('第2章 继续')
    })

    it('应识别复杂中文数字', () => {
      const content = '第一百二十三章 大战\n内容'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第一百二十三章 大战')
    })
  })

  describe('英文 Chapter 标题匹配', () => {
    it('应识别"Chapter N"格式', () => {
      const content = 'Preface\nChapter 1\nContent here'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('Chapter 1')
    })

    it('应不区分大小写', () => {
      const content = 'CHAPTER 5\ncontent\nchapter 6\nmore'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('CHAPTER 5')
      expect(chapters[1].title).toBe('chapter 6')
    })

    it('应识别无空格的"ChapterN"格式', () => {
      const content = 'Chapter3\ncontent'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('Chapter3')
    })
  })

  describe('数字序号标题匹配', () => {
    it('应识别中文顿号分隔的章节标题', () => {
      const content = '1、归零\n正文\n2、亲戚\n更多正文'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('1、归零')
      expect(chapters[1].title).toBe('2、亲戚')
      expect(chapters[0].offset).toBe(0)
    })

    it('应识别"N. 标题"格式', () => {
      const content = '1. 引言\n内容\n2. 正文'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('1. 引言')
      expect(chapters[1].title).toBe('2. 正文')
    })

    it('应识别"N 标题"格式（空格分隔）', () => {
      const content = '1 开始\n内容\n2 继续'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('1 开始')
      expect(chapters[1].title).toBe('2 继续')
    })
  })

  describe('偏移量计算', () => {
    it('应正确计算行偏移量', () => {
      const content = 'abc\n第一章 开始\ndef'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      // 'abc\n' = 4 characters, so offset should be 4
      expect(chapters[0].offset).toBe(4)
    })

    it('应正确计算多个章节的偏移量', () => {
      const content = '前言\n第一章 开始\n内容\n第二章 继续'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].offset).toBe(content.indexOf('第一章'))
      expect(chapters[1].offset).toBe(content.indexOf('第二章'))
    })

    it('偏移量应严格递增', () => {
      const content = '第一章 开始\n内容\nChapter 2\n更多\n3. 结尾'
      const chapters = parser.parse(content)
      for (let i = 1; i < chapters.length; i++) {
        expect(chapters[i].offset).toBeGreaterThan(chapters[i - 1].offset)
      }
    })
  })

  describe('混合模式匹配', () => {
    it('应同时识别多种模式', () => {
      const content = '第一章 开始\n内容\nChapter 2\n更多\n3. 结尾'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(3)
      expect(chapters[0].title).toBe('第一章 开始')
      expect(chapters[1].title).toBe('Chapter 2')
      expect(chapters[2].title).toBe('3. 结尾')
    })

    it('无匹配时应按 3000 字符自动分段', () => {
      const content = '这是一段没有章节标题的普通文本\n第二行\n第三行'
      const chapters = parser.parse(content)
      expect(chapters.length).toBeGreaterThan(0)
      expect(chapters[0].title).toBe('第 1 段')
      // 所有段拼接后等于原始文本
      const totalLength = chapters.reduce((sum, ch) => sum + ch.length, 0)
      expect(totalLength).toBe(content.length)
    })

    it('空字符串应返回空数组', () => {
      const chapters = parser.parse('')
      expect(chapters).toHaveLength(0)
    })
  })

  describe('无章节标记时的自动分段', () => {
    it('短文本（< 3000 字符）应生成 1 段', () => {
      const content = '这是一段普通文本，没有任何章节标记。'.repeat(10)
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第 1 段')
      expect(chapters[0].offset).toBe(0)
      expect(chapters[0].length).toBe(content.length)
    })

    it('恰好 3000 字符应生成 1 段', () => {
      const content = 'a'.repeat(3000)
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第 1 段')
      expect(chapters[0].length).toBe(3000)
    })

    it('3001 字符应生成 2 段', () => {
      const content = 'a'.repeat(3001)
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title).toBe('第 1 段')
      expect(chapters[0].offset).toBe(0)
      expect(chapters[0].length).toBe(3000)
      expect(chapters[1].title).toBe('第 2 段')
      expect(chapters[1].offset).toBe(3000)
      expect(chapters[1].length).toBe(1)
    })

    it('多段时标题应按"第 N 段"递增', () => {
      const content = 'x'.repeat(9000)
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(3)
      expect(chapters[0].title).toBe('第 1 段')
      expect(chapters[1].title).toBe('第 2 段')
      expect(chapters[2].title).toBe('第 3 段')
    })

    it('所有段拼接后应等于原始文本', () => {
      const content = '这是没有章节标记的长文本内容。'.repeat(300)
      const chapters = parser.parse(content)
      // 验证所有段的 offset + length 覆盖整个文本
      let totalLength = 0
      for (let i = 0; i < chapters.length; i++) {
        expect(chapters[i].offset).toBe(totalLength)
        totalLength += chapters[i].length
      }
      expect(totalLength).toBe(content.length)
    })

    it('每段长度不超过 3000 字符', () => {
      const content = 'y'.repeat(10000)
      const chapters = parser.parse(content)
      for (const chapter of chapters) {
        expect(chapter.length).toBeLessThanOrEqual(3000)
      }
    })
  })

  describe('章节 length 计算', () => {
    it('单个章节的 length 应为从 offset 到文件末尾', () => {
      const content = '第一章 开始\n正文内容在这里'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].length).toBe(content.length - chapters[0].offset)
    })

    it('多个章节时 length 应为到下一章节 offset 的距离', () => {
      const content = '第一章 开始\n内容一\n第二章 继续\n内容二'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      // 第一章 length = 第二章 offset - 第一章 offset
      expect(chapters[0].length).toBe(chapters[1].offset - chapters[0].offset)
      // 最后一章 length = 文件末尾 - 最后章节 offset
      expect(chapters[1].length).toBe(content.length - chapters[1].offset)
    })

    it('所有章节的 length 之和加上第一章之前的内容应等于文件总长度', () => {
      const content = '前言\n第一章 开始\n内容\n第二章 中间\n更多内容\n第三章 结尾\n最后'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(3)
      const totalChapterLength = chapters.reduce((sum, ch) => sum + ch.length, 0)
      // 第一章 offset 之前的内容 + 所有章节 length 之和 = 文件总长度
      expect(chapters[0].offset + totalChapterLength).toBe(content.length)
    })

    it('章节 length 应大于 0', () => {
      const content = '第一章 开始\n第二章 继续\n第三章 结尾'
      const chapters = parser.parse(content)
      for (const chapter of chapters) {
        expect(chapter.length).toBeGreaterThan(0)
      }
    })

    it('有前言内容时第一章 length 仍正确', () => {
      const content = 'abc\n第一章 开始\ndef'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      // offset 是 4 ('abc\n')，length 应为 content.length - 4
      expect(chapters[0].offset).toBe(4)
      expect(chapters[0].length).toBe(content.length - 4)
    })
  })

  describe('章节排序', () => {
    it('章节应按 offset 严格递增排列', () => {
      const content = '第一章 开始\n内容\nChapter 2\n更多\n3. 结尾'
      const chapters = parser.parse(content)
      for (let i = 1; i < chapters.length; i++) {
        expect(chapters[i].offset).toBeGreaterThan(chapters[i - 1].offset)
      }
    })
  })

  describe('卷归属', () => {
    it('应识别卷完标记并给真实章节附加卷索引', () => {
      const content = [
        '1、第一章',
        '第一卷正文',
        '2、第二章（第一卷完）',
        '第一卷，初识，完。',
        '3、第三章',
        '第二卷，风起，完。',
        '4、第四章'
      ].join('\n')

      const chapters = parser.parse(content)
      expect(chapters.map((chapter) => chapter.title)).toEqual([
        '1、第一章',
        '2、第二章（第一卷完）',
        '3、第三章',
        '4、第四章'
      ])
      expect(chapters.map((chapter) => chapter.volumeIndex)).toEqual([1, 1, 2, 3])
      expect(chapters[0].volumeTitle).toBe('初识')
      expect(chapters[2].volumeTitle).toBe('风起')
    })

    it('不应把正文中的“第二十回合”误识别为章节', () => {
      const content = '1、开始\n第二十回合，李玄抡矛横扫。\n2、结束'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(2)
      expect(chapters.map((chapter) => chapter.title)).toEqual(['1、开始', '2、结束'])
    })
  })

  describe('边界情况', () => {
    it('行首有空格时仍应匹配', () => {
      const content = '  第一章 开始\n内容'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第一章 开始')
      // offset should point to the start of the match (after leading spaces)
      expect(chapters[0].offset).toBe(2)
    })

    it('一行只匹配一个模式（优先级：中文 > 英文 > 数字）', () => {
      // This line matches both Chinese pattern and number pattern
      const content = '第1章 开始'
      const chapters = parser.parse(content)
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第1章 开始')
    })
  })
})
