import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { BuyerSlideItem, MgxBuyer } from '@mergero/shared'
import type { DealRow } from '../db/rows.ts'
import { storageRelative } from '../jobs/storage.ts'
import { paths } from '../paths.ts'

function cachedLogoFiles(): Map<string, string> {
  let names: string[] = []
  try {
    names = readdirSync(paths.logosDir)
  } catch {
    return new Map()
  }
  return new Map(
    names
      .filter((name) => !name.startsWith('.'))
      .map((name) => [name.split('.')[0] ?? name, storageRelative(path.join(paths.logosDir, name))]),
  )
}

export function buyerPool(deal: Pick<DealRow, 'mgx'>, candidates: readonly BuyerSlideItem[]): BuyerSlideItem[] {
  const logos = cachedLogoFiles()
  const logoFile = (buyer: MgxBuyer) =>
    buyer.logoUrl ? (logos.get(createHash('sha1').update(buyer.logoUrl).digest('hex')) ?? null) : null
  const pool = new Map(candidates.map((buyer) => [buyer.id, buyer]))
  const mgx = deal.mgx
  for (const buyer of [...(mgx?.buyers ?? []), ...(mgx?.countryFeaturedBuyers ?? []), ...(mgx?.featuredBuyers ?? [])]) {
    if (!buyer.namePublic || pool.has(buyer.id)) continue
    pool.set(buyer.id, { id: buyer.id, name: buyer.name, focus: buyer.focus, website: buyer.website, logoFile: logoFile(buyer) })
  }
  return [...pool.values()]
}
