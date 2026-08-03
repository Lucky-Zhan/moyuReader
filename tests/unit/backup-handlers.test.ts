import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/ipc-channels'
import type { MoyuBackup } from '../../src/shared/types'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}
const mockDialog = {
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn()
}
const mockWriteFile = vi.fn()
const mockReadFile = vi.fn()

vi.mock('electron', () => ({
  dialog: mockDialog,
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }
  }
}))

vi.mock('fs/promises', () => ({
  default: {
    writeFile: mockWriteFile,
    readFile: mockReadFile
  },
  writeFile: mockWriteFile,
  readFile: mockReadFile
}))

function createMockBookshelfManager() {
  const backup: MoyuBackup = {
    version: 1,
    exportedAt: 1000,
    books: [],
    progress: {},
    bookmarks: {}
  }

  return {
    createBackup: vi.fn(() => backup),
    restoreBackup: vi.fn(() => 2)
  }
}

describe('registerBackupHandlers', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    vi.clearAllMocks()
    const { registerBackupHandlers } = await import('../../src/main/backup-handlers')
    registerBackupHandlers(createMockBookshelfManager() as any, () => true)
  })

  it('should register backup export and restore channels', () => {
    expect(handlers[IPC_CHANNELS.BACKUP_EXPORT]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BACKUP_RESTORE]).toBeDefined()
  })

  it('should export backup JSON to the selected file', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/moyu-backup.json'
    })

    const result = await handlers[IPC_CHANNELS.BACKUP_EXPORT]({})

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/moyu-backup.json',
      expect.stringContaining('"version": 1'),
      'utf-8'
    )
    expect(result).toEqual({ success: true, filePath: '/tmp/moyu-backup.json' })
  })

  it('should return success false when export is cancelled', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true })

    const result = await handlers[IPC_CHANNELS.BACKUP_EXPORT]({})

    expect(result).toEqual({ success: false })
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('should restore a selected backup file', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/moyu-backup.json']
    })
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      exportedAt: 1000,
      books: [],
      progress: {},
      bookmarks: {}
    }))

    const result = await handlers[IPC_CHANNELS.BACKUP_RESTORE]({})

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/moyu-backup.json', 'utf-8')
    expect(result).toEqual({
      success: true,
      filePath: '/tmp/moyu-backup.json',
      importedBooks: 2
    })
  })

  it('should reject untrusted backup requests', async () => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    const { registerBackupHandlers } = await import('../../src/main/backup-handlers')
    registerBackupHandlers(createMockBookshelfManager() as any, () => false)

    await expect(handlers[IPC_CHANNELS.BACKUP_EXPORT]({})).rejects.toThrow(
      'untrusted sender'
    )
    expect(mockDialog.showSaveDialog).not.toHaveBeenCalled()
  })
})
