import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Brand, MergeroContact } from '@mergero/shared'
import { z } from 'zod'
import { env } from '../env.ts'

const text = z.string().trim().min(1)
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/u)

const configSchema = z
  .object({
    company: text,
    website: z.url(),
    privacyUrl: z.url(),
    email: z.email(),
    facts: z.object({ buyerCount: z.int().positive(), publicBuyerCount: z.int().positive() }),
    brand: z.object({
      primary: color,
      ink: color,
      text: color,
      muted: color,
      surface: color,
      white: color,
      logoOnDark: text,
      logoOnLight: text,
    }),
    offices: z.record(z.string(), z.object({ name: text, address: text, phone: text })),
    officeByCountry: z.record(z.string().regex(/^[A-Z]{2}$/u), z.string()),
    defaultOffice: z.string(),
  })
  .refine((config) => config.defaultOffice in config.offices, 'defaultOffice must name an office')
  .refine(
    (config) => Object.values(config.officeByCountry).every((office) => office in config.offices),
    'each officeByCountry value must name an office',
  )

export type MergeroConfig = z.infer<typeof configSchema>

let cached: MergeroConfig | null = null

export function mergeroConfig(): MergeroConfig {
  if (cached) return cached
  const file = path.join(env.configDir, 'mergero.json')
  const parsed = configSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success) throw new Error(`${file} is not a valid Mergero config:\n${z.prettifyError(parsed.error)}`)
  cached = parsed.data
  return cached
}

export function contactFor(country: string): MergeroContact {
  const config = mergeroConfig()
  const key = config.officeByCountry[country.trim().toUpperCase()] ?? config.defaultOffice
  const office = config.offices[key] ?? config.offices[config.defaultOffice]
  if (!office) throw new Error(`The Mergero config has no office "${key}"`)
  return {
    company: config.company,
    address: office.address,
    email: config.email,
    phone: office.phone,
    website: config.website,
    privacyUrl: config.privacyUrl,
  }
}

export function brand(): Brand {
  return { ...mergeroConfig().brand }
}
