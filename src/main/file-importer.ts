import * as path from 'path'
import * as fs from 'fs'
import { dialog, ipcMain } from 'electron'
import chardet from 'chardet'
import * as iconv from 'iconv-lite'
import { EncodingType, ImportError, ImportResult, BookData } from '../shared/types'
import { MAX_FILE_SIZE } from '../shared/constants'
import { IPC_CHANNELS } from '../shared/ipc-channels'

/** GBK 系列编码名称（chardet 可能返回的变体） */
const GBK_ENCODINGS = ['gb18030', 'gb2312', 'gbk', 'euc-cn', 'chinese']

/**
 * 文件导入器
 * 负责文件选择、验证、编码检测和内容读取
 */
export class FileImporter {
  /**
   * 验证文件格式（扩展名必须为 .txt，不区分大小写）
   */
  validateFormat(filePath: string): ImportError | null {
    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.txt') {
      return {
        code: 'INVALID_FORMAT',
        message: '仅支持 .txt 格式文件'
      }
    }
    return null
  }

  /**
   * 验证文件大小（不能超过 50MB）
   */
  validateFileSize(fileSize: number): ImportError | null {
    if (fileSize > MAX_FILE_SIZE) {
      return {
        code: 'FILE_TOO_LARGE',
        message: '文件过大，最大支持 50MB'
      }
    }
    return null
  }

  /**
   * 验证文件是否为空（大小为 0 字节）
   */
  validateNotEmpty(fileSize: number): ImportError | null {
    if (fileSize === 0) {
      return {
        code: 'EMPTY_FILE',
        message: '文件内容为空'
      }
    }
    return null
  }

  /**
   * 执行所有文件验证，返回第一个错误或 null
   * 验证顺序：格式 → 大小 → 空文件
   */
  validateFile(filePath: string, fileSize: number): ImportError | null {
    const formatError = this.validateFormat(filePath)
    if (formatError) return formatError

    const sizeError = this.validateFileSize(fileSize)
    if (sizeError) return sizeError

    const emptyError = this.validateNotEmpty(fileSize)
    if (emptyError) return emptyError

    return null
  }

  /**
   * 检测文件编码
   * 读取文件 Buffer 并使用 chardet 检测编码类型
   * 支持 UTF-8 和 GBK（含 GB2312/GB18030）
   */
  detectEncoding(buffer: Buffer): EncodingType | null {
    const detected = chardet.detect(buffer)
    if (!detected) {
      return null
    }

    const encodingLower = detected.toLowerCase()

    // UTF-8 检测（包括 ASCII，ASCII 是 UTF-8 的子集）
    if (encodingLower === 'utf-8' || encodingLower === 'ascii' || encodingLower === 'utf8') {
      return 'utf-8'
    }

    // GBK 系列编码检测
    if (GBK_ENCODINGS.includes(encodingLower)) {
      return 'gbk'
    }

    // 不支持的编码
    return null
  }

  /**
   * 读取文件并解码内容
   * 1. 读取文件为 Buffer
   * 2. 使用 chardet 检测编码
   * 3. UTF-8 直接解码，GBK 使用 iconv-lite 解码
   * 4. 不支持的编码返回 UNSUPPORTED_ENCODING 错误
   */
  readFileContent(filePath: string): { content: string; encoding: EncodingType } | { error: ImportError } {
    const buffer = fs.readFileSync(filePath)

    const encoding = this.detectEncoding(buffer)

    if (!encoding) {
      return {
        error: {
          code: 'UNSUPPORTED_ENCODING',
          message: '文件编码不支持，仅支持 UTF-8 和 GBK'
        }
      }
    }

    let content: string
    if (encoding === 'utf-8') {
      content = buffer.toString('utf-8')
    } else {
      // GBK 编码使用 iconv-lite 解码
      content = iconv.decode(buffer, 'gbk')
    }

    return { content, encoding }
  }

  /**
   * 异步读取文件并解码内容
   */
  async readFileContentAsync(filePath: string): Promise<{ content: string; encoding: EncodingType } | { error: ImportError }> {
    const buffer = await fs.promises.readFile(filePath)

    const encoding = this.detectEncoding(buffer)

    if (!encoding) {
      return {
        error: {
          code: 'UNSUPPORTED_ENCODING',
          message: '文件编码不支持，仅支持 UTF-8 和 GBK'
        }
      }
    }

    let content: string
    if (encoding === 'utf-8') {
      content = buffer.toString('utf-8')
    } else {
      // GBK 编码使用 iconv-lite 解码
      content = iconv.decode(buffer, 'gbk')
    }

    return { content, encoding }
  }

  /**
   * 完整文件导入流程
   * 1. 打开文件选择对话框（过滤 .txt 文件）
   * 2. 获取文件大小
   * 3. 执行所有验证
   * 4. 检测编码并读取内容
   * 5. 提取文件名作为默认书名
   * 6. 返回 ImportResult
   */
  async importFile(): Promise<ImportResult> {
    // 打开文件选择对话框
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['txt'] }
      ]
    })

    // 用户取消选择
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    const filePath = result.filePaths[0]

    // 获取文件大小
    const stats = await fs.promises.stat(filePath)
    const fileSize = stats.size

    // 执行所有验证
    const validationError = this.validateFile(filePath, fileSize)
    if (validationError) {
      return { success: false, error: validationError }
    }

    // 检测编码并读取内容
    const readResult = await this.readFileContentAsync(filePath)
    if ('error' in readResult) {
      return { success: false, error: readResult.error }
    }

    // 提取文件名（去除 .txt 扩展名）作为默认书名
    const fileName = path.basename(filePath, path.extname(filePath))

    // 构建 BookData
    const bookData: BookData = {
      fileName,
      filePath,
      content: readResult.content,
      fileSize,
      encoding: readResult.encoding
    }

    return { success: true, book: bookData }
  }
}

/**
 * 注册文件导入 IPC handler
 * 将 file:import 通道绑定到 FileImporter 实例的 importFile 方法
 */
export function registerFileImportHandler(fileImporter: FileImporter): void {
  ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, async () => {
    return fileImporter.importFile()
  })
}
