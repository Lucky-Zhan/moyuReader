import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DisguiseTheme, getThemeClassName } from '../../src/renderer/src/components/DisguiseTheme'

/**
 * 打开阅读设置浮层。
 *
 * 浮层改用 MUI Popover 后会 Portal 到 body，且关闭时不再渲染内容
 * （旧实现是 aria-hidden 隐藏，内容始终留在 DOM 里）。因此所有涉及
 * 面板内容的断言都必须先打开它——这也更贴近真实交互。
 */
function openSettings(): void {
  fireEvent.click(screen.getByLabelText('阅读设置'))
}

describe('DisguiseTheme', () => {
  const defaultProps = {
    stealthEnabled: true,
    onThemeChange: vi.fn(),
    onStealthEnabledChange: vi.fn()
  }

  it('renders theme selector with label and buttons', () => {
    render(<DisguiseTheme theme="dark" {...defaultProps} />)

    openSettings()

    expect(screen.getByLabelText('阅读设置')).toBeDefined()
    expect(screen.getByText('配色')).toBeDefined()
    expect(screen.getByText('深色')).toBeDefined()
    expect(screen.getByText('浅色')).toBeDefined()
    expect(screen.getByText('纸张')).toBeDefined()
    expect(screen.getByText('代码')).toBeDefined()
    expect(screen.getByText('终端')).toBeDefined()
    expect(screen.getByText('隐身模式')).toBeDefined()
  })

  it('marks the active theme button with active class', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="dark" {...defaultProps} onThemeChange={onThemeChange} />)

    openSettings()

    const darkBtn = screen.getByText('深色')
    const lightBtn = screen.getByText('浅色')

    expect(darkBtn.className).toContain('active')
    expect(lightBtn.className).not.toContain('active')
  })

  it('marks paper button as active when paper theme is selected', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="paper" {...defaultProps} onThemeChange={onThemeChange} />)

    openSettings()

    const darkBtn = screen.getByText('深色')
    const paperBtn = screen.getByText('纸张')

    expect(paperBtn.className).toContain('active')
    expect(darkBtn.className).not.toContain('active')
  })

  it('calls onThemeChange when a different theme is clicked', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="dark" {...defaultProps} onThemeChange={onThemeChange} />)

    openSettings()

    fireEvent.click(screen.getByText('纸张'))
    expect(onThemeChange).toHaveBeenCalledWith('paper')
  })

  it('does not call onThemeChange when the current theme is clicked', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="dark" {...defaultProps} onThemeChange={onThemeChange} />)

    openSettings()

    fireEvent.click(screen.getByText('深色'))
    expect(onThemeChange).not.toHaveBeenCalled()
  })

  it('sets aria-pressed correctly on theme buttons', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="paper" {...defaultProps} onThemeChange={onThemeChange} />)

    openSettings()

    const darkBtn = screen.getByLabelText('切换到深色配色')
    const paperBtn = screen.getByLabelText('切换到纸张配色')

    expect(darkBtn.getAttribute('aria-pressed')).toBe('false')
    expect(paperBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onStealthEnabledChange when stealth mode is toggled', () => {
    const onStealthEnabledChange = vi.fn()
    render(
      <DisguiseTheme
        theme="dark"
        stealthEnabled={true}
        onThemeChange={vi.fn()}
        onStealthEnabledChange={onStealthEnabledChange}
      />
    )

    openSettings()

    fireEvent.click(screen.getByLabelText('隐身模式'))
    expect(onStealthEnabledChange).toHaveBeenCalledWith(false)
  })

  it('renders and updates mouse leave behavior settings', () => {
    const onMouseLeaveActionChange = vi.fn()
    const onMouseLeaveDelayChange = vi.fn()
    render(
      <DisguiseTheme
        theme="dark"
        stealthEnabled={true}
        mouseLeaveAction="deferred-quit"
        mouseLeaveDelay={5000}
        onThemeChange={vi.fn()}
        onStealthEnabledChange={vi.fn()}
        onMouseLeaveActionChange={onMouseLeaveActionChange}
        onMouseLeaveDelayChange={onMouseLeaveDelayChange}
      />
    )

    openSettings()

    fireEvent.change(screen.getByLabelText('鼠标移出行为'), {
      target: { value: 'hide' }
    })
    fireEvent.change(screen.getByLabelText('延迟秒数'), {
      target: { value: '9000' }
    })

    expect(onMouseLeaveActionChange).toHaveBeenCalledWith('hide')
    expect(onMouseLeaveDelayChange).toHaveBeenCalledWith(9000)
  })

  it('disables the delay control for immediate quit', () => {
    render(
      <DisguiseTheme
        theme="dark"
        stealthEnabled={true}
        mouseLeaveAction="quit"
        mouseLeaveDelay={5000}
        onThemeChange={vi.fn()}
        onStealthEnabledChange={vi.fn()}
      />
    )

    openSettings()

    expect((screen.getByLabelText('延迟秒数') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('立即退出已关闭延迟设置，请谨慎使用。')).toBeDefined()
  })

  it('renders and updates the configurable show delay', () => {
    const onMouseReturnDelayChange = vi.fn()
    render(
      <DisguiseTheme
        theme="dark"
        stealthEnabled={true}
        mouseLeaveAction="hide"
        mouseLeaveDelay={0}
        mouseReturnDelay={2000}
        onThemeChange={vi.fn()}
        onStealthEnabledChange={vi.fn()}
        onMouseReturnDelayChange={onMouseReturnDelayChange}
      />
    )

    openSettings()

    expect(screen.getByText('显形延迟')).toBeDefined()
    fireEvent.change(screen.getByLabelText('显形延迟秒数'), {
      target: { value: '0' }
    })
    expect(onMouseReturnDelayChange).toHaveBeenCalledWith(0)
  })
})

describe('getThemeClassName', () => {
  it('returns "theme-dark" for dark theme', () => {
    expect(getThemeClassName('dark')).toBe('theme-dark')
  })

  it('returns "theme-paper" for paper theme', () => {
    expect(getThemeClassName('paper')).toBe('theme-paper')
  })

  it('returns disguise class names for code and terminal themes', () => {
    expect(getThemeClassName('code')).toBe('theme-code')
    expect(getThemeClassName('terminal')).toBe('theme-terminal')
  })
})
