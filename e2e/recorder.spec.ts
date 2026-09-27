import type { SessionEventsDto } from '../packages/shared/src/api-types.ts'
import { fill, t } from '../packages/shared/src/i18n.ts'
import type { EventBatch } from '../packages/shared/src/types.ts'
import { expect, test } from './fixtures.ts'

test('the recorder sends the field names but never the typed values', async ({ page, state, admin }) => {
  const deal = state.deals.fi
  const s = t(deal.pageLanguage).page
  const bodies: string[] = []
  await page.route(/\/v\/[^/]+\/events$/u, async (route) => {
    bodies.push(route.request().postData() ?? '')
    await route.continue()
  })
  const typed = { revenue: '4 321 987', message: 'Salainen viesti numero 5519 e2e', email: 'omistaja.e2e@example.com' }
  const secrets = [typed.revenue, typed.revenue.replaceAll(' ', ''), typed.message, 'Salainen', typed.email, 'omistaja']

  await page.goto(`/v/${deal.code}`)
  await page.getByRole('radiogroup', { name: fill(s.amountKind, { field: s.revenue }) }).getByText(s.exactChoice).click()
  await page.getByRole('textbox', { name: `${s.revenue} ${s.exactValue}`, exact: true }).fill(typed.revenue)
  await page.getByRole('textbox', { name: s.message, exact: true }).fill(typed.message)
  await page.getByRole('button', { name: s.calendarHeading, exact: true }).click()
  const email = page.getByRole('textbox', { name: s.email })
  await email.fill(typed.email)
  await email.blur()

  const batches = () => bodies.map((body) => JSON.parse(body) as EventBatch)
  const filled = () =>
    batches()
      .flatMap((batch) => batch.events)
      .filter((event) => event.type === 'field_value')
      .map((event) => event.data?.field)
  await expect.poll(filled, { timeout: 25_000 }).toEqual(expect.arrayContaining(['revenue-exact', 'message', 'booking-email']))
  for (const body of bodies) {
    for (const secret of secrets) expect(body).not.toContain(secret)
  }

  const sessionId = batches()[0]?.sessionId ?? ''
  const stored = () => admin.get<SessionEventsDto>(`/api/sessions/${sessionId}/events`).then((dto) => JSON.stringify(dto))
  await expect.poll(stored).toContain('booking-email')
  const text = await stored()
  for (const secret of secrets) expect(text).not.toContain(secret)
})
