import { removeStorage } from './storage-env.ts'
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { formatMoney } from '@mergero/shared'
import type { MgxBuyer, MgxClosedDeal, SlideSegment, Timeline } from '@mergero/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDeal, requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { advance, applyReviewPatch, approveDeal, publish, remakeDeal } from '../../src/domain/pipeline.ts'
import { createVersion, getTimeline, markRenderStatus, setApproval, updateVersion } from '../../src/domain/timelines.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { paths } from '../../src/paths.ts'
import { calculatorFor } from '../../src/video/valuation.ts'
import { ModelError } from '../../src/providers/featherless.ts'
import { claimNext, completeJob, enqueue, jobKeys, jobsForDeal } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SCRAPE_FAILED, SCRAPE_OK, T0, insertAnalyst, insertDeal, makeTimeline, snapshot } from '../domain/fixtures.ts'
import { ScriptedModel, makeContext, startLogoServer } from './helpers.ts'
import type { LogoServer, TestContext } from './helpers.ts'

const MARKDOWN = [
  '# Acme Oy',
  'Acme Oy valmistaa teräsosia ja hitsattuja rakenteita laivanrakennukseen Turussa.',
  'Yrityksen ammattilaiset hoitavat koneistuksen, hitsauksen ja kokoonpanon omassa tehtaassaan.',
  'Asiakkaat ovat suomalaisia ja ruotsalaisia telakoita sekä koneiden valmistajia.',
  'Yritys on toiminut samassa paikassa jo kolmen sukupolven ajan ja kasvaa edelleen.',
].join('\n\n')

let logos: LogoServer
let t: TempDb
let ctx: TestContext

beforeAll(async () => {
  logos = await startLogoServer()
})

afterAll(async () => {
  await logos.close()
  removeStorage()
})

beforeEach(() => {
  t = tempDb()
  ctx = makeContext(t.db, { now: T0 })
  insertAnalyst(t.db)
  insertDeal(t.db, { patch: { scrape: { ...SCRAPE_OK, markdown: MARKDOWN } } })
})

afterEach(() => t.close())

function buyer(id: string, overrides: Partial<MgxBuyer> = {}): MgxBuyer {
  return {
    id,
    name: `Buyer ${id.toUpperCase()}`,
    logoUrl: `${logos.url}/${id}.svg`,
    website: `https://${id}.example`,
    focus: `Buys machining workshops like ${id}`,
    namePublic: true,
    ...overrides,
  }
}

function closedDeal(id: string, text: string, nace = '25.62'): MgxClosedDeal {
  return { id, year: 2025, country: 'FI', nace, text, profitMultiple: 4 + id.length }
}

function slide(timeline: Timeline, n: number): SlideSegment {
  const segment = timeline.segments.find((item) => item.slide === n)
  if (!segment || segment.template === 'facecam') throw new Error(`No slide ${n}`)
  return segment
}

async function runWriteScript(): Promise<void> {
  const job = claimNext(t.db, ctx.now())
  if (job?.type !== 'write-script') throw new Error(`Expected a write-script job, got ${job?.type}`)
  await runJob(ctx, job)
}

