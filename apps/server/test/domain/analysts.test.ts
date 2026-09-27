import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  completeIntro,
  failIntro,
  failVoiceClone,
  listAnalysts,
  markAlertsSeen,
  markClonePending,
  readyIntro,
  setConsent,
  setVoiceId,
  setVoiceSample,
  startIntro,
  syncAnalysts,
  toAnalystDto,
  updateAnalyst,
  voiceIdFor,
} from '../../src/domain/analysts.ts'
import { brand, contactFor, mergeroConfig } from '../../src/domain/config.ts'
import { addDays, getDealByCode, isExpired, linkExpiresAt, listDeals, newLinkCode, setExpiry } from '../../src/domain/deals.ts'
import { DomainError } from '../../src/domain/errors.ts'
import { DEV_INTRO, DEV_VOICE_ID } from '../../src/dev-bypass.ts'
import { env } from '../../src/env.ts'
import type { PipedriveUser } from '../../src/providers/types.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, T0, insertAnalyst, insertDeal, later } from './fixtures.ts'

let t: TempDb

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

describe('analysts', () => {
  it('syncs Pipedrive users and keeps the local settings', async () => {
    const users: PipedriveUser[] = [
      { id: 1, name: 'Aino', email: 'aino@mergero.test', active: true, timeZone: 'Europe/Helsinki' },
      { id: 2, name: 'Jonas', email: null, active: true, timeZone: 'Europe/Berlin' },
      { id: 3, name: 'Gone', email: null, active: false, timeZone: null },
    ]
    const pipedrive = { listUsers: async () => users }
    expect((await syncAnalysts(t.db, pipedrive, { now: T0 })).map((row) => row.id)).toEqual([1, 2])
    updateAnalyst(t.db, 1, { defaultExpiryDays: 14, briefLanguage: 'fi', defaultSecondChannel: 'sms', timeZone: 'Europe/Stockholm' }, T0)
    users[0] = { id: 1, name: 'Aino Aaltonen', email: 'aino@mergero.test', active: true, timeZone: 'Europe/Helsinki' }
    const rows = await syncAnalysts(t.db, pipedrive, { now: later(1) })
    expect(rows[0]).toMatchObject({
      id: 1,
      name: 'Aino Aaltonen',
      defaultExpiryDays: 14,
      briefLanguage: 'fi',
      defaultSecondChannel: 'sms',
      timeZone: 'Europe/Stockholm',
      updatedAt: later(1).toISOString(),
    })
    expect(rows[1]?.updatedAt).toBe(T0.toISOString())
    expect(listAnalysts(t.db)).toHaveLength(2)
    expect(() => updateAnalyst(t.db, 99, {})).toThrow(DomainError)
  })

  it('keeps a local name after a Pipedrive sync', async () => {
    const users: PipedriveUser[] = [{ id: 1, name: 'Aino A', email: 'aino@mergero.test', active: true, timeZone: null }]
    const pipedrive = { listUsers: async () => users }
    await syncAnalysts(t.db, pipedrive, { now: T0 })
    updateAnalyst(t.db, 1, { name: 'Aino Aaltonen' }, T0)
    users[0] = { id: 1, name: 'Aino B', email: 'aino@example.test', active: true, timeZone: null }
    const [row] = await syncAnalysts(t.db, pipedrive, { now: later(1) })
    expect(row).toMatchObject({ name: 'Aino Aaltonen', email: 'aino@example.test' })
  })

  it('takes the time zone from Pipedrive and keeps a time zone that the analyst changed', async () => {
    const users: PipedriveUser[] = [
      { id: 1, name: 'Aino', email: null, active: true, timeZone: 'Europe/Helsinki' },
      { id: 2, name: 'Jonas', email: null, active: true, timeZone: 'Europe/Berlin' },
      { id: 3, name: 'Sofie', email: null, active: true, timeZone: null },
      { id: 4, name: 'Odd', email: null, active: true, timeZone: 'CEST' },
    ]
    const pipedrive = { listUsers: async () => users }
    const zones = async (now: Date) => (await syncAnalysts(t.db, pipedrive, { now })).map((row) => [row.id, row.timeZone])
    expect(await zones(T0)).toEqual([
      [1, 'Europe/Helsinki'],
      [2, 'Europe/Berlin'],
      [4, 'Europe/Helsinki'],
      [3, 'Europe/Helsinki'],
    ])
    updateAnalyst(t.db, 1, { timeZone: 'Europe/Stockholm' }, T0)
    users[0] = { ...users[0], timeZone: 'Europe/Oslo' } as PipedriveUser
    users[1] = { ...users[1], timeZone: 'Europe/Vienna' } as PipedriveUser
    users[2] = { ...users[2], timeZone: 'Europe/Copenhagen' } as PipedriveUser
    expect(await zones(later(1))).toEqual([
      [1, 'Europe/Stockholm'],
      [2, 'Europe/Vienna'],
      [4, 'Europe/Helsinki'],
      [3, 'Europe/Copenhagen'],
    ])
    users[1] = { ...users[1], timeZone: null } as PipedriveUser
    expect((await syncAnalysts(t.db, pipedrive, { now: later(2) })).find((row) => row.id === 2)).toMatchObject({
      timeZone: 'Europe/Vienna',
      updatedAt: later(1).toISOString(),
    })
  })

  it('processes an intro and ignores the result of a replaced recording', () => {
    insertAnalyst(t.db, { intros: {}, voiceId: null })
    const first = '2026-09-26T10:00:00.000Z'
    const second = '2026-09-26T10:05:00.000Z'
    startIntro(t.db, 10, 'de', { recordedAt: first, transcript: 'Guten Tag.' }, T0)
    startIntro(t.db, 10, 'de', { recordedAt: second, transcript: 'Hallo.' }, T0)
    expect(completeIntro(t.db, 10, 'de', first, { file: 'analysts/10/intro-de.mp4', durationS: 30 }, T0)).toBeNull()
    expect(failIntro(t.db, 10, 'de', first, T0)).toBeNull()
    const ready = completeIntro(t.db, 10, 'de', second, { file: 'analysts/10/intro-de.mp4', durationS: 28.5 }, T0)
    expect(ready?.intros.de).toEqual({ file: 'analysts/10/intro-de.mp4', durationS: 28.5, recordedAt: second, transcript: 'Hallo.', status: 'ready' })
    expect(readyIntro(ready ?? null, 'de')?.file).toBe('analysts/10/intro-de.mp4')
    expect(readyIntro(ready ?? null, 'fi')).toBeNull()
  })

  it('keeps the ready intro in use while a new recording processes or after it fails', () => {
    insertAnalyst(t.db, { intros: {}, voiceId: null })
    const first = '2026-09-26T10:00:00.000Z'
    const third = later(5).toISOString()
    startIntro(t.db, 10, 'de', { recordedAt: first, transcript: 'Guten Tag.' }, T0)
    completeIntro(t.db, 10, 'de', first, { file: 'analysts/10/intro-de.mp4', durationS: 28.5 }, T0)
    const ready = { file: 'analysts/10/intro-de.mp4', durationS: 28.5, recordedAt: first, transcript: 'Guten Tag.', status: 'ready' }

    const again = startIntro(t.db, 10, 'de', { recordedAt: third, transcript: 'Hallo.' }, later(5))
    expect(again.intros.de).toEqual({ ...ready, pending: { recordedAt: third, transcript: 'Hallo.', status: 'processing' } })
    expect(readyIntro(again, 'de')).toMatchObject({ file: 'analysts/10/intro-de.mp4', durationS: 28.5, transcript: 'Guten Tag.' })
    expect(toAnalystDto(again).intros[0]).toMatchObject({ status: 'ready', recordedAt: first, pending: { status: 'processing', recordedAt: third } })

    const failed = failIntro(t.db, 10, 'de', third, later(6))
    expect(failed?.intros.de).toEqual({ ...ready, pending: { recordedAt: third, transcript: 'Hallo.', status: 'failed' } })
    expect(readyIntro(failed ?? null, 'de')?.file).toBe('analysts/10/intro-de.mp4')
    expect(failIntro(t.db, 10, 'de', first, later(6))).toBeNull()

    startIntro(t.db, 10, 'de', { recordedAt: third, transcript: 'Hallo.' }, later(7))
    const replaced = completeIntro(t.db, 10, 'de', third, { file: 'analysts/10/intro-de.mp4', durationS: 20 }, later(8))
    expect(replaced?.intros.de).toEqual({ file: 'analysts/10/intro-de.mp4', durationS: 20, recordedAt: third, transcript: 'Hallo.', status: 'ready' })
  })

  it('keeps the voice state and builds the DTO with file URLs', () => {
    insertAnalyst(t.db, { voiceId: null })
    expect(setVoiceSample(t.db, 10, 'analysts/10/voice-sample.mp3', T0).cloneStatus).toBe('none')
    expect(markClonePending(t.db, 10, T0).cloneStatus).toBe('pending')
    expect(failVoiceClone(t.db, 10, T0)).toMatchObject({ cloneStatus: 'failed', voiceId: null })
    setVoiceId(t.db, 10, 'voice-1', T0)
    setConsent(t.db, 10, { date: '2026-09-20', file: 'analysts/10/consent.pdf' }, T0)
    const row = markAlertsSeen(t.db, 10, later(1))
    expect(row).toMatchObject({ voiceId: 'voice-1', cloneStatus: 'ready', consentDate: '2026-09-20', alertsSeenAt: later(1).toISOString() })
    const version = encodeURIComponent(later(1).toISOString())
    expect(toAnalystDto(row)).toEqual({
      id: 10,
      name: 'Aino Analyst',
      email: 'aino@mergero.test',
      timeZone: 'Europe/Helsinki',
      photoUrl: null,
      intros: [
        {
          language: 'fi',
          status: 'ready',
          recordedAt: '2026-09-20T09:00:00.000Z',
          durationS: 31.2,
          transcript: 'Hei, olen Aino Mergerosta.',
          url: `/api/analysts/10/files/intro-fi.mp4?v=${encodeURIComponent('2026-09-20T09:00:00.000Z')}`,
        },
      ],
      voice: {
        sampleUrl: `/api/analysts/10/files/voice-sample.mp3?v=${version}`,
        voiceId: 'voice-1',
        cloneStatus: 'ready',
        consentDate: '2026-09-20',
        consentUrl: `/api/analysts/10/files/consent.pdf?v=${version}`,
      },
      defaultExpiryDays: 30,
      defaultSecondChannel: 'linkedin',
      briefLanguage: 'en',
    })
    expect(setVoiceId(t.db, 10, null, T0)).toMatchObject({ voiceId: null, cloneStatus: 'none' })
  })
})

