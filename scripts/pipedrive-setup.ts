import { writeFile } from 'node:fs/promises'
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

type FieldEntity = 'dealFields' | 'organizationFields' | 'personFields'
type FieldType = 'varchar' | 'double'

interface FieldSpec<K extends string> {
  key: K
  name: string
  type: FieldType
}

interface PdField {
  field_code: string
  field_name: string
  field_type: string
  is_custom_field: boolean
}

interface PdPipeline {
  id: number
  name: string
  order_nr: number
  is_deleted?: boolean
}

interface PdStage {
  id: number
  name: string
  is_deleted?: boolean
}

const COMPATIBLE_TYPES: Record<FieldType, string[]> = {
  varchar: ['varchar', 'varchar_auto', 'text'],
  double: ['double', 'int'],
}

const DEAL_FIELDS: FieldSpec<keyof PipedriveConfig['dealFields']>[] = [
  { key: 'video', name: 'Video', type: 'varchar' },
  { key: 'revenueRange', name: 'Revenue range', type: 'varchar' },
  { key: 'profitRange', name: 'Profit range', type: 'varchar' },
  { key: 'staffRange', name: 'Staff range', type: 'varchar' },
  { key: 'valuationRange', name: 'Valuation range', type: 'varchar' },
  { key: 'watchTimeS', name: 'Watch time s', type: 'double' },
  { key: 'stopSlide', name: 'Stop slide', type: 'double' },
  { key: 'replayCount', name: 'Replay count', type: 'double' },
  { key: 'watchPerSlide', name: 'Watch time per slide', type: 'varchar' },
  { key: 'linkChannel', name: 'Link channel', type: 'varchar' },
]

const ORG_FIELDS: FieldSpec<keyof PipedriveConfig['orgFields']>[] = [
  { key: 'businessId', name: 'Business ID', type: 'varchar' },
  { key: 'nace', name: 'NACE code', type: 'varchar' },
]

const STAGES: [keyof PipedriveConfig['stages'], string][] = [
  ['link_sent', 'Link sent'],
  ['opened', 'Opened'],
  ['form_sent', 'Form sent'],
  ['meeting_booked', 'Meeting booked'],
]

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

async function ensureFields<K extends string>(
  api: PipedriveApi,
  entity: FieldEntity,
  existing: PdField[],
  specs: FieldSpec<K>[],
  created: string[],
): Promise<Record<K, string>> {
  const keys = {} as Record<K, string>
  for (const spec of specs) {
    const match = existing.find((field) => field.is_custom_field && sameName(field.field_name, spec.name))
    if (match && !COMPATIBLE_TYPES[spec.type].includes(match.field_type)) {
      throw new Error(
        `The ${entity} field "${match.field_name}" has the type ${match.field_type}, not ${spec.type}. Rename or delete it in Pipedrive, then run the setup again.`,
      )
    }
    if (match) {
      keys[spec.key] = match.field_code
      continue
    }
    const field = await api.request<PdField>('POST', `/api/v2/${entity}`, { body: { field_name: spec.name, field_type: spec.type } })
    keys[spec.key] = field.field_code
    created.push(`${entity} "${spec.name}"`)
  }
  return keys
}

async function resolvePipeline(api: PipedriveApi, configured: string | null): Promise<PdPipeline> {
  const pipelines = (await api.list<PdPipeline>('/api/v2/pipelines')).filter((pipeline) => !pipeline.is_deleted)
  if (configured !== null) {
    const match = pipelines.find((pipeline) => pipeline.id === Number(configured))
    if (!match) {
      const known = pipelines.map((pipeline) => `${pipeline.id} (${pipeline.name})`).join(', ') || 'none'
      throw new Error(`PIPEDRIVE_PIPELINE_ID ${configured} is not a pipeline in this account. Pipelines: ${known}.`)
    }
    return match
  }
  const first = pipelines.toSorted((a, b) => a.order_nr - b.order_nr || a.id - b.id)[0]
  if (!first) throw new Error('The Pipedrive account has no pipeline. Create one in Pipedrive or set PIPEDRIVE_PIPELINE_ID.')
  return first
}

async function ensureStages(api: PipedriveApi, pipelineId: number, created: string[]): Promise<PipedriveConfig['stages']> {
  const existing = (await api.list<PdStage>('/api/v2/stages', { pipeline_id: pipelineId })).filter((stage) => !stage.is_deleted)
  const ids = {} as PipedriveConfig['stages']
  for (const [key, name] of STAGES) {
    const match = existing.find((stage) => sameName(stage.name, name))
    if (match) {
      ids[key] = match.id
      continue
    }
    ids[key] = (await api.request<PdStage>('POST', '/api/v2/stages', { body: { name, pipeline_id: pipelineId } })).id
    created.push(`stage "${name}"`)
  }
  return ids
}

async function main(): Promise<void> {
  const env = await loadScriptEnv()
  const baseUrl = baseUrlFor(required(env.pipedriveDomain, 'PIPEDRIVE_COMPANY_DOMAIN'))
  const api = createPipedriveApi(required(env.pipedriveToken, 'PIPEDRIVE_API_TOKEN'), baseUrl)
  const created: string[] = []

  const dealFields = await ensureFields(api, 'dealFields', await api.list<PdField>('/api/v2/dealFields'), DEAL_FIELDS, created)
  const orgFields = await ensureFields(api, 'organizationFields', await api.list<PdField>('/api/v2/organizationFields'), ORG_FIELDS, created)
  const personFields = await api.list<PdField>('/api/v2/personFields')
  const role = personFields.some((field) => field.field_code === 'job_title')
    ? null
    : (await ensureFields(api, 'personFields', personFields, [{ key: 'role', name: 'Role', type: 'varchar' }], created)).role
  const pipeline = await resolvePipeline(api, process.env.PIPEDRIVE_PIPELINE_ID?.trim() || null)
  const stages = await ensureStages(api, pipeline.id, created)

  const config: PipedriveConfig = { pipelineId: pipeline.id, stages, dealFields, orgFields, personFields: { role } }
  const configFile = path.join(env.configDir, 'pipedrive.json')
  await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  const video = await writeVideoFields(api, config, env.adminBaseUrl)

  console.log(`Pipedrive setup done for ${baseUrl}`)
  console.log(`  Pipeline: ${pipeline.name} (id ${pipeline.id})`)
  console.log(`  Stages: ${STAGES.map(([key, name]) => `${name} ${stages[key]}`).join(', ')}`)
  console.log(`  Created: ${created.length ? created.join(', ') : 'nothing, all fields and stages exist'}`)
  console.log(`  Person role: ${role === null ? 'built-in job title' : 'custom field "Role"'}`)
  console.log(`  Config: ${path.relative(env.repoRoot, configFile)}`)
  console.log(`  Video field: ${video.updated} deals updated, ${video.unchanged} unchanged (${env.adminBaseUrl}/deals/{id})`)
}

try {
  await main()
} catch (error) {
  console.error(`Pipedrive setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
