import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SeedLinkedInSource } from '../../src/providers/linkedin.ts'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mergero-linkedin-'))
  await writeFile(
    path.join(dir, 'linkedin.json'),
    JSON.stringify({
      profiles: {
        'Matti@Acme.test': { languages: ['fi', 'en-GB', 'no', 'xx'], staffCount: 45 },
        'anna@beta.test': { languages: [] },
      },
    }),
  )
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SeedLinkedInSource', () => {
  const source = () => new SeedLinkedInSource(path.join(dir, 'linkedin.json'))

  it('finds a profile by the lower-case email and normalizes the languages', async () => {
    const linkedin = source()
    expect(await linkedin.get({ email: ' MATTI@acme.test ', name: 'Matti', company: 'Acme' })).toEqual({
      languages: ['fi', 'en', 'nb'],
      staffCount: 45,
    })
    expect(await linkedin.get({ email: 'anna@beta.test', name: 'Anna', company: 'Beta' })).toEqual({ languages: [], staffCount: null })
  })

  it('returns null for an unknown or missing email and for a missing file', async () => {
    expect(await source().get({ email: 'nobody@x.test', name: 'N', company: 'X' })).toBeNull()
    expect(await source().get({ email: null, name: 'N', company: 'X' })).toBeNull()
    expect(await new SeedLinkedInSource(path.join(dir, 'missing.json')).get({ email: 'a@b.c', name: 'A', company: 'B' })).toBeNull()
  })
})
