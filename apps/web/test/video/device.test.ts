import { describe, expect, it } from 'vitest'
import { CHANNELS } from '@mergero/shared'
import type { VideoPageData } from '@mergero/shared'
import { channelFromSearch, detectPlatform, pickVideoSource, sessionInfo, WIDE_QUERY } from '../../src/video/device.ts'

const media: VideoPageData['media'] = {
  video720: '/v/code/media/video-720.v2.mp4',
  video1080: '/v/code/media/video-1080.v2.mp4',
  poster: '/v/code/media/poster.v2.jpg',
  captions: '/v/code/captions.v2.vtt',
}

function screenWidth(width: number) {
  const queries: string[] = []
  const matchMedia = (query: string) => {
    queries.push(query)
    const min = /\(min-width:\s*(\d+)px\)/u.exec(query)
    return { matches: min !== null && width >= Number(min[1]) }
  }
  return { matchMedia, queries }
}

describe('pickVideoSource', () => {
  it('asks for a minimum width of 1024 pixels', () => {
    const { matchMedia, queries } = screenWidth(390)
    pickVideoSource(media, matchMedia)
    expect(queries).toEqual([WIDE_QUERY])
    expect(WIDE_QUERY).toBe('(min-width: 1024px)')
  })

  it.each([
    [320, media.video720],
    [390, media.video720],
    [1023, media.video720],
    [1024, media.video1080],
    [1920, media.video1080],
  ])('a screen %i pixels wide gets %s', (width, file) => {
    expect(pickVideoSource(media, screenWidth(width).matchMedia)).toBe(file)
  })
})

describe('channelFromSearch', () => {
  it('accepts each channel of the shared contract', () => {
    for (const channel of CHANNELS) expect(channelFromSearch(`?c=${channel}`)).toBe(channel)
  })

  it('ignores case and white space', () => {
    expect(channelFromSearch('?c=WhatsApp')).toBe('whatsapp')
    expect(channelFromSearch('?c=%20email%20')).toBe('email')
  })

  it('gives direct for a missing, empty or unknown channel', () => {
    expect(channelFromSearch('')).toBe('direct')
    expect(channelFromSearch('?c=')).toBe('direct')
    expect(channelFromSearch('?c=fax')).toBe('direct')
    expect(channelFromSearch('?preview=1')).toBe('direct')
  })
})

const AGENTS = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iPhoneLinkedIn:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.100',
  iPadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 16; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/150.0.0.0 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
}

describe('detectPlatform', () => {
  it.each([
    ['iPhoneSafari', 0, { device: 'mobile', browser: 'Safari', os: 'iOS', iPhone: true, iOS: true }],
    ['iPhoneLinkedIn', 0, { device: 'mobile', browser: 'LinkedIn app', os: 'iOS', iPhone: true, iOS: true }],
    ['iPadDesktopMode', 5, { device: 'tablet', browser: 'Safari', os: 'iOS', iPhone: false, iOS: true }],
    ['iPadDesktopMode', 0, { device: 'desktop', browser: 'Safari', os: 'macOS', iPhone: false, iOS: false }],
    ['androidPhone', 5, { device: 'mobile', browser: 'Chrome', os: 'Android', iPhone: false, iOS: false }],
    ['androidTablet', 5, { device: 'tablet', browser: 'Chrome', os: 'Android', iPhone: false, iOS: false }],
    ['samsung', 5, { device: 'mobile', browser: 'Samsung Internet', os: 'Android', iPhone: false, iOS: false }],
    ['windowsEdge', 10, { device: 'desktop', browser: 'Edge', os: 'Windows', iPhone: false, iOS: false }],
    ['macChrome', 0, { device: 'desktop', browser: 'Chrome', os: 'macOS', iPhone: false, iOS: false }],
    ['linuxFirefox', 0, { device: 'desktop', browser: 'Firefox', os: 'Linux', iPhone: false, iOS: false }],
  ] as const)('%s with %i touch points', (agent, touchPoints, expected) => {
    expect(detectPlatform(AGENTS[agent], touchPoints)).toEqual(expected)
  })

  it('gives Other for an unknown agent', () => {
    expect(detectPlatform('curl/8.9', 0)).toEqual({
      device: 'desktop',
      browser: 'Other',
      os: 'Other',
      iPhone: false,
      iOS: false,
    })
  })
})

describe('sessionInfo', () => {
  it('builds the session info of the event batch', () => {
    const platform = detectPlatform(AGENTS.iPhoneSafari, 0)
    expect(sessionInfo({ search: '?c=sms', platform, screenWidth: 390, screenHeight: 844, version: 3 })).toEqual({
      channel: 'sms',
      device: 'mobile',
      browser: 'Safari',
      os: 'iOS',
      screen: '390x844',
      version: 3,
    })
  })

  it('rounds and clamps the screen size to the server pattern', () => {
    const platform = detectPlatform(AGENTS.macChrome, 0)
    const info = sessionInfo({ search: '', platform, screenWidth: 1512.4, screenHeight: Number.NaN, version: 1 })
    expect(info.screen).toBe('1512x0')
    expect(sessionInfo({ search: '', platform, screenWidth: 1e9, screenHeight: -5, version: 1 }).screen).toBe('99999x0')
  })
})
