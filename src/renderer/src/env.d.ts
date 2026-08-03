/// <reference types="vite/client" />

import type { MoyuApi } from '../../shared/moyu-api'

declare global {
  interface Window {
    api: MoyuApi
  }
}

export {}
