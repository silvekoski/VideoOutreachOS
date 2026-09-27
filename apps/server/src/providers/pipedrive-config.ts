import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { env } from '../env.ts'
import type { PipedriveConfig } from './types.ts'

const id = z.number().int().positive()
const key = z.string().min(1)

const configSchema: z.ZodType<PipedriveConfig> = z.object({
  pipelineId: id,
  stages: z.object({ link_sent: id, opened: id, form_sent: id, meeting_booked: id }),
  dealFields: z.object({
    video: key,
    revenueRange: key,
    profitRange: key,
    staffRange: key,
    valuationRange: key,
    watchTimeS: key,
    stopSlide: key,
    replayCount: key,
    watchPerSlide: key,
    linkChannel: key,
  }),
  orgFields: z.object({ businessId: key, nace: key }),
  personFields: z.object({ role: key.nullable() }),
})

export function loadPipedriveConfig(file = path.join(env.configDir, 'pipedrive.json')): PipedriveConfig {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `${file} is missing. Real Pipedrive mode needs it: run "pnpm setup:pipedrive" with PIPEDRIVE_API_TOKEN and PIPEDRIVE_COMPANY_DOMAIN set.`,
      )
    }
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${file} is not valid JSON`)
  }
  const parsed = configSchema.safeParse(json)
  if (!parsed.success) throw new Error(`${file} does not match PipedriveConfig:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}
