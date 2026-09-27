import { stat } from 'node:fs/promises'
import type { Channel } from '@mergero/shared'
import { env } from '../env.ts'

function encodePath(file: string): string {
  return file.split('/').map(encodeURIComponent).join('/')
}

export function dealFileUrl(dealId: number, file: string, query: Record<string, string> = {}): string {
  const search = new URLSearchParams(query).toString()
  return `/api/deals/${dealId}/files/${encodePath(file)}${search ? `?${search}` : ''}`
}

export function dealFileOf(dealId: number, storagePath: string | null): string | null {
  const prefix = `deals/${dealId}/`
  return storagePath?.startsWith(prefix) && storagePath.length > prefix.length ? storagePath.slice(prefix.length) : null
}

export function videoLink(code: string, channel?: Channel): string {
  return `${env.publicBaseUrl}/v/${code}${channel ? `?c=${channel}` : ''}`
}

export async function isFile(file: string): Promise<boolean> {
  return (await stat(file).catch(() => null))?.isFile() ?? false
}
