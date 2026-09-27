import { t } from '../packages/shared/src/i18n.ts'
import type { DealDetailDto, FormSubmitBody, SlotDto } from '../packages/shared/src/api-types.ts'
import { expect, isEventsPost, test } from './fixtures.ts'

test('preview mode shows the video, disables the form and the booking, and records nothing', async ({
  page,
  state,
  admin,
  request,
}) => {
  const deal = state.deals.fi
  const s = t(deal.pageLanguage).page
  const eventPosts: string[] = []
  page.on('request', (item) => {
    if (isEventsPost(item.url(), item.method())) eventPosts.push(item.url())
  })

  await page.goto(`/v/${deal.code}?preview=1`)
  await expect(page.locator('[data-track="play-overlay"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: s.calculatorHeading })).toHaveCount(0)

  await page.getByRole('combobox', { name: s.revenue, exact: true }).selectOption('1m-3m')
  const send = page.getByRole('button', { name: s.submit, exact: true })
  await expect(send).toBeDisabled()
  await expect(send).toHaveAccessibleDescription(s.previewNote)

  await page.getByRole('button', { name: s.calendarHeading, exact: true }).click()
  const calendar = page.locator('[data-region="calendar"]')
  const slot = calendar.locator('label[data-track="slot-time"]').first()
  await slot.click()
  const book = calendar.getByRole('button', { name: s.book, exact: true })
  await expect(book).toBeDisabled()
  await expect(book).toHaveAccessibleDescription(s.previewNote)

  const slots = (await (await request.get(`/v/${deal.code}/slots`)).json()) as SlotDto[]
  const start = slots[0]?.start ?? ''
  const body: FormSubmitBody = {
    revenue: null,
    profit: null,
    staff: null,
    timing: null,
    notInterestedReason: null,
    custom: [],
    message: 'Preview',
  }
  const form = await request.post(`/v/${deal.code}/form?preview=1`, { data: body })
  expect(form.status()).toBe(403)
  const booking = await request.post(`/v/${deal.code}/book?preview=1`, { data: { start, email: null } })
  expect(booking.status()).toBe(403)
  const detail = await admin.get<DealDetailDto>(`/api/deals/${deal.id}`)
  expect(detail.form).toBeNull()
  expect(detail.meetingAt).toBeNull()

  await page.waitForTimeout(11_000)
  expect(eventPosts).toEqual([])
})
