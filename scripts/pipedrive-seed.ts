import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PipedriveConfig } from '../apps/server/src/providers/types.ts'
import {
  baseUrlFor,
  createPipedriveApi,
  loadScriptEnv,
  type PipedriveApi,
  required,
  writeVideoFields,
} from './pipedrive-api.ts'

interface SeedFile {
  users: { id: number; name: string; email: string; active: boolean }[]
  organizations: { id: number; name: string; website: string | null; countryCode: string; businessId: string | null; nace: string | null }[]
  persons: { id: number; name: string; firstName: string; jobTitle: string | null; email: string | null; phone: string | null; orgId: number }[]
  deals: {
    id: number
    title: string
    ownerId: number
    personId: number
    orgId: number
    stage: keyof PipedriveConfig['stages'] | null
    status: 'open' | 'won' | 'lost'
  }[]
}

interface PdUser {
  id: number
  name: string
  email: string | null
  active_flag?: boolean
}

interface PdStage {
  id: number
  name: string
  order_nr: number
  is_deleted?: boolean
}

type Entity = 'organizations' | 'persons' | 'deals'

interface SeedItem {
  seedId: number
  name: string
  body: () => Record<string, unknown>
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function mapped(ids: Map<number, number>, seedId: number, what: string): number {
  const id = ids.get(seedId)
  if (id === undefined) throw new Error(`No Pipedrive ${what} for seed ID ${seedId}`)
  return id
}

async function ensureByName(api: PipedriveApi, entity: Entity, nameKey: 'name' | 'title', items: SeedItem[]): Promise<Map<number, number>> {
  const existing = await api.list<{ id: number } & Record<string, unknown>>(`/api/v2/${entity}`)
  const byName = new Map(existing.map((item) => [String(item[nameKey]).trim().toLowerCase(), item.id]))
  const ids = new Map<number, number>()
  for (const item of items) {
    const found = byName.get(item.name.trim().toLowerCase())
    if (found !== undefined) {
      ids.set(item.seedId, found)
      console.log(`  exists  ${entity.slice(0, -1)} ${item.name} (id ${found})`)
      continue
    }
    const created = await api.request<{ id: number }>('POST', `/api/v2/${entity}`, { body: item.body() })
    ids.set(item.seedId, created.id)
    console.log(`  created ${entity.slice(0, -1)} ${item.name} (id ${created.id})`)
  }
  return ids
}

async function readConfig(file: string): Promise<PipedriveConfig> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as PipedriveConfig
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${file} does not exist. Run "pnpm setup:pipedrive" first.`)
    throw error
  }
}

async function main(): Promise<void> {
  const env = await loadScriptEnv()
  const baseUrl = baseUrlFor(required(env.pipedriveDomain, 'PIPEDRIVE_COMPANY_DOMAIN'))
  const api = createPipedriveApi(required(env.pipedriveToken, 'PIPEDRIVE_API_TOKEN'), baseUrl)
  const config = await readConfig(path.join(env.configDir, 'pipedrive.json'))
  const seed = JSON.parse(await readFile(path.join(env.seedDir, 'pipedrive.json'), 'utf8')) as SeedFile
  console.log(`Seeding ${baseUrl}`)

  const users = await api.request<PdUser[]>('GET', '/api/v1/users')
  const me = await api.request<PdUser>('GET', '/api/v1/users/me')
  const owners = new Map<number, number>()
  for (const user of seed.users) {
    const match = users.find((item) => item.active_flag !== false && item.email?.toLowerCase() === user.email.toLowerCase())
    owners.set(user.id, match?.id ?? me.id)
    console.log(`  owner   ${user.name} -> ${match ? `${match.name} (id ${match.id})` : `${me.name} (id ${me.id}, token user)`}`)
  }
  const orgOwner = (orgId: number) => {
    const deal = seed.deals.find((item) => item.orgId === orgId)
    return deal ? mapped(owners, deal.ownerId, 'owner') : me.id
  }

  const toolStages = new Set(Object.values(config.stages))
  const entryStage = (await api.list<PdStage>('/api/v2/stages', { pipeline_id: config.pipelineId }))
    .filter((stage) => !stage.is_deleted && !toolStages.has(stage.id))
    .toSorted((a, b) => a.order_nr - b.order_nr)[0]
  if (!entryStage) {
    throw new Error(`Pipeline ${config.pipelineId} has no stage before "Link sent". Add one in Pipedrive, for example "Prospect".`)
  }

  const orgIds = await ensureByName(
    api,
    'organizations',
    'name',
    seed.organizations.map((org) => ({
      seedId: org.id,
      name: org.name,
      body: () => {
        const country = regionNames.of(org.countryCode) ?? org.countryCode
        const custom = { [config.orgFields.businessId]: org.businessId, [config.orgFields.nace]: org.nace }
        return {
          name: org.name,
          owner_id: orgOwner(org.id),
          ...(org.website === null ? {} : { website: org.website }),
          address: { value: country, country },
          custom_fields: Object.fromEntries(Object.entries(custom).filter(([, value]) => value !== null)),
        }
      },
    })),
  )

  const personIds = await ensureByName(
    api,
    'persons',
    'name',
    seed.persons.map((person) => ({
      seedId: person.id,
      name: person.name,
      body: () => ({
        name: person.name,
        org_id: mapped(orgIds, person.orgId, 'organization'),
        owner_id: orgOwner(person.orgId),
        ...(person.email === null ? {} : { emails: [{ value: person.email, primary: true, label: 'work' }] }),
        ...(person.phone === null ? {} : { phones: [{ value: person.phone, primary: true, label: 'work' }] }),
        ...(person.jobTitle === null
          ? {}
          : config.personFields.role === null
            ? { job_title: person.jobTitle }
            : { custom_fields: { [config.personFields.role]: person.jobTitle } }),
      }),
    })),
  )

  await ensureByName(
    api,
    'deals',
    'title',
    seed.deals.map((deal) => ({
      seedId: deal.id,
      name: deal.title,
      body: () => ({
        title: deal.title,
        owner_id: mapped(owners, deal.ownerId, 'owner'),
        person_id: mapped(personIds, deal.personId, 'person'),
        org_id: mapped(orgIds, deal.orgId, 'organization'),
        pipeline_id: config.pipelineId,
        stage_id: deal.stage === null ? entryStage.id : config.stages[deal.stage],
        status: deal.status,
      }),
    })),
  )

  const video = await writeVideoFields(api, config, env.adminBaseUrl)
  console.log(`  Video field: ${video.updated} deals updated, ${video.unchanged} unchanged`)
  console.log('Pipedrive seed done')
}

try {
  await main()
} catch (error) {
  console.error(`Pipedrive seed failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
