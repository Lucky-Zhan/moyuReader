export interface SingleInstanceAppLike {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: () => void): void
}

export interface RestorableWindowLike {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function ensureSingleInstanceLock(
  app: SingleInstanceAppLike,
  getMainWindow: () => RestorableWindowLike | null
): boolean {
  const hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    restorePrimaryWindow(getMainWindow())
  })

  return true
}

export function restorePrimaryWindow(window: RestorableWindowLike | null): void {
  if (!window || window.isDestroyed()) return

  if (window.isMinimized()) {
    window.restore()
  }

  window.show()
  window.focus()
}
