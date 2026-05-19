import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import Toast, { showToast } from '../../src/renderer/src/components/Toast'
import { useImportHandler } from '../../src/renderer/src/components/ImportHandler'

// Mock window.api
const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveAllListeners = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  ;(window as unknown as { api: typeof window.api }).api = {
    invoke: mockInvoke,
    on: mockOn,
    removeAllListeners: mockRemoveAllListeners
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows message when showToast is called', async () => {
    render(<Toast />)

    act(() => {
      showToast('测试消息')
    })

    expect(screen.getByText('测试消息')).toBeTruthy()
  })

  it('auto-dismisses after 3 seconds', async () => {
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

  it('listens for autosave:failed IPC event', () => {
    render(<Toast />)

    expect(mockOn).toHaveBeenCalledWith('autosave:failed', expect.any(Function))
  })

  it('shows toast when autosave:failed event fires', () => {
    render(<Toast />)

    // Get the callback registered with window.api.on
    const callback = mockOn.mock.calls.find((call) => call[0] === 'autosave:failed')?.[1]
    expect(callback).toBeDefined()

    act(() => {
      callback!()
    })

    expect(screen.getByText('保存失败，将在 30 秒后重试')).toBeTruthy()
  })

  it('cleans up autosave:failed listener on unmount', () => {
    const { unmount } = render(<Toast />)
    unmount()

    expect(mockRemoveAllListeners).toHaveBeenCalledWith('autosave:failed')
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
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: { code: 'INVALID_FORMAT', message: 'Invalid format' }
    })

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
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: { code: 'EMPTY_FILE', message: 'Empty file' }
    })

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
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: { code: 'UNSUPPORTED_ENCODING', message: 'Unsupported encoding' }
    })

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
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File too large' }
    })

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
    mockInvoke.mockResolvedValueOnce({ success: true })

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
    mockInvoke.mockResolvedValueOnce(null)

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