describe('write-script job, version 1', () => {
  beforeEach(() => {
    ctx.stub.financials.records.set('1234567-8', { businessId: '1234567-8', revenue: 7_450_000, profit: 980_000, fiscalYear: 2025 })
    ctx.stub.mgx.featured = [
      ...['f1', 'f2', 'f3', 'f4'].map((id) => buyer(id)),
      buyer('f5', { namePublic: false }),
      buyer('f6', { name: 'A buyer with a name that is far too long for the tile on slide two' }),
      ...['f7', 'f8', 'f9'].map((id) => buyer(id)),
    ]
    ctx.stub.mgx.buyers = [
      buyer('b1'),
      buyer('missing', { name: 'Buyer Without Logo' }),
      buyer('b3', { namePublic: false }),
      buyer('b4', { logoUrl: `${logos.url}/b4.html` }),
      buyer('b5'),
    ]
    ctx.stub.mgx.recentDeals = ['r1', 'r2', 'r3', 'r4'].map((id) => closedDeal(id, `A workshop ${id} was sold to a Nordic group.`, '28.12'))
    ctx.stub.mgx.sectorDeals = [
      closedDeal('s1', 'A Finnish machining company with 40 staff found a strategic buyer in eight months.'),
      closedDeal('s2', `${'A very long deal text. '.repeat(10)}`),
      closedDeal('s3', 'A Swedish subcontractor was sold to an owner-led industrial group.'),
    ]
    updateDeal(t.db, DEAL_ID, { removedBuyers: ['b5'] }, T0)
    advance(t.db, DEAL_ID, T0)
  })

  it('collects the data, builds the five segments and hands over to the audio step', async () => {
    await runWriteScript()

    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal.financials).toEqual({ source: 'asiakastieto', revenue: 7_450_000, profit: 980_000, fiscalYear: 2025 })
    expect(deal.mgx?.buyers.map((item) => item.id)).toEqual(['b1', 'missing', 'b4', 'b5'])
    expect(deal.mgx?.multiples).toEqual([6, 6, 6])
    expect(deal.language).toBe('fi')
    expect(ctx.stub.mgx.calls).toContainEqual({ tool: 'search_buyers', input: { nace: '25.62', country: 'FI' } })

    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(timeline).toMatchObject({ dealId: DEAL_ID, version: 1, language: 'fi', fps: 30, width: 1920, height: 1080, pauseS: 0.4 })
    expect(timeline.segments.map((segment) => segment.template)).toEqual([
      'facecam', 'your-company', 'your-figures', 'privacy', 'book-meeting',
    ])
    expect(timeline.segments[0]).toMatchObject({
      durationS: 31.2,
      variables: { videoFile: 'analysts/10/intro-fi.mp4', analystName: 'Aino Analyst', transcript: 'Hei, olen Aino Mergerosta.' },
    })

    expect(timeline.segments.map((segment) => ('slide' in segment ? segment.slide : 1))).toEqual([1, 3, 4, 7, 8])

    const company = slide(timeline, 3)
    if (company.variables.template !== 'your-company') throw new Error('slide 3 template')
    expect(company.variables.lines).toHaveLength(3)
    expect(company.variables).toMatchObject({ company: 'Acme Oy', linesSource: 'model', screenshotFile: 'deals/100/screenshot.png' })

    const figures = slide(timeline, 4)
    expect(figures.variables).toEqual({
      template: 'your-figures',
      mode: 'figures',
      revenue: 7_450_000,
      profit: 980_000,
      revenueText: formatMoney(7_450_000, 'fi'),
      profitText: formatMoney(980_000, 'fi'),
      fiscalYear: 2025,
    })
    expect(figures.labels['fiscal-year']).toContain('2025')

    for (const segment of timeline.segments.slice(1) as SlideSegment[]) {
      expect(segment.script.length).toBeGreaterThan(0)
      expect(segment.scriptSource).toBe('fallback')
      expect(segment.audio).toEqual({ file: null, durationS: null, status: 'missing', error: null })
      expect(Object.values(segment.labels).join(' ')).not.toMatch(/\{\w+\}/u)
    }
    expect(requireDeal(t.db, DEAL_ID).reviewReasons).toEqual([])
    expect(jobsForDeal(t.db, DEAL_ID, ['audio'])).toHaveLength(1)
  })

  it('asks the model once more after a rejection and marks the slide for review after a second failure', async () => {
    const model = new ScriptedModel()
    ctx.providers.model = model
    model.answers.push(
      (request) => ({ texts: (JSON.parse(request.user) as { texts: { id: string; text: string }[] }).texts }),
      () => ({ lines: ['Liian lyhyt.'] }),
      () => {
        throw new ModelError('Kimi-K3 output for company-lines contains no JSON value', { code: 'no_json', retryable: false })
      },
      () => ({ script: 'Liian lyhyt teksti.' }),
      () => ({ script: 'Edelleen liian lyhyt teksti.' }),
    )

    await runWriteScript()

    expect(model.requests.map((request) => request.schemaName)).toEqual([
      'translate-texts', 'company-lines', 'company-lines', 'slide-script', 'slide-script', 'slide-script', 'slide-script', 'slide-script',
    ])
    expect(model.requests[2]?.system).toContain('Your previous answer was rejected')
    expect(model.requests[4]?.system).toContain('script has 3 words, expected 30 to 60')
    expect(JSON.parse(model.requests[3]?.user ?? '{}')).toMatchObject({ task: 'slide-script', slide: 3, context: { lang: 'fi', company: 'Acme Oy' } })
    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 3).variables).toMatchObject({ lines: [], linesSource: null })
    expect(slide(timeline, 3)).toMatchObject({ script: '', scriptSource: null })
    expect(slide(timeline, 4).script).not.toBe('')
    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal.status).toBe('review')
    expect(deal.reviewReasons.filter((reason) => reason.code === 'model_failed')).toEqual([
      expect.objectContaining({ slide: 3, slot: 'your-company.line' }),
      expect.objectContaining({ slide: 3 }),
    ])
    expect(jobsForDeal(t.db, DEAL_ID, ['audio'])).toEqual([])
  })
})

