import * as path from 'path'
import * as fs from 'fs'
import { dialog } from 'electron'
import chardet from 'chardet'
import * as iconv from 'iconv-lite'
import { EncodingType, ImportError, ImportResult, BookData } from '../shared/types'
import { MAX_FILE_SIZE } from '../shared/constants'

/** GBK 系列编码名称（chardet 可能返回的变体） */
const GBK_ENCODINGS = ['gb18030', 'gb2312', 'gbk', 'euc-cn', 'chinese']

/** UTF-8 / UTF-16 字节序标记（U+FEFF） */
const BYTE_ORDER_MARK = '\uFEFF'

/**
 * 去掉文本开头的 BOM。
 *
 * 很多 Windows 下的 TXT 编辑器会写入 UTF-8 BOM。chardet 仍会正确识别成
 * UTF-8，但解码后字符串首字符是 U+FEFF：它不可见，却会污染第一章标题，
 * 并让「首行是否等于章节标题」这类比较莫名失败。这里在解码后统一剥掉。
 */
function stripByteOrderMark(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
}

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
   * 把文件 Buffer 解码成文本。
   *
   * 同步/异步两条读取路径共用这一份逻辑，避免解码规则（尤其是 gb18030 与
   * BOM 处理）在两边各写一遍后逐渐分叉。
   */
  private decodeBuffer(buffer: Buffer, encoding: EncodingType): string {
    const content =
      encoding === 'utf-8'
        ? buffer.toString('utf-8')
        : // 用 gb18030 而不是 gbk 解码：GB18030 是 GBK 的超集，GBK 无法解码
          // GB18030 的 4 字节序列（生僻字、部分人名用字），会输出 U+FFFD 乱码。
          // 对纯 GBK 内容两者结果一致，因此统一用 gb18030 更安全。
          iconv.decode(buffer, 'gb18030')

    return stripByteOrderMark(content)
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

    return { content: this.decodeBuffer(buffer, encoding), encoding }
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

    return { content: this.decodeBuffer(buffer, encoding), encoding }
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

    return this.importSelectedFile(result.filePaths[0])
  }

  /** 批量导入流程：允许选择多个 txt 文件，并逐个返回导入结果。 */
  async importFiles(): Promise<ImportResult[]> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Text Files', extensions: ['txt'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    const imported: ImportResult[] = []
    for (const filePath of result.filePaths) {
      imported.push(await this.importSelectedFile(filePath))
    }

    return imported
  }

  private async importSelectedFile(filePath: string): Promise<ImportResult> {
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
