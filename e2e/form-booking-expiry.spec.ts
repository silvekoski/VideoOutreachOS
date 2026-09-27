import type { DealDetailDto, SlotDto } from '../packages/shared/src/api-types.ts'
import { pipedriveValuationText } from '../packages/shared/src/format.ts'
import { fill, formatEur, t } from '../packages/shared/src/i18n.ts'
import type { Amount, EventBatch } from '../packages/shared/src/types.ts'
import { valuationRange } from '../packages/shared/src/valuation.ts'
import { expect, pageData, test } from './fixtures.ts'
import { fakePipedriveDeal, setExpiresAt } from './stack.ts'

const TIME_ZONE = 'Europe/Berlin'
const DAY_MS = 86_400_000
const MEETING_MS = 30 * 60_000

test.describe.configure({ mode: 'serial' })
test.use({ timezoneId: TIME_ZONE })

test('the form sends range and exact values, shows the calculator range and writes the Pipedrive fields', async ({
  page,
  state,
  admin,
  projectDeal,
}) => {
  const strings = t(projectDeal.pageLanguage)
  const s = strings.page
  await page.goto(`/v/${projectDeal.code}?c=email`)
  const data = await pageData(page)
  if (data.calculator === null) throw new Error(`Deal ${projectDeal.id} has no calculator range`)
  const { p25, p75 } = data.calculator
  const expectedRange = (profit: Amount) => {
    const range = valuationRange(profit, p25, p75)
    return fill(s.calculatorResult, {
      low: formatEur(range.low ?? 0, strings.locale),
      high: formatEur(range.high ?? 0, strings.locale),
    })
  }
  const calculator = page.getByRole('region', { name: s.calculatorHeading })
  const send = page.getByRole('button', { name: s.submit, exact: true })

  await page.getByRole('combobox', { name: s.revenue, exact: true }).selectOption('5m-10m')
  await page.getByRole('combobox', { name: s.profit, exact: true }).selectOption('500k-1m')
  await expect(calculator).toContainText(expectedRange({ kind: 'range', min: 500_000, max: 1_000_000 }))

  await page.getByRole('radiogroup', { name: fill(s.amountKind, { field: s.profit }) }).getByText(s.exactChoice).click()
  const exact = page.getByRole('textbox', { name: `${s.profit} ${s.exactValue}`, exact: true })
  await exact.fill('0')
  await expect(exact).toHaveAttribute('aria-invalid', 'true')
  await expect(exact).toHaveAccessibleDescription(s.exactInvalid)
  await expect(send).toBeDisabled()
  await exact.fill('1.200.000')
  await expect(exact).not.toHaveAttribute('aria-invalid', 'true')
  await expect(calculator).toContainText(expectedRange({ kind: 'exact', value: 1_200_000 }))

  await page.getByRole('combobox', { name: s.staff, exact: true }).selectOption('50-99')
  await page.getByRole('radio', { name: strings.timing.in_1_3_years }).check()
  await page.getByRole('textbox', { name: s.message, exact: true }).fill('Bitte rufen Sie mich nach 16 Uhr an.')
  await send.click()
  await expect(page.getByText(s.sent)).toBeVisible()

  const detail = await admin.get<DealDetailDto>(`/api/deals/${projectDeal.id}`)
  expect(detail.status).toBe('form_sent')
  expect(detail.form).toMatchObject({
    revenue: { kind: 'range', min: 5_000_000, max: 10_000_000 },
    profit: { kind: 'exact', value: 1_200_000 },
    staff: '50-99',
    timing: 'in_1_3_years',
    message: 'Bitte rufen Sie mich nach 16 Uhr an.',
  })
  const valuation = valuationRange({ kind: 'exact', value: 1_200_000 }, p25, p75)
  expect(detail.valuation).toMatchObject({ available: true, low: valuation.low, high: valuation.high })

  await expect
    .poll(async () => (await fakePipedriveDeal(state, projectDeal.id))?.fields, { timeout: 30_000 })
    .toMatchObject({
      revenueRange: '5000000-10000000 EUR',
      profitRange: '1200000 EUR',
      staffRange: '50-99',
      valuationRange: pipedriveValuationText(detail.valuation),
    })
  await expect.poll(async () => (await fakePipedriveDeal(state, projectDeal.id))?.stage, { timeout: 30_000 }).toBe('form_sent')

  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: s.sent })).toBeVisible()
})