describe('write-script job, language and figures', () => {
  function inSwitzerland(): void {
    updateDeal(
      t.db,
      DEAL_ID,
      {
        country: 'CH',
        snapshot: { ...snapshot(), country: 'CH', businessId: null, linkedinLanguages: [] },
        scrape: { ...SCRAPE_OK, siteLanguage: 'de', markdown: MARKDOWN },
      },
      T0,
    )
    advance(t.db, DEAL_ID, T0)
  }

  it('uses the site language and asks for the figures with the calculator in DACH', async () => {
    inSwitzerland()
    ctx.stub.mgx.sectorDeals = ['s1', 's2', 's3'].map((id) => closedDeal(id, `Ein Zulieferer ${id} wurde an eine Industriegruppe verkauft.`))

    await runWriteScript()

    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal).toMatchObject({ language: 'de', pageLanguage: 'de', financials: { source: 'ask_in_form' } })
    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(timeline.language).toBe('de')
    expect(slide(timeline, 4).variables).toEqual({ template: 'your-figures', mode: 'ask', calculator: true })
    expect(slide(timeline, 4).labels['fiscal-year']).toBeUndefined()
    expect(deal.reviewReasons.map((reason) => reason.code)).not.toContain('no_intro')

    updateDeal(t.db, DEAL_ID, { snapshot: { ...requireDeal(t.db, DEAL_ID).snapshot, nace: '33.12' } }, T0)
    expect(calculatorFor(requireDeal(t.db, DEAL_ID))).toMatchObject({ dealCount: 3 })
  })

  it('does not promise the calculator range in DACH with fewer than three sector deals', async () => {
    inSwitzerland()
    ctx.stub.mgx.sectorDeals = ['s1', 's2'].map((id) => closedDeal(id, `Ein Zulieferer ${id} wurde an eine Industriegruppe verkauft.`))

    await runWriteScript()

    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 4).variables).toEqual({ template: 'your-figures', mode: 'ask', calculator: false })
    expect(slide(timeline, 4).script).not.toContain('Rechner')
  })
})

describe('write-script job, making the video again', () => {
  it('builds a new version from the new Pipedrive data and keeps the text of the analyst for a check', async () => {
    ctx.stub.mgx.buyers = [buyer('b1'), buyer('b2')]
    ctx.stub.mgx.sectorDeals = ['s1', 's2', 's3'].map((id) => closedDeal(id, `A workshop ${id} was sold to a group.`, '28.12'))
    ctx.stub.financials.records.set('7654321-0', { businessId: '7654321-0', revenue: 3_100_000, profit: 420_000, fiscalYear: 2025 })
    const lines = ['Acme welds steel parts.', 'Acme has 46 staff.']
    const scripts = { 4: 'Analyst text of slide 4.', 7: 'Analyst text of slide 7.' }
    createVersion(t.db, DEAL_ID, { ...makeTimeline(DEAL_ID, { lines, linesSource: 'analyst', scripts }), basis: { website: 'https://acme.test/', businessId: '1234567-8', nace: '25.62' } }, T0)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      for (const n of [4, 7]) slide(timeline, n).scriptSource = 'analyst'
      return timeline
    })
    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), businessId: '7654321-0', nace: '28.12' } }, T0)
    expect(advance(t.db, DEAL_ID, T0).reasons[0]).toMatchObject({ code: 'remake_needed' })

    remakeDeal(t.db, DEAL_ID, T0)
    const scrape = claimNext(t.db, T0)
    expect(scrape?.key).toBe('scrape:100:remake-2')
    updateDeal(t.db, DEAL_ID, { scrape: { ...SCRAPE_OK, markdown: MARKDOWN } }, T0)
    completeJob(t.db, scrape?.id ?? 0, T0)
    expect(advance(t.db, DEAL_ID, T0).action).toBe('write-script')

    await runWriteScript()

    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal.financials).toEqual({ source: 'asiakastieto', revenue: 3_100_000, profit: 420_000, fiscalYear: 2025 })
    expect(deal.mgx).toMatchObject({ nace: '28.12', multiples: [6, 6, 6] })
    expect(ctx.stub.mgx.calls).toContainEqual({ tool: 'search_buyers', input: { nace: '28.12', country: 'FI' } })
    const timeline = getTimeline(t.db, DEAL_ID, 2)?.timeline as Timeline
    expect(timeline.basis).toEqual({ website: 'https://acme.test/', businessId: '7654321-0', nace: '28.12' })
    expect(slide(timeline, 3).variables).toMatchObject({ lines, linesSource: 'analyst' })
    expect(slide(timeline, 4).variables).toMatchObject({ mode: 'figures', revenue: 3_100_000 })
    expect(slide(timeline, 4)).toMatchObject({ script: 'Analyst text of slide 4.', scriptSource: 'analyst', scriptCheck: true })
    expect(slide(timeline, 7)).toMatchObject({ script: 'Analyst text of slide 7.', scriptSource: 'analyst' })
    expect(slide(timeline, 7).scriptCheck).toBeUndefined()
    expect(slide(timeline, 3)).toMatchObject({ scriptSource: 'fallback' })
    expect(deal.reviewReasons.map((reason) => [reason.code, reason.slide])).toEqual([['script_check', 4]])
  })
})

