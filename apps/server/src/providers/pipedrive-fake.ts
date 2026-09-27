import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { STAGES, type Stage } from '@mergero/shared'
import { z } from 'zod'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { paths } from '../paths.ts'
import { ProviderError } from './errors.ts'
import type {
  PipedriveActivityInput,
  PipedriveChange,
  PipedriveChanges,
  PipedriveClient,
  PipedriveDeal,
  PipedriveDealFields,
  PipedriveOrg,
  PipedriveOrgPatch,
  PipedrivePerson,
  PipedrivePersonPatch,
  PipedriveUser,
} from './types.ts'

const nullableText = z.string().nullable().default(null)
const idRef = z.number().int().nullable().default(null)

const storeSchema = z.object({
  users: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      email: nullableText,
      active: z.boolean().default(true),
      timeZone: nullableText,
    }),
  ),
  organizations: z.array(
    z.object({ id: z.number().int(), name: z.string(), website: nullableText, countryCode: nullableText, businessId: nullableText, nace: nullableText }),
  ),
  persons: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      firstName: nullableText,
      jobTitle: nullableText,
      email: nullableText,
      phone: nullableText,
      orgId: idRef,
    }),
  ),
  deals: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      ownerId: z.number().int(),
      personId: idRef,
      orgId: idRef,
      stage: z.enum(STAGES).nullable().default(null),
      status: z.enum(['open', 'won', 'lost', 'deleted']).default('open'),
      videoUrl: nullableText,
      lostReason: nullableText,
      fields: z
        .object({
          revenueRange: z.string().nullable().optional(),
          profitRange: z.string().nullable().optional(),
          staffRange: z.string().nullable().optional(),
          valuationRange: z.string().nullable().optional(),
          watchTimeS: z.number().nullable().optional(),
          stopSlide: z.number().nullable().optional(),
          replayCount: z.number().nullable().optional(),
          watchPerSlide: z.string().nullable().optional(),
          linkChannel: z.string().nullable().optional(),
        })
        .default({}),
    }),
  ),
  activities: z
    .array(
      z.object({
        id: z.number().int(),
        dealId: z.number().int(),
        ownerId: z.number().int(),
        type: z.string(),
        subject: z.string(),
        note: nullableText,
        dueDate: z.string(),
        done: z.boolean().default(false),
        addTime: z.string(),
        doneTime: nullableText,
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        id: z.number().int(),
        dealId: z.number().int(),
        content: z.string(),
        addTime: z.string(),
        updateTime: z.string(),
      }),
    )
    .default([]),
})

type Store = z.infer<typeof storeSchema>
type StoredDeal = Store['deals'][number]

export interface FakePipedriveOptions {
  file?: string
  seedFile?: string
}

export class FakePipedriveClient implements PipedriveClient {
  readonly mode = 'fake' as const
  readonly #file: string
  readonly #seedFile: string
  #queue: Promise<unknown> = Promise.resolve()
  #seen: Map<string, string> | null = null

  constructor(options: FakePipedriveOptions = {}) {
    this.#file = options.file ?? paths.fakePipedrive
    this.#seedFile = options.seedFile ?? path.join(env.seedDir, 'pipedrive.json')
  }

  async listUsers(): Promise<PipedriveUser[]> {
    return (await this.#read()).users
  }

  async getDeal(id: number): Promise<PipedriveDeal | null> {
    const deal = (await this.#read()).deals.find((item) => item.id === id)
    return deal ? toDeal(deal) : null
  }

  async getPerson(id: number): Promise<PipedrivePerson | null> {
    const person = (await this.#read()).persons.find((item) => item.id === id)
    if (!person) return null
    const { orgId: _orgId, ...rest } = person
    return rest
  }

  async getOrg(id: number): Promise<PipedriveOrg | null> {
    return (await this.#read()).organizations.find((item) => item.id === id) ?? null
  }

  async listOpenDeals(): Promise<PipedriveDeal[]> {
    const store = await this.#read()
    return store.deals.filter((deal) => deal.status === 'open').map(toDeal)
  }

  // The store has no update times, so a change is a difference to the store at the last call.
  async listChanges(since: string): Promise<PipedriveChanges> {
    const store = await this.#read()
    const items: [PipedriveChange, unknown][] = [
      ...store.deals.map((deal): [PipedriveChange, unknown] => [
        { type: 'deal', id: deal.id, updatedAt: null, deal: { ...toDeal(deal), lostReason: deal.lostReason } },
        deal,
      ]),
      ...store.persons.map((person): [PipedriveChange, unknown] => [{ type: 'person', id: person.id, updatedAt: null, deal: null }, person]),
      ...store.organizations.map((org): [PipedriveChange, unknown] => [{ type: 'organization', id: org.id, updatedAt: null, deal: null }, org]),
    ]
    const seen = new Map(items.map(([change, item]) => [`${change.type}:${change.id}`, JSON.stringify(item)]))
    const previous = this.#seen
    this.#seen = seen
    const changes = previous === null ? [] : items.map(([change]) => change).filter((change) => previous.get(`${change.type}:${change.id}`) !== seen.get(`${change.type}:${change.id}`))
    return { changes, cursor: since, budget: null }
  }

  async updateOrg(id: number, patch: PipedriveOrgPatch): Promise<void> {
    await this.#mutate('update organization', { orgId: id }, (store) => {
      const org = store.organizations.find((item) => item.id === id)
      if (!org) throw notFound(`organization ${id}`)
      Object.assign(org, definedOnly(patch))
    })
  }

  async updatePerson(id: number, patch: PipedrivePersonPatch): Promise<void> {
    await this.#mutate('update person', { personId: id }, (store) => {
      const person = store.persons.find((item) => item.id === id)
      if (!person) throw notFound(`person ${id}`)
      Object.assign(person, definedOnly(patch))
    })
  }

