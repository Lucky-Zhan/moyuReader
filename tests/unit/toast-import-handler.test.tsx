import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Toast, { showToast } from '../../src/renderer/src/components/Toast'
import { useImportHandler } from '../../src/renderer/src/components/ImportHandler'
import type { MoyuApi } from '../../src/shared/moyu-api'
import { createMockApi } from './mock-api'

let api: MoyuApi

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  api = createMockApi()
  window.api = api
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows message when showToast is called', () => {
    render(<Toast />)

    act(() => {
      showToast('测试消息')
    })

    expect(screen.getByText('测试消息')).toBeTruthy()
  })

  it('auto-dismisses after 3 seconds', () => {
    render(<Toast />)

    act(() => {
      showToast('消失的消息')
    })

    expect(screen.getByText('消失的消息')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText('消失的消息')).toBeNull()
  })

  it('has role="alert" for accessibility', () => {
    render(<Toast />)

    act(() => {
      showToast('无障碍测试')
    })

    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('listens for autosave failure events', () => {
    render(<Toast />)

    expect(api.events.onAutosaveFailed).toHaveBeenCalledWith(expect.any(Function))
  })

  it('shows toast when autosave failure event fires', () => {
    render(<Toast />)

    const callback = vi.mocked(api.events.onAutosaveFailed).mock.calls[0]?.[0]
    expect(callback).toBeDefined()

    act(() => {
      callback!({ message: '保存失败' })
    })

    expect(screen.getByText('保存失败，将在 30 秒后重试')).toBeTruthy()
  })

  it('shows toast when global shortcut registration fails', () => {
    render(<Toast />)

    const callback = vi.mocked(api.events.onShortcutRegistrationFailed).mock.calls[0]?.[0]
    expect(callback).toBeDefined()

    act(() => {
      callback!({ accelerator: 'CommandOrControl+Shift+H' })
    })

    expect(
      screen.getByText(
        '快捷键 CommandOrControl+Shift+H 注册失败，可能已被其他应用占用'
      )
    ).toBeTruthy()
  })

  it('cleans up only its own event listeners on unmount', () => {
    const unsubscribeAutosave = vi.fn()
    const unsubscribeShortcut = vi.fn()
    api.events.onAutosaveFailed = vi.fn(() => unsubscribeAutosave)
    api.events.onShortcutRegistrationFailed = vi.fn(() => unsubscribeShortcut)

    const { unmount } = render(<Toast />)
    unmount()

    expect(unsubscribeAutosave).toHaveBeenCalledOnce()
    expect(unsubscribeShortcut).toHaveBeenCalledOnce()
  })
})

// Helper component to test the hook
function ImportTestComponent(): JSX.Element {
  const { handleImport } = useImportHandler()

  return (
    <button onClick={() => handleImport()}>导入</button>
  )
}

describe('useImportHandler', () => {
  it('shows INVALID_FORMAT error toast', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{
      success: false,
      error: { code: 'INVALID_FORMAT', message: 'Invalid format' }
    }])

    render(
      <>
        <ImportTestComponent />
        <Toast />
      </>
    )

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(screen.getByText('仅支持 .txt 格式文件')).toBeTruthy()
  })

  it('shows EMPTY_FILE error toast', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{
      success: false,
      error: { code: 'EMPTY_FILE', message: 'Empty file' }
    }])

    render(
      <>
        <ImportTestComponent />
        <Toast />
      </>
    )

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(screen.getByText('文件内容为空')).toBeTruthy()
  })

  it('shows UNSUPPORTED_ENCODING error toast', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{
      success: false,
      error: { code: 'UNSUPPORTED_ENCODING', message: 'Unsupported encoding' }
    }])

    render(
      <>
        <ImportTestComponent />
        <Toast />
      </>
    )

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(screen.getByText('文件编码不支持，仅支持 UTF-8 和 GBK')).toBeTruthy()
  })

  it('shows FILE_TOO_LARGE error toast', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File too large' }
    }])

    render(
      <>
        <ImportTestComponent />
        <Toast />
      </>
    )

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(screen.getByText('文件过大，最大支持 50MB')).toBeTruthy()
  })

  it('returns true on successful import', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([{ success: true }])

    let result: boolean | undefined

    function TestComponent(): JSX.Element {
      const { handleImport } = useImportHandler()
      return (
        <button onClick={async () => { result = await handleImport() }}>导入</button>
      )
    }

    render(<TestComponent />)

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(result).toBe(true)
  })

  it('returns false when user cancels file dialog', async () => {
    vi.mocked(api.file.importMany).mockResolvedValueOnce([])

    let result: boolean | undefined

    function TestComponent(): JSX.Element {
      const { handleImport } = useImportHandler()
      return (
        <button onClick={async () => { result = await handleImport() }}>导入</button>
      )
    }

    render(<TestComponent />)

    await act(async () => {
      screen.getByText('导入').click()
    })

    expect(result).toBe(false)
  })
})