describe('write-script job, filling a version', () => {
  it('writes the missing lines and scripts and keeps the text of the analyst', async () => {
    const base = makeTimeline(DEAL_ID, { audio: 'ok', lines: [], linesSource: null })
    createVersion(t.db, DEAL_ID, base, T0)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      Object.assign(slide(timeline, 3).variables, { screenshotFile: null })
      slide(timeline, 4).script = ''
      Object.assign(slide(timeline, 6), { script: 'Analyst text of slide 6.', scriptSource: 'analyst' })
      return timeline
    })
    enqueue(t.db, 'write-script', jobKeys.writeScript(DEAL_ID, 1, [3, 4, 6]), { dealId: DEAL_ID, version: 1, slides: [3, 4, 6], lines: true }, { now: T0 })

    await runWriteScript()

    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 3).variables).toMatchObject({ linesSource: 'model', screenshotFile: 'deals/100/screenshot.png' })
    expect((slide(timeline, 3).variables as { lines: string[] }).lines).toHaveLength(3)
    expect(slide(timeline, 3)).toMatchObject({ scriptSource: 'fallback', audio: { status: 'new' } })
    expect(slide(timeline, 3).script).not.toBe('Script of slide 3.')
    expect(slide(timeline, 4)).toMatchObject({ scriptSource: 'fallback', audio: { status: 'new' } })
    expect(slide(timeline, 4).script).not.toBe('')
    expect(slide(timeline, 6)).toMatchObject({ script: 'Analyst text of slide 6.', scriptSource: 'analyst', audio: { status: 'ok' } })
    expect(slide(timeline, 2)).toMatchObject({ script: 'Script of slide 2.', audio: { status: 'ok' } })
    expect(getDeal(t.db, DEAL_ID)?.financials).toBeNull()
  })

  it('tells the model the length of a long line and keeps the lines that fit after a second failure', async () => {
    const model = new ScriptedModel()
    ctx.providers.model = model
    const long = `Acme Oy valmistaa teräsosia ja hitsattuja rakenteita laivanrakennukseen ${'ja telakoille '.repeat(3)}Turussa.`
    const fit = [
      'Acme Oy valmistaa teräsosia ja hitsattuja rakenteita Turussa.',
      'Asiakkaat ovat suomalaisia ja ruotsalaisia telakoita.',
    ]
    model.answers.push(() => ({ lines: [fit[0], long, fit[1]] }), () => ({ lines: [fit[0], long, fit[1]] }))
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok', lines: [], linesSource: null }), T0)
    enqueue(t.db, 'write-script', jobKeys.writeScript(DEAL_ID, 1, [3]), { dealId: DEAL_ID, version: 1, slides: [3], lines: true }, { now: T0 })

    await runWriteScript()

    expect(model.requests[1]?.system).toContain(`line 2 has ${long.length} of 90 characters`)
    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 3).variables).toMatchObject({ lines: fit, linesSource: 'model' })
    expect(requireDeal(t.db, DEAL_ID).reviewReasons.filter((reason) => reason.code === 'model_failed')).toEqual([])
  })

  it('writes a new buyer script after the analyst removes a buyer', async () => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok', scripts: { 5: 'Listalla on Nordic Industrial Partners.' } }), T0)
    applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1'] }, T0)

    await runWriteScript()

    const segment = slide(getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline, 5)
    expect(segment).toMatchObject({ scriptSource: 'fallback', audio: { status: 'new' } })
    expect(segment.script).toContain('Baltic Growth Fund')
    expect(segment.script).not.toContain('Nordic Industrial Partners')
    expect(jobsForDeal(t.db, DEAL_ID, ['audio'])).toHaveLength(1)
  })

  it('writes a new script for a slide that the analyst cleared before the approval, and makes audio before the render', async () => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), T0)
    markRenderStatus(t.db, DEAL_ID, 1, 'rendered', T0)
    setApproval(t.db, DEAL_ID, 1, true, T0)
    publish(t.db, DEAL_ID, 1, T0)
    applyReviewPatch(t.db, DEAL_ID, { scripts: { 5: '' } }, T0)
    expect(approveDeal(t.db, DEAL_ID, T0).advance.action).toBe('write-script')
    const stage = claimNext(t.db, ctx.now())
    expect(stage?.type).toBe('pipedrive-write')
    completeJob(t.db, stage?.id ?? 0, ctx.now())

    await runWriteScript()

    const segment = slide(getTimeline(t.db, DEAL_ID, 2)?.timeline as Timeline, 5)
    expect(segment).toMatchObject({ scriptSource: 'fallback', audio: { status: 'new', file: 'deals/100/audio/slide-5.v1.mp3' } })
    expect(segment.script).toContain('Nordic Industrial Partners')
    expect(jobsForDeal(t.db, DEAL_ID, ['audio', 'render']).map((job) => [job.type, job.status])).toEqual([['audio', 'queued']])
  })

  it('blocks the deal when its own write-script job leaves a slide without a script', async () => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), T0)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      Object.assign(slide(timeline, 5), { script: '', scriptSource: 'analyst' })
      return timeline
    })
    setApproval(t.db, DEAL_ID, 1, true, T0)
    enqueue(t.db, 'write-script', jobKeys.writeScript(DEAL_ID, 1, [5]), { dealId: DEAL_ID, version: 1, slides: [5], lines: false }, { now: T0 })

    await runWriteScript()

    expect(requireDeal(t.db, DEAL_ID).reviewReasons).toEqual([{ code: 'script_missing', slide: 5, detail: 'Slide 5 has no script' }])
    expect(jobsForDeal(t.db, DEAL_ID, ['audio', 'render'])).toEqual([])
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('pending')
  })

  it('drops a script when the slide changed while the model wrote it', async () => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok', scripts: { 5: '' } }), T0)
    enqueue(t.db, 'write-script', jobKeys.writeScript(DEAL_ID, 1, [5]), { dealId: DEAL_ID, version: 1, slides: [5], lines: false }, { now: T0 })
    const model = new ScriptedModel()
    ctx.providers.model = model
    model.answers.push(async (request) => {
      applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b2'] }, T0)
      return new ScriptedModel().completeJson(request)
    })

    await runWriteScript()

    expect(slide(getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline, 5)).toMatchObject({ script: '', scriptSource: null })
    expect(jobsForDeal(t.db, DEAL_ID, ['write-script']).at(-1)).toMatchObject({ key: 'write-script:100:1:5:edit-2', status: 'queued' })
  })

  it('does not claim a website review on slide 3 without a scraped website', async () => {
    updateDeal(t.db, DEAL_ID, { scrape: SCRAPE_FAILED }, T0)
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok', linesSource: 'analyst', scripts: { 3: '' } }), T0)
    enqueue(t.db, 'write-script', jobKeys.writeScript(DEAL_ID, 1, [3]), { dealId: DEAL_ID, version: 1, slides: [3], lines: false }, { now: T0 })
    const model = new ScriptedModel()
    ctx.providers.model = model

    await runWriteScript()

    expect(JSON.parse(model.requests[0]?.user ?? '{}')).toMatchObject({ slide: 3, context: { hasWebsite: false, linesSource: 'analyst' } })
    expect(model.requests[0]?.system).toContain('did not read a website')
    expect(model.requests[0]?.system).toContain('You wrote the lines yourself')
    expect(model.requests[0]?.system).not.toContain('screenshot')
    expect(slide(getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline, 3).script).not.toMatch(/website|verkkosivu/iu)
  })
})
