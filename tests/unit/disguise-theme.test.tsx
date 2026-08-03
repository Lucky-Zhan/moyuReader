import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DisguiseTheme, getThemeClassName } from '../../src/renderer/src/components/DisguiseTheme'

describe('DisguiseTheme', () => {
  const defaultProps = {
    stealthEnabled: true,
    onThemeChange: vi.fn(),
    onStealthEnabledChange: vi.fn()
  }

  it('renders theme selector with label and buttons', () => {
    render(<DisguiseTheme theme="dark" {...defaultProps} />)

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

    const darkBtn = screen.getByText('深色')
    const lightBtn = screen.getByText('浅色')

    expect(darkBtn.className).toContain('active')
    expect(lightBtn.className).not.toContain('active')
  })

  it('marks paper button as active when paper theme is selected', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="paper" {...defaultProps} onThemeChange={onThemeChange} />)

    const darkBtn = screen.getByText('深色')
    const paperBtn = screen.getByText('纸张')

    expect(paperBtn.className).toContain('active')
    expect(darkBtn.className).not.toContain('active')
  })

  it('calls onThemeChange when a different theme is clicked', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="dark" {...defaultProps} onThemeChange={onThemeChange} />)

    fireEvent.click(screen.getByText('纸张'))
    expect(onThemeChange).toHaveBeenCalledWith('paper')
  })

  it('does not call onThemeChange when the current theme is clicked', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="dark" {...defaultProps} onThemeChange={onThemeChange} />)

    fireEvent.click(screen.getByText('深色'))
    expect(onThemeChange).not.toHaveBeenCalled()
  })

  it('sets aria-pressed correctly on theme buttons', () => {
    const onThemeChange = vi.fn()
    render(<DisguiseTheme theme="paper" {...defaultProps} onThemeChange={onThemeChange} />)

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

    fireEvent.click(screen.getByLabelText('隐身模式'))
    expect(onStealthEnabledChange).toHaveBeenCalledWith(false)
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
