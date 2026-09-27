import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { insideDir, paths } from '../paths.ts'
import { NonRetryableError } from '../queue/index.ts'

export function storageRelative(file: string): string {
  return path.relative(paths.root, file).split(path.sep).join('/')
}

export function storageFile(file: string, use: string): string {
  const resolved = insideDir(paths.root, file)
  if (!resolved) throw new NonRetryableError(`The ${use} path is outside the storage folder: ${file}`)
  return resolved
}

export async function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID().slice(0, 8)}.tmp`)
  try {
    await writeFile(tmp, data)
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
