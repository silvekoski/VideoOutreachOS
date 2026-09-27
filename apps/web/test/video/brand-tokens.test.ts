import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../../..')
const css = readFileSync(path.join(root, 'apps/web/src/video/video.css'), 'utf8')
const brand = (JSON.parse(readFileSync(path.join(root, 'config/mergero.json'), 'utf8')) as { brand: Record<string, string> })
  .brand

function token(name: string): string | undefined {
  return new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'iu').exec(css)?.[1]?.toLowerCase()
}

describe('video page brand tokens', () => {
  it.each([
    ['brand', 'primary'],
    ['ink', 'ink'],
    ['text', 'text'],
    ['muted', 'muted'],
    ['surface', 'surface'],
    ['white', 'white'],
  ])('--color-%s matches brand.%s in config/mergero.json', (name, key) => {
    expect(token(name)).toBe(brand[key]?.toLowerCase())
  })

  it('does not load the admin theme', () => {
    expect(css).not.toMatch(/index\.css|tw-animate-css|shadcn/u)
  })
})
