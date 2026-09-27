import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeLang, type Lang } from '@mergero/shared'
import { z } from 'zod'
import { env } from '../env.ts'
import { log } from '../log.ts'
import type { LinkedInProfile, LinkedInSource } from './types.ts'

const fileSchema = z.object({
  profiles: z.record(
    z.string(),
    z.object({
      languages: z.array(z.string()).default([]),
      staffCount: z.number().int().nonnegative().nullable().default(null),
    }),
  ),
})

export class SeedLinkedInSource implements LinkedInSource {
  readonly #file: string
  #profiles: Promise<Map<string, LinkedInProfile>> | null = null

  constructor(file = path.join(env.seedDir, 'linkedin.json')) {
    this.#file = file
  }

  async get(input: { email: string | null; name: string; company: string }): Promise<LinkedInProfile | null> {
    const email = input.email?.trim().toLowerCase()
    if (!email) return null
    this.#profiles ??= this.#load().catch((error: unknown) => {
      this.#profiles = null
      throw error
    })
    const profile = (await this.#profiles).get(email)
    return profile ? { languages: [...profile.languages], staffCount: profile.staffCount } : null
  }

  async #load(): Promise<Map<string, LinkedInProfile>> {
    let text: string
    try {
      text = await readFile(this.#file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      log.warn('linkedin seed file is missing, no LinkedIn data', { file: this.#file })
      return new Map()
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`${this.#file} is not valid JSON`)
    }
    const parsed = fileSchema.safeParse(json)
    if (!parsed.success) throw new Error(`${this.#file} does not match the LinkedIn seed shape:\n${z.prettifyError(parsed.error)}`)
    const profiles = new Map<string, LinkedInProfile>()
    for (const [email, profile] of Object.entries(parsed.data.profiles)) {
      const languages = [...new Set(profile.languages.map(normalizeLang).filter((lang): lang is Lang => lang !== null))]
      profiles.set(email.trim().toLowerCase(), { languages, staffCount: profile.staffCount })
    }
    return profiles
  }
}
