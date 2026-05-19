import { describe, it, expect } from 'vitest'
import { FileImporter } from '../../src/main/file-importer'
import { MAX_FILE_SIZE } from '../../src/shared/constants'

describe('FileImporter - 文件验证逻辑', () => {
  const importer = new FileImporter()

  describe('validateFormat - 文件格式验证', () => {
    it('应接受 .txt 扩展名', () => {
      expect(importer.validateFormat('/path/to/novel.txt')).toBeNull()
    })

    it('应接受大写 .TXT 扩展名', () => {
      expect(importer.validateFormat('/path/to/novel.TXT')).toBeNull()
    })

    it('应接受混合大小写 .Txt 扩展名', () => {
      expect(importer.validateFormat('/path/to/novel.Txt')).toBeNull()
    })

    it('应拒绝 .pdf 文件', () => {
      const error = importer.validateFormat('/path/to/file.pdf')
      expect(error).not.toBeNull()
      expect(error!.code).toBe('INVALID_FORMAT')
    })

    it('应拒绝 .doc 文件', () => {
      const error = importer.validateFormat('/path/to/file.doc')
      expect(error).not.toBeNull()
      expect(error!.code).toBe('INVALID_FORMAT')
    })

    it('应拒绝无扩展名文件', () => {
      const error = importer.validateFormat('/path/to/file')
      expect(error).not.toBeNull()
      expect(error!.code).toBe('INVALID_FORMAT')
    })

    it('应拒绝 .txt.bak 文件', () => {
      const error = importer.validateFormat('/path/to/file.txt.bak')
      expect(error).not.toBeNull()
      expect(error!.code).toBe('INVALID_FORMAT')
    })
  })

  describe('validateFileSize - 文件大小验证', () => {
    it('应接受小于 50MB 的文件', () => {
      expect(importer.validateFileSize(1024)).toBeNull()
    })

    it('应接受恰好 50MB 的文件', () => {
      expect(importer.validateFileSize(MAX_FILE_SIZE)).toBeNull()
    })

    it('应拒绝超过 50MB 的文件', () => {
      const error = importer.validateFileSize(MAX_FILE_SIZE + 1)
      expect(error).not.toBeNull()
      expect(error!.code).toBe('FILE_TOO_LARGE')
    })
  })

  describe('validateNotEmpty - 空文件验证', () => {
    it('应接受非空文件', () => {
      expect(importer.validateNotEmpty(100)).toBeNull()
    })

    it('应拒绝空文件（0 字节）', () => {
      const error = importer.validateNotEmpty(0)
      expect(error).not.toBeNull()
      expect(error!.code).toBe('EMPTY_FILE')
    })
  })

  describe('validateFile - 综合验证', () => {
    it('有效的 .txt 文件应通过所有验证', () => {
      expect(importer.validateFile('/path/to/novel.txt', 1024)).toBeNull()
    })

    it('格式错误应优先返回', () => {
      const error = importer.validateFile('/path/to/file.pdf', 0)
      expect(error!.code).toBe('INVALID_FORMAT')
    })

    it('格式正确但超大应返回 FILE_TOO_LARGE', () => {
      const error = importer.validateFile('/path/to/novel.txt', MAX_FILE_SIZE + 1)
      expect(error!.code).toBe('FILE_TOO_LARGE')
    })

    it('格式正确但为空应返回 EMPTY_FILE', () => {
      const error = importer.validateFile('/path/to/novel.txt', 0)
      expect(error!.code).toBe('EMPTY_FILE')
    })
  })
})
