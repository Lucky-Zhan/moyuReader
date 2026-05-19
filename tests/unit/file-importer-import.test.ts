import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock electron modules before importing FileImporter
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn()
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

import { dialog, ipcMain } from 'electron'
import { FileImporter, registerFileImportHandler } from '../../src/main/file-importer'

describe('FileImporter - importFile 完整流程', () => {
  const importer = new FileImporter()
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyureader-import-test-'))
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('用户取消选择时应返回 success: false', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: []
    })

    const result = await importer.importFile()
    expect(result.success).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.book).toBeUndefined()
  })

  it('选择有效 UTF-8 txt 文件应成功导入', async () => {
    const text = '第一章 开始\n这是测试小说内容。'
    const filePath = path.join(tmpDir, '测试小说.txt')
    fs.writeFileSync(filePath, text, 'utf-8')

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [filePath]
    })

    const result = await importer.importFile()
    expect(result.success).toBe(true)
    expect(result.book).toBeDefined()
    expect(result.book!.fileName).toBe('测试小说')
    expect(result.book!.filePath).toBe(filePath)
    expect(result.book!.content).toBe(text)
    expect(result.book!.encoding).toBe('utf-8')
    expect(result.book!.fileSize).toBeGreaterThan(0)
  })

  it('文件名提取应去除 .txt 扩展名', async () => {
    const filePath = path.join(tmpDir, 'My Novel Book.txt')
    fs.writeFileSync(filePath, 'Some content here', 'utf-8')

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [filePath]
    })

    const result = await importer.importFile()
    expect(result.success).toBe(true)
    expect(result.book!.fileName).toBe('My Novel Book')
  })

  it('空文件应返回 EMPTY_FILE 错误', async () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    fs.writeFileSync(filePath, '')

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [filePath]
    })

    const result = await importer.importFile()
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error!.code).toBe('EMPTY_FILE')
  })

  it('fileSize 应正确反映文件实际大小', async () => {
    const text = '这是一段有确定长度的文本内容'
    const filePath = path.join(tmpDir, 'sized-file.txt')
    fs.writeFileSync(filePath, text, 'utf-8')
    const expectedSize = fs.statSync(filePath).size

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [filePath]
    })

    const result = await importer.importFile()
    expect(result.success).toBe(true)
    expect(result.book!.fileSize).toBe(expectedSize)
  })
})

describe('registerFileImportHandler - IPC handler 注册', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应注册 file:import 通道的 handler', () => {
    const importer = new FileImporter()
    registerFileImportHandler(importer)

    expect(ipcMain.handle).toHaveBeenCalledWith('file:import', expect.any(Function))
  })

  it('注册的 handler 应调用 importFile 方法', async () => {
    const importer = new FileImporter()
    const mockImportResult = { success: false }
    vi.spyOn(importer, 'importFile').mockResolvedValue(mockImportResult)

    registerFileImportHandler(importer)

    // 获取注册的 handler 函数并调用
    const handlerCall = vi.mocked(ipcMain.handle).mock.calls[0]
    const handler = handlerCall[1] as () => Promise<unknown>
    const result = await handler()

    expect(importer.importFile).toHaveBeenCalled()
    expect(result).toBe(mockImportResult)
  })
})