test('the owner books a meeting and sees the time with an IANA time zone name', async ({ page, state, admin, projectDeal }) => {
  const strings = t(projectDeal.pageLanguage)
  const s = strings.page
  await page.goto(`/v/${projectDeal.code}`)
  const data = await pageData(page)

  const slots = (await (await page.request.get(`/v/${projectDeal.code}/slots`)).json()) as SlotDto[]
  expect(slots.length).toBeGreaterThan(0)
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' })
  for (const slot of slots) {
    expect(Number(hour.format(new Date(slot.start)))).toBeGreaterThanOrEqual(9)
    expect(Number(hour.format(new Date(slot.start)))).toBeLessThan(16)
  }

  const calendar = page.locator('[data-region="calendar"]')
  await expect(calendar.getByText(fill(s.timeZone, { zone: TIME_ZONE }))).toBeVisible()
  const slot = calendar.locator('label[data-track="slot-time"]').nth(projectDeal.id === state.deals.ch.id ? -1 : 0)
  const start = (await slot.locator('input').getAttribute('value')) ?? ''
  const time = await slot.innerText()
  await slot.click()
  await calendar.getByRole('textbox', { name: s.email }).fill('t.brenner@brenner-hydraulik.de')
  await calendar.getByRole('button', { name: s.book, exact: true }).click()

  const confirmation = calendar.getByRole('status')
  await expect(confirmation).toContainText(`${time} (${TIME_ZONE})`)
  await expect(confirmation).toContainText(data.analystName)
  await expect(confirmation).not.toContainText(/\b(?:MEZ|MESZ|CET|CEST|GMT|UTC)\b/u)

  const detail = await admin.get<DealDetailDto>(`/api/deals/${projectDeal.id}`)
  expect(detail.status).toBe('meeting_booked')
  expect(Date.parse(detail.meetingAt ?? '')).toBe(Date.parse(start))
  await expect
    .poll(async () => (await fakePipedriveDeal(state, projectDeal.id))?.stage, { timeout: 30_000 })
    .toBe('meeting_booked')
})

test('an expired link returns 410', async ({ page, state, admin, projectDeal, request }) => {
  const s = t(projectDeal.pageLanguage).page
  const before = Date.now()
  const detail = await admin.post<DealDetailDto>(`/api/deals/${projectDeal.id}/expiry`, { days: 1 })
  expect(detail.expiryDays).toBe(1)
  expect(detail.meetingAt).not.toBeNull()
  const keepUntil = Date.parse(detail.meetingAt ?? '') + MEETING_MS + DAY_MS
  const expiresAt = Date.parse(detail.expiresAt ?? '')
  expect(expiresAt).toBeGreaterThanOrEqual(Math.max(before + DAY_MS - 1000, keepUntil))
  expect(expiresAt).toBeLessThanOrEqual(Math.max(Date.now() + DAY_MS + 1000, keepUntil))
  expect((await page.goto(`/v/${projectDeal.code}`))?.status()).toBe(200)
  const data = await pageData(page)

  setExpiresAt(state, projectDeal.id, new Date(Date.now() - 60_000))

  expect((await page.goto(`/v/${projectDeal.code}`))?.status()).toBe(410)
  await expect(page.getByRole('heading', { name: s.expiredTitle })).toBeVisible()
  expect((await request.get(data.media.video720)).status()).toBe(410)
  const batch: EventBatch = {
    sessionId: '00000000-0000-4000-8000-000000000000',
    session: { channel: 'direct', device: 'mobile', browser: 'Chrome', os: 'Android', screen: '412x915', version: data.version },
    events: [{ seq: 0, type: 'open', at: new Date().toISOString(), slide: null, vt: null }],
  }
  expect((await request.post(`/v/${projectDeal.code}/events`, { data: batch })).status()).toBe(410)
  expect((await admin.get<DealDetailDto>(`/api/deals/${projectDeal.id}`)).expired).toBe(true)
})