  async setVideoField(dealId: number, url: string): Promise<void> {
    await this.#mutate('set video field', { dealId, url }, (store) => {
      findDeal(store, dealId).videoUrl = url
    })
  }

  async moveStage(dealId: number, stage: Stage): Promise<void> {
    await this.#mutate('move stage', { dealId, stage }, (store) => {
      findDeal(store, dealId).stage = stage
    })
  }

  async setLost(dealId: number, reason: string): Promise<void> {
    await this.#mutate('set lost', { dealId, reason }, (store) => {
      const deal = findDeal(store, dealId)
      deal.status = 'lost'
      deal.lostReason = reason.trim() || null
    })
  }

  async setDealFields(dealId: number, fields: PipedriveDealFields): Promise<void> {
    const changed = definedOnly(fields)
    if (Object.keys(changed).length === 0) return
    await this.#mutate('set deal fields', { dealId, fields: changed }, (store) => {
      const deal = findDeal(store, dealId)
      deal.fields = { ...deal.fields, ...changed }
    })
  }

  async addActivity(input: PipedriveActivityInput): Promise<number> {
    return this.#mutate('add activity', { dealId: input.dealId, type: input.type, subject: input.subject }, (store) => {
      findDeal(store, input.dealId)
      const id = nextId(store.activities)
      store.activities.push({ id, ...input, done: false, addTime: new Date().toISOString(), doneTime: null })
      return id
    })
  }

  async markActivityDone(activityId: number): Promise<void> {
    await this.#mutate('mark activity done', { activityId }, (store) => {
      const activity = store.activities.find((item) => item.id === activityId)
      if (!activity) throw notFound(`activity ${activityId}`)
      activity.done = true
      activity.doneTime ??= new Date().toISOString()
    })
  }

  async upsertNote(dealId: number, noteId: number | null, html: string): Promise<number> {
    return this.#mutate('upsert note', { dealId, noteId }, (store) => {
      findDeal(store, dealId)
      const now = new Date().toISOString()
      const note = noteId === null ? undefined : store.notes.find((item) => item.id === noteId)
      if (note) {
        note.content = html
        note.updateTime = now
        return note.id
      }
      const id = nextId(store.notes)
      store.notes.push({ id, dealId, content: html, addTime: now, updateTime: now })
      return id
    })
  }

  dealUrl(dealId: number): string {
    return `https://fake-pipedrive.invalid/deal/${dealId}`
  }

  async #read(): Promise<Store> {
    let raw: string
    try {
      raw = await readFile(this.#file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await this.#createFromSeed()
      raw = await readFile(this.#file, 'utf8')
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      throw new Error(`${this.#file} is not valid JSON`)
    }
    const parsed = storeSchema.safeParse(json)
    if (!parsed.success) throw new Error(`${this.#file} does not match the fake Pipedrive shape:\n${z.prettifyError(parsed.error)}`)
    return parsed.data
  }

  async #createFromSeed(): Promise<void> {
    let seed: string
    try {
      seed = await readFile(this.#seedFile, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Fake Pipedrive needs ${this.#seedFile} to create ${this.#file}, but the seed file is missing`)
      }
      throw error
    }
    await mkdir(path.dirname(this.#file), { recursive: true })
    const tmp = this.#tmpPath()
    await writeFile(tmp, seed)
    try {
      await link(tmp, this.#file)
      log.info('fake pipedrive store created from seed', { file: this.#file, seed: this.#seedFile })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    } finally {
      await rm(tmp, { force: true })
    }
  }

  #mutate<T>(op: string, fields: Record<string, unknown>, change: (store: Store) => T): Promise<T> {
    const run = async () => {
      const store = await this.#read()
      const result = change(store)
      const tmp = this.#tmpPath()
      try {
        await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`)
        await rename(tmp, this.#file)
      } catch (error) {
        await rm(tmp, { force: true })
        throw error
      }
      log.info('fake pipedrive write', { op, ...fields })
      return result
    }
    const next = this.#queue.then(run, run)
    this.#queue = next.catch(() => undefined)
    return next
  }

  #tmpPath(): string {
    return `${this.#file}.${process.pid}.${randomUUID()}.tmp`
  }
}

function toDeal(deal: StoredDeal): PipedriveDeal {
  return {
    id: deal.id,
    title: deal.title,
    ownerId: deal.ownerId,
    personId: deal.personId,
    orgId: deal.orgId,
    stageId: deal.stage ? STAGES.indexOf(deal.stage) + 1 : null,
    status: deal.status,
    videoUrl: deal.videoUrl,
  }
}

function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>
}

function findDeal(store: Store, dealId: number): StoredDeal {
  const deal = store.deals.find((item) => item.id === dealId)
  if (!deal) throw notFound(`deal ${dealId}`)
  return deal
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function notFound(what: string): ProviderError {
  return new ProviderError(`Fake Pipedrive: ${what} not found`, {
    provider: 'pipedrive',
    status: 404,
    code: 'http_404',
    retryable: false,
  })
}
