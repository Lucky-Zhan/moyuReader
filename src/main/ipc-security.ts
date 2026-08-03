import type { IpcMainInvokeEvent } from 'electron'

export type IpcSenderValidator = (event: IpcMainInvokeEvent) => boolean

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  isTrustedSender: IpcSenderValidator
): void {
  if (!isTrustedSender(event)) {
    throw new Error('Blocked IPC request from an untrusted sender')
  }
}
