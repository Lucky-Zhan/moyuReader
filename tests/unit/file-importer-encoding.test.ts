import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as iconv from 'iconv-lite'
import { FileImporter } from '../../src/main/file-importer'

describe('FileImporter - 编码检测与文件读取', () => {
  const importer = new FileImporter()
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyureader-test-'))
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('detectEncoding - 编码检测', () => {
    it('应识别 UTF-8 编码的中文文本', () => {
      const text = '这是一段中文测试文本，用于验证 UTF-8 编码检测。'
      const buffer = Buffer.from(text, 'utf-8')
      expect(importer.detectEncoding(buffer)).toBe('utf-8')
    })

    it('应识别纯 ASCII 文本为 UTF-8', () => {
      const text = 'Hello, this is a plain ASCII text.'
      const buffer = Buffer.from(text, 'utf-8')
      expect(importer.detectEncoding(buffer)).toBe('utf-8')
    })

    it('应识别 GBK 编码的中文文本', () => {
      const text = '这是一段中文测试文本，用于验证GBK编码检测。第一章 开始'
      const buffer = iconv.encode(text, 'gbk')
      const encoding = importer.detectEncoding(buffer)
      expect(encoding).toBe('gbk')
    })

    it('应对空 Buffer 返回 null', () => {
      const buffer = Buffer.alloc(0)
      // chardet on empty buffer may return null or a default
      const result = importer.detectEncoding(buffer)
      // Empty buffer detection behavior depends on chardet implementation
      expect(result === null || result === 'utf-8').toBe(true)
    })
  })

  describe('readFileContent - 同步文件读取', () => {
    it('应正确读取 UTF-8 编码文件', () => {
      const text = '第一章 开始\n这是一本测试小说的内容。\n包含多行中文文本。'
      const filePath = path.join(tmpDir, 'utf8-novel.txt')
      fs.writeFileSync(filePath, text, 'utf-8')

      const result = importer.readFileContent(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.encoding).toBe('utf-8')
      }
    })

    it('应正确读取 GBK 编码文件', () => {
      const text = '第一章 开始\n这是一本GBK编码的测试小说。\n包含中文内容。'
      const buffer = iconv.encode(text, 'gbk')
      const filePath = path.join(tmpDir, 'gbk-novel.txt')
      fs.writeFileSync(filePath, buffer)

      const result = importer.readFileContent(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.encoding).toBe('gbk')
      }
    })

    it('应剥离 UTF-8 BOM，避免首字符污染第一章标题', () => {
      const text = '第一章 开始\n这是一本带 BOM 的测试小说。'
      const filePath = path.join(tmpDir, 'utf8-bom-novel.txt')
      // Windows 记事本默认会写入 UTF-8 BOM。
      fs.writeFileSync(
        filePath,
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf-8')])
      )

      const result = importer.readFileContent(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.content.charCodeAt(0)).not.toBe(0xfeff)
        expect(result.encoding).toBe('utf-8')
      }
    })

    it('异步读取同样应剥离 UTF-8 BOM', async () => {
      const text = '第一章 开始\n异步读取的带 BOM 文件。'
      const filePath = path.join(tmpDir, 'utf8-bom-async.txt')
      fs.writeFileSync(
        filePath,
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf-8')])
      )

      const result = await importer.readFileContentAsync(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.content.charCodeAt(0)).not.toBe(0xfeff)
      }
    })

    it('应对不支持的编码返回 UNSUPPORTED_ENCODING 错误', () => {
      // Create a file with UTF-16LE BOM that chardet should detect as non-UTF8/GBK
      const text = '这是UTF-16编码的文本'
      const buffer = Buffer.alloc(2 + text.length * 2)
      // UTF-16LE BOM
      buffer[0] = 0xFF
      buffer[1] = 0xFE
      let offset = 2
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        buffer[offset++] = code & 0xFF
        buffer[offset++] = (code >> 8) & 0xFF
      }
      const filePath = path.join(tmpDir, 'utf16-novel.txt')
      fs.writeFileSync(filePath, buffer)

      const result = importer.readFileContent(filePath)
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error.code).toBe('UNSUPPORTED_ENCODING')
      }
    })

    it('应正确读取包含 BOM 的 UTF-8 文件', () => {
      const text = '带有BOM的UTF-8文件内容'
      const bom = Buffer.from([0xEF, 0xBB, 0xBF])
      const content = Buffer.from(text, 'utf-8')
      const buffer = Buffer.concat([bom, content])
      const filePath = path.join(tmpDir, 'utf8-bom-novel.txt')
      fs.writeFileSync(filePath, buffer)

      const result = importer.readFileContent(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.encoding).toBe('utf-8')
        // Content may include BOM character, but should be valid text
        expect(result.content).toContain(text)
      }
    })
  })

  describe('readFileContentAsync - 异步文件读取', () => {
    it('应正确异步读取 UTF-8 编码文件', async () => {
      const text = '异步读取测试：第二章 发展\n故事继续发展。'
      const filePath = path.join(tmpDir, 'async-utf8.txt')
      fs.writeFileSync(filePath, text, 'utf-8')

      const result = await importer.readFileContentAsync(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.encoding).toBe('utf-8')
      }
    })

    it('应正确异步读取 GBK 编码文件', async () => {
      const text = '异步读取测试：GBK编码的小说内容。'
      const buffer = iconv.encode(text, 'gbk')
      const filePath = path.join(tmpDir, 'async-gbk.txt')
      fs.writeFileSync(filePath, buffer)

      const result = await importer.readFileContentAsync(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.encoding).toBe('gbk')
      }
    })

    it('应无损读取含 4 字节序列的 GB18030 文件', async () => {
      // GB18030 是 GBK 的超集：这些生僻字在 GBK 中不存在，若用 gbk 解码会
      // 变成 U+FFFD 乱码。回归见 iconv.decode(..., 'gb18030')。
      const rare = '𠀀㐀𡃁'
      const text = `第一章 生僻字\n${rare}\n正文内容。`
      const buffer = iconv.encode(text, 'gb18030')
      const filePath = path.join(tmpDir, 'gb18030-novel.txt')
      fs.writeFileSync(filePath, buffer)

      const result = await importer.readFileContentAsync(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.content).not.toContain('\uFFFD')
        expect(result.content).toContain(rare)
      }
    })

    it('同步读取同样不丢失 GB18030 的 4 字节字符', () => {
      const rare = '𠀀㐀𡃁'
      const text = `生僻字测试\n${rare}\n结束。`
      const buffer = iconv.encode(text, 'gb18030')
      const filePath = path.join(tmpDir, 'gb18030-sync.txt')
      fs.writeFileSync(filePath, buffer)

      const result = importer.readFileContent(filePath)
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(text)
        expect(result.content).not.toContain('\uFFFD')
      }
    })

    it('应对不支持的编码异步返回错误', async () => {
      const text = '这是UTF-16编码'
      const buffer = Buffer.alloc(2 + text.length * 2)
      buffer[0] = 0xFF
      buffer[1] = 0xFE
      let offset = 2
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        buffer[offset++] = code & 0xFF
        buffer[offset++] = (code >> 8) & 0xFF
      }
      const filePath = path.join(tmpDir, 'async-utf16.txt')
      fs.writeFileSync(filePath, buffer)

      const result = await importer.readFileContentAsync(filePath)
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error.code).toBe('UNSUPPORTED_ENCODING')
      }
    })
  })
})
