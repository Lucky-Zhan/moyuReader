import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MoyuBackup } from '../shared/types'
import type { BookshelfManager } from './bookshelf-manager'
import { assertTrustedIpcSender, type IpcSenderValidator } from './ipc-security'

export function registerBackupHandlers(
  bookshelfManager: BookshelfManager,
  isTrustedSender: IpcSenderValidator
): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_EXPORT, async (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    const result = await dialog.showSaveDialog({
      title: '导出 MoyuReader 备份',
      defaultPath: `moyureader-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'MoyuReader Backup', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false }
    }

    const backup = bookshelfManager.createBackup()
    await writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf-8')
    return { success: true, filePath: result.filePath }
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    const result = await dialog.showOpenDialog({
      title: '恢复 MoyuReader 备份',
      properties: ['openFile'],
      filters: [{ name: 'MoyuReader Backup', extensions: ['json'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const backup = JSON.parse(raw) as MoyuBackup
      const importedBooks = bookshelfManager.restoreBackup(backup)
      return { success: true, filePath: result.filePaths[0], importedBooks }
    } catch (error) {
      return {
        success: false,
        filePath: result.filePaths[0],
        error: error instanceof Error ? error.message : '恢复失败'
      }
    }
  })
}
