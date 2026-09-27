import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const storageDir = mkdtempSync(path.join(tmpdir(), 'mergero-jobs-'))
process.env.STORAGE_DIR = storageDir

export function removeStorage(): void {
  rmSync(storageDir, { recursive: true, force: true })
}
