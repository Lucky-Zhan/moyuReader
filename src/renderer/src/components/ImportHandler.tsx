import { useCallback } from 'react'
import { showToast } from './Toast'

/** 导入错误码到用户提示信息的映射 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_FORMAT: '仅支持 .txt 格式文件',
  EMPTY_FILE: '文件内容为空',
  UNSUPPORTED_ENCODING: '文件编码不支持，仅支持 UTF-8 和 GBK',
  FILE_TOO_LARGE: '文件过大，最大支持 50MB'
}

interface ImportResult {
  success: boolean
  error?: {
    code: string
    message: string
  }
}

/** 导入文件 hook，处理 file:import IPC 调用及错误提示 */
export function useImportHandler(): { handleImport: () => Promise<boolean> } {
  const handleImport = useCallback(async (): Promise<boolean> => {
    const result = (await window.api.invoke('file:import')) as ImportResult | null

    // 用户取消了文件选择对话框
    if (!result) return false

    if (!result.success && result.error) {
      const msg = ERROR_MESSAGES[result.error.code] || result.error.message
      showToast(msg)
      return false
    }

    return result.success
  }, [])

  return { handleImport }
}
