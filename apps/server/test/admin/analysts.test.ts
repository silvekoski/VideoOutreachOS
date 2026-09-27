import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import type { AnalystDto, ApiError } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { sql } = await import('../../src/db/index.ts')
const { env } = await import('../../src/env.ts')
const { paths } = await import('../../src/paths.ts')
const { getJob } = await import('../../src/queue/index.ts')
const { T0 } = await import('../domain/fixtures.ts')
const { createHarness, jsonBody } = await import('./harness.ts')

const MB = 1024 * 1024
const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 7)])
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

function wav(seconds = 0.5, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate)
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function multipart(file: Buffer | null, fields: Record<string, string> = {}, name = 'upload.bin'): RequestInit {
  const form = new FormData()
  if (file) form.append('file', new File([new Uint8Array(file)], name))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return { method: 'POST', body: form }
}

function jobsOfType(h: Harness, type: string): { id: number; idempotency_key: string; payload: string }[] {
  return sql<{ id: number; idempotency_key: string; payload: string }>(
    h.db,
    'SELECT id, idempotency_key, payload FROM jobs WHERE type = ? ORDER BY id',
  ).all(type)
}

let h: Harness

beforeEach(async () => {
  h = createHarness()
  const listed = await h.json<AnalystDto[]>('/api/analysts')
  expect(listed.status).toBe(200)
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

describe('GET and PATCH /api/analysts', () => {
  it('syncs the analysts from Pipedrive when the table is empty', async () => {
    const { body } = await h.json<AnalystDto[]>('/api/analysts')
    expect(body.map((analyst) => analyst.name)).toEqual(['Jonas Weber', 'Linnea Aaltonen', 'Sofie Lund'])
    expect(body[1]).toMatchObject({
      id: 1001,
      intros: [],
      voice: { sampleUrl: null, voiceId: null, cloneStatus: 'none', consentDate: null, consentUrl: null },
      defaultExpiryDays: 30,
      defaultSecondChannel: 'linkedin',
      briefLanguage: 'en',
    })
  })

  it('updates the profile settings', async () => {
    const { status, body } = await h.json<AnalystDto>(
      '/api/analysts/1001',
      jsonBody('PATCH', { defaultExpiryDays: 14, briefLanguage: 'fi', timeZone: 'Europe/Stockholm', defaultSecondChannel: 'sms' }),
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ defaultExpiryDays: 14, briefLanguage: 'fi', timeZone: 'Europe/Stockholm', defaultSecondChannel: 'sms' })
  })

  it('rejects a bad patch, a bad body and an unknown analyst', async () => {
    const zone = await h.json<ApiError>('/api/analysts/1001', jsonBody('PATCH', { timeZone: 'EET' }))
    expect(zone.status).toBe(400)
    expect(zone.body.error).toMatch(/timeZone/u)
    expect((await h.request('/api/analysts/1001', jsonBody('PATCH', { defaultExpiryDays: 0 }))).status).toBe(400)
    const text = await h.json<ApiError>('/api/analysts/1001', { method: 'PATCH', body: 'not json' })
    expect(text).toEqual({ status: 400, body: { error: 'The request body must be JSON' } })
    expect((await h.request('/api/analysts/9', jsonBody('PATCH', {}))).status).toBe(404)
    expect((await h.request('/api/analysts/abc', jsonBody('PATCH', {}))).status).toBe(400)
  })
})

describe('POST /api/analysts/:id/intros/:lang', () => {
  it('saves the upload, marks the intro processing and queues the intro job', async () => {
    const { status, body } = await h.json<AnalystDto>(
      '/api/analysts/1001/intros/fi',
      multipart(MP4_HEAD, { transcript: '  Hei, olen Linnea Mergerosta.  ' }, 'intro.mov'),
    )
    expect(status).toBe(200)
    expect(body.intros).toEqual([
      { language: 'fi', status: 'processing', recordedAt: T0.toISOString(), durationS: null, transcript: 'Hei, olen Linnea Mergerosta.', url: null },
    ])
    const [row] = jobsOfType(h, 'audio')
    expect(row?.idempotency_key).toBe(`audio-intro:1001:fi:${T0.toISOString()}`)
    const job = getJob(h.db, row?.id ?? 0)
    expect(job?.analystId).toBe(1001)
    const payload = job?.type === 'audio' && job.payload.kind === 'intro' ? job.payload : null
    expect(payload?.uploadFile).toMatch(/^cache\/uploads\/intro-1001-fi-[0-9a-f-]{36}\.mp4$/u)
    expect(readFileSync(path.join(paths.root, payload?.uploadFile ?? ''))).toEqual(MP4_HEAD)
  })

  it('rejects a bad language, a file that is not a video, a missing file and a JSON body', async () => {
    expect((await h.json<ApiError>('/api/analysts/1001/intros/xx', multipart(MP4_HEAD))).status).toBe(400)
    expect(await h.json<ApiError>('/api/analysts/1001/intros/fi', multipart(PDF))).toEqual({
      status: 400,
      body: { error: 'The file is not a video' },
    })
    expect((await h.json<ApiError>('/api/analysts/1001/intros/fi', multipart(null, { transcript: 'x' }))).status).toBe(400)
    const noTranscript = {
      status: 400,
      body: { error: 'The transcript is required. Write the text that you say in the intro, for the captions of the video.' },
    }
    expect(await h.json<ApiError>('/api/analysts/1001/intros/fi', multipart(MP4_HEAD))).toEqual(noTranscript)
    expect(await h.json<ApiError>('/api/analysts/1001/intros/fi', multipart(MP4_HEAD, { transcript: '   ' }))).toEqual(noTranscript)
    expect((await h.request('/api/analysts/1001/intros/fi', jsonBody('POST', {}))).status).toBe(400)
    expect((await h.request('/api/analysts/7/intros/fi', multipart(MP4_HEAD))).status).toBe(404)
    expect(jobsOfType(h, 'audio')).toEqual([])
  })

  it('refuses a body above 200 MB before it reads it', async () => {
    const response = await h.request('/api/analysts/1001/intros/fi', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(202 * MB) },
      body: 'x',
    })
    expect(response.status).toBe(413)
    expect(((await response.json()) as ApiError).error).toMatch(/200 MB/u)
  })
})