describe('dev bypass', () => {
  afterEach(() => {
    env.devBypass = false
  })

  it('gives an analyst without an intro or a voice clone the placeholder intro and the dev voice', () => {
    const analyst = insertAnalyst(t.db, { intros: {}, voiceId: null })
    expect(readyIntro(analyst, 'fi')).toBeNull()
    expect(voiceIdFor(analyst)).toBeNull()

    env.devBypass = true
    expect(readyIntro(analyst, 'fi')).toEqual(DEV_INTRO)
    expect(voiceIdFor(analyst)).toBe(DEV_VOICE_ID)
    expect(readyIntro(null, 'fi')).toBeNull()
  })

  it('keeps the own intro and voice clone of the analyst', () => {
    env.devBypass = true
    const analyst = insertAnalyst(t.db, {
      intros: { de: { file: 'analysts/10/intro-de.mp4', durationS: 9, recordedAt: '2026-09-01T00:00:00.000Z', transcript: 'Hallo.', status: 'ready' } },
      voiceId: 'voice-10',
    })
    expect(readyIntro(analyst, 'de')?.file).toBe('analysts/10/intro-de.mp4')
    expect(voiceIdFor(analyst)).toBe('voice-10')
  })
})

describe('deals', () => {
  it('makes 22 character link codes and finds a deal by its code', () => {
    const codes = new Set(Array.from({ length: 200 }, newLinkCode))
    expect(codes.size).toBe(200)
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/u)
    insertAnalyst(t.db)
    const deal = insertDeal(t.db)
    expect(getDealByCode(t.db, deal.linkCode)?.id).toBe(DEAL_ID)
    expect(getDealByCode(t.db, 'short')).toBeNull()
    expect(listDeals(t.db, { analystId: 10, country: 'fi', status: ['draft', 'review'] })).toHaveLength(1)
    expect(listDeals(t.db, { status: [] })).toEqual([])
  })

  it('computes the expiry', () => {
    expect(isExpired({ expiresAt: null, expiredAt: null }, T0)).toBe(false)
    expect(isExpired({ expiresAt: later(1).toISOString(), expiredAt: null }, T0)).toBe(false)
    expect(isExpired({ expiresAt: T0.toISOString(), expiredAt: null }, T0)).toBe(true)
    expect(isExpired({ expiresAt: later(99).toISOString(), expiredAt: T0.toISOString() }, T0)).toBe(true)
  })

  it('sets the expiry days and, after publication, the expiry time', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    expect(setExpiry(t.db, DEAL_ID, 7, T0)).toMatchObject({ expiryDays: 7, expiresAt: null })
    expect(() => setExpiry(t.db, DEAL_ID, 0, T0)).toThrow(DomainError)
    expect(() => setExpiry(t.db, DEAL_ID, 366, T0)).toThrow(DomainError)
    insertDeal(t.db, { id: 101, patch: { publishedVersion: 1, status: 'link_sent', expiresAt: later(10).toISOString() } })
    expect(setExpiry(t.db, 101, 60, T0).expiresAt).toBe(addDays(T0, 60).toISOString())
    expect(() => setExpiry(t.db, 101, 60, addDays(T0, 61))).toThrow('The link has expired')
  })

  it('keeps the link until 24 hours after the meeting end when the expiry is shortened', () => {
    insertAnalyst(t.db)
    const meetingAt = later(10).toISOString()
    insertDeal(t.db, {
      id: 102,
      patch: { publishedVersion: 1, status: 'meeting_booked', meetingAt, expiresAt: later(30).toISOString() },
    })
    const keepUntil = new Date(Date.parse(meetingAt) + (30 + 24 * 60) * 60_000).toISOString()
    expect(setExpiry(t.db, 102, 1, T0).expiresAt).toBe(keepUntil)
    expect(linkExpiresAt({ meetingAt }, T0, 60)).toBe(addDays(T0, 60).toISOString())
    expect(linkExpiresAt({ meetingAt: null }, T0, 1)).toBe(addDays(T0, 1).toISOString())
  })
})

describe('config', () => {
  it('reads the Mergero config and picks the office per country', () => {
    expect(mergeroConfig().company).toBe('Mergero')
    expect(contactFor('de')).toMatchObject({ company: 'Mergero', phone: '+41 79 558 4490', email: 'office@mergero.com' })
    expect(contactFor('CH').address).toContain('Zürich')
    expect(contactFor('US').address).toContain('Helsinki')
    expect(brand().primary).toMatch(/^#[0-9A-F]{6}$/u)
  })
})
