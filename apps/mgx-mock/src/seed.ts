import { readFile } from 'node:fs/promises'
import * as z from 'zod'

const countryCode = z.string().regex(/^[A-Z]{2}$/)
const naceCode = z.string().regex(/^\d{2}(\.\d{1,2})?$/)

const buyerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  logo: z.string().regex(/^[a-z0-9-]+\.(svg|png|jpg|webp)$/).nullable(),
  website: z.url().nullable(),
  focus: z.string().min(1).max(80),
  nace: z.array(naceCode).min(1),
  countries: z.array(countryCode).min(1),
  name_public: z.boolean(),
  featured: z.boolean(),
})

const closedDealSchema = z.object({
  id: z.string().min(1),
  year: z.int().min(1990).max(2100),
  country: countryCode,
  nace: naceCode,
  text: z.string().min(1).max(90),
  profitMultiple: z.number().positive(),
})

const uniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length

export const mgxSeedSchema = z.object({
  buyers: z.array(buyerSchema).refine(uniqueIds, 'Buyer IDs must be unique'),
  closedDeals: z.array(closedDealSchema).refine(uniqueIds, 'Closed deal IDs must be unique'),
})

export type MgxSeed = z.infer<typeof mgxSeedSchema>
export type SeedBuyer = MgxSeed['buyers'][number]
export type SeedClosedDeal = MgxSeed['closedDeals'][number]

export async function loadMgxSeed(file: string): Promise<MgxSeed> {
  const parsed = mgxSeedSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid MGX seed ${file}: ${z.prettifyError(parsed.error)}`)
  return parsed.data
}