describe('voice sample and consent', () => {
  it('transcodes the voice sample and queues the clone only after the consent', async () => {
    const voice = await h.json<AnalystDto>('/api/analysts/1001/voice', multipart(wav(), {}, 'sample.wav'))
    expect(voice.status).toBe(200)
    expect(voice.body.voice.cloneStatus).toBe('none')
    expect(voice.body.voice.sampleUrl).toMatch(/^\/api\/analysts\/1001\/files\/voice-sample\.mp3\?v=/u)
    expect(readFileSync(paths.voiceSample(1001)).subarray(0, 3).toString('latin1')).toMatch(/^(ID3|\xff)/u)
    expect(jobsOfType(h, 'audio')).toEqual([])

    const consent = await h.json<AnalystDto>('/api/analysts/1001/consent', multipart(PDF, { date: '2026-09-20' }, 'consent.pdf'))
    expect(consent.status).toBe(200)
    expect(consent.body.voice).toMatchObject({ consentDate: '2026-09-20', cloneStatus: 'pending' })
    expect(consent.body.voice.consentUrl).toMatch(/^\/api\/analysts\/1001\/files\/consent\.pdf\?v=/u)
    expect(readFileSync(paths.consent(1001))).toEqual(PDF)
    const sampleAt = statSync(paths.voiceSample(1001)).mtime.toISOString()
    expect(jobsOfType(h, 'audio').map((job) => job.idempotency_key)).toEqual([`audio-clone:1001:${sampleAt}`])

    const again = await h.json<AnalystDto>('/api/analysts/1001/consent', multipart(PDF, { date: '2026-09-21' }))
    expect(again.status).toBe(200)
    expect(jobsOfType(h, 'audio')).toHaveLength(1)

    const file = await h.request('/api/analysts/1001/files/consent.pdf')
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('application/pdf')
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PDF)
  })

  it('queues the clone at once when the consent exists, and a new sample queues a new clone', async () => {
    expect((await h.request('/api/analysts/1002/consent', multipart(PDF, { date: '2026-09-26' }))).status).toBe(200)
    const voice = await h.json<AnalystDto>('/api/analysts/1002/voice', multipart(wav()))
    expect(voice.status).toBe(200)
    expect(voice.body.voice.cloneStatus).toBe('pending')
    expect(jobsOfType(h, 'audio')).toHaveLength(1)
    sql(h.db, `UPDATE jobs SET status = 'done'`).run()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await h.request('/api/analysts/1002/voice', multipart(wav(0.6)))).status).toBe(200)
    const keys = jobsOfType(h, 'audio').map((job) => job.idempotency_key)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
    expect(keys.every((key) => key.startsWith('audio-clone:1002:'))).toBe(true)
  })

  it('rejects audio that ffmpeg cannot read and keeps no raw upload', async () => {
    const broken = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200, 1)])
    const response = await h.json<ApiError>('/api/analysts/1001/voice', multipart(broken))
    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/could not be read/u)
    expect(existsSync(paths.voiceSample(1001))).toBe(false)
    expect(existsSync(paths.uploadsDir) ? readdirSync(paths.uploadsDir) : []).toEqual([])
    expect((await h.request('/api/analysts/1001/voice', multipart(MP4_HEAD.subarray(0, 4)))).status).toBe(400)
  })

  it('returns 500 without details when ffmpeg itself cannot run', async () => {
    const ffmpegPath = env.ffmpegPath
    env.ffmpegPath = path.join(paths.root, 'missing-ffmpeg')
    try {
      const response = await h.json<ApiError>('/api/analysts/1001/voice', multipart(wav()))
      expect(response).toEqual({ status: 500, body: { error: 'The server could not complete the request. Check the server log.' } })
    } finally {
      env.ffmpegPath = ffmpegPath
    }
    expect(existsSync(paths.voiceSample(1001))).toBe(false)
    expect(readdirSync(paths.uploadsDir)).toEqual([])
  })

  it('sets and clears the voice ID by hand', async () => {
    const set = await h.json<AnalystDto>('/api/analysts/1001/voice-id', jsonBody('PUT', { voiceId: ' 21m00Tcm4TlvDq8ikWAM ' }))
    expect(set).toMatchObject({ status: 200, body: { voice: { voiceId: '21m00Tcm4TlvDq8ikWAM', cloneStatus: 'ready' } } })
    const cleared = await h.json<AnalystDto>('/api/analysts/1001/voice-id', jsonBody('PUT', { voiceId: null }))
    expect(cleared).toMatchObject({ status: 200, body: { voice: { voiceId: null, cloneStatus: 'none' } } })
    expect((await h.request('/api/analysts/1001/voice-id', jsonBody('PUT', { voiceId: 'no spaces/here' }))).status).toBe(400)
    expect((await h.request('/api/analysts/1001/voice-id', jsonBody('PUT', {}))).status).toBe(400)
    expect((await h.request('/api/analysts/9/voice-id', jsonBody('PUT', { voiceId: 'v1' }))).status).toBe(404)
  })

  it('checks the consent date and the file type', async () => {
    const future = await h.json<ApiError>('/api/analysts/1001/consent', multipart(PDF, { date: '2026-09-28' }))
    expect(future).toEqual({ status: 400, body: { error: 'The consent date must not be in the future' } })
    expect((await h.request('/api/analysts/1001/consent', multipart(PDF, { date: '2026-02-30' }))).status).toBe(400)
    expect((await h.request('/api/analysts/1001/consent', multipart(PDF))).status).toBe(400)
    const notPdf = await h.json<ApiError>('/api/analysts/1001/consent', multipart(MP4_HEAD, { date: '2026-09-20' }))
    expect(notPdf.body.error).toBe('The file is not a PDF file')
    expect(existsSync(paths.consent(1001))).toBe(false)
  })
})
