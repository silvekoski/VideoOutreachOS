import type { DealDetailDto } from '../packages/shared/src/api-types.ts'
import { fill, t } from '../packages/shared/src/i18n.ts'
import { eventBatches, expect, pageData, test } from './fixtures.ts'

test('the player plays the phone video, jumps to a slide, shows the buyers and the captions, and records a session', async ({
  page,
  state,
  admin,
}) => {
  const deal = state.deals.fi
  const s = t(deal.pageLanguage).page
  const batches = eventBatches(page)
  await page.goto(`/v/${deal.code}?c=whatsapp`)
  const data = await pageData(page)
  const video = page.locator('video')
  const currentTime = () => video.evaluate((element: HTMLVideoElement) => element.currentTime)

  await expect(video).toHaveAttribute('poster', data.media.poster)
  const poster = await page.request.get(data.media.poster)
  expect(poster.status()).toBe(200)
  expect(poster.headers()['content-type']).toBe('image/jpeg')
  const play = page.locator('[data-track="play-overlay"]')
  await expect(play).toBeVisible()
  await expect(play).toHaveAccessibleName(s.play)

  await play.tap()
  await expect.poll(currentTime).toBeGreaterThan(0.5)
  await expect(play).toBeHidden()
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(
    new URL(data.media.video720, state.baseUrl).href,
  )

  const buyersHeading = page.getByRole('heading', { name: s.buyersHeading })
  await expect(buyersHeading).toBeHidden()
  const slide5 = data.slides.find((slide) => slide.slide === 5)
  if (!slide5) throw new Error('The video has no slide 5')
  await page.getByRole('button', { name: fill(s.jumpToSlide, { n: 5, name: s.slideNames[5] }) }).tap()
  await expect.poll(currentTime).toBeGreaterThanOrEqual(slide5.startS)
  expect(await currentTime()).toBeLessThan(slide5.endS)
  await expect(buyersHeading).toBeVisible()
  const buyer = data.buyers.find((item) => item.website !== null)
  if (!buyer) throw new Error('The video has no buyer with a website')
  await expect(page.getByRole('link', { name: `${s.visitWebsite}: ${buyer.name}` })).toBeVisible()
  await page.getByRole('button', { name: fill(s.jumpToSlide, { n: 6, name: s.slideNames[6] }) }).tap()
  await expect(buyersHeading).toBeHidden()

  const track = page.locator('video track')
  await expect(track).toHaveAttribute('srclang', data.videoLanguage)
  const captionMode = () => video.evaluate((element: HTMLVideoElement) => element.textTracks[0]?.mode)
  await page.getByRole('button', { name: s.captionsOn }).tap()
  await expect(page.getByRole('button', { name: s.captionsOff })).toBeVisible()
  expect(await captionMode()).toBe('showing')
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0]?.cues?.length ?? 0))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: s.captionsOff }).tap()
  await expect(page.getByRole('button', { name: s.captionsOn })).toBeVisible()
  expect(await captionMode()).toBe('hidden')

  await expect
    .poll(() => batches.flatMap((batch) => batch.events.map((event) => event.type)), { timeout: 25_000 })
    .toEqual(expect.arrayContaining(['open', 'play', 'seek', 'slide_start']))
  const first = batches[0]
  if (!first) throw new Error('The page sent no events')
  expect(first.session).toMatchObject({ channel: 'whatsapp', device: 'mobile', version: data.version })
  await expect
    .poll(async () => {
      const detail = await admin.get<DealDetailDto>(`/api/deals/${deal.id}`)
      return detail.sessions.find((session) => session.id === first.sessionId)?.channel
    })
    .toBe('whatsapp')
})
