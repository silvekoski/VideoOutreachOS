import type { Channel, SessionChannel, SessionInfo, VideoPageData } from '@mergero/shared'

export const WIDE_QUERY = '(min-width: 1024px)'

const CHANNELS: readonly Channel[] = ['email', 'linkedin', 'sms', 'whatsapp']

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bLinkedInApp\b/u, 'LinkedIn app'],
  [/\bFBAN\/|\bFBAV\/|\bFB_IAB\//u, 'Facebook app'],
  [/\bInstagram\b/u, 'Instagram app'],
  [/\bSamsungBrowser\//u, 'Samsung Internet'],
  [/\bEdg(?:e|A|iOS)?\//u, 'Edge'],
  [/\bOPR\/|\bOPiOS\//u, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//u, 'Firefox'],
  [/\bCriOS\/|\bChrome\//u, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//u, 'Safari'],
]

export interface Platform {
  device: SessionInfo['device']
  browser: string
  os: string
  iPhone: boolean
  iOS: boolean
}

export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  const iPad = /\biPad\b/u.test(userAgent) || (/\bMacintosh\b/u.test(userAgent) && maxTouchPoints > 1)
  const iPhone = /\biPhone\b|\biPod\b/u.test(userAgent)
  const iOS = iPad || iPhone
  const android = /\bAndroid\b/u.test(userAgent)
  const device: Platform['device'] =
    iPad || (android && !/\bMobile\b/u.test(userAgent)) || /\bTablet\b/u.test(userAgent)
      ? 'tablet'
      : iPhone || android || /\bMobi/u.test(userAgent)
        ? 'mobile'
        : 'desktop'
  const os = iOS
    ? 'iOS'
    : android
      ? 'Android'
      : /\bCrOS\b/u.test(userAgent)
        ? 'ChromeOS'
        : /\bWindows\b/u.test(userAgent)
          ? 'Windows'
          : /\bMacintosh\b|\bMac OS X\b/u.test(userAgent)
            ? 'macOS'
            : /\bLinux\b/u.test(userAgent)
              ? 'Linux'
              : 'Other'
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Other'
  return { device, browser, os, iPhone, iOS }
}

export function channelFromSearch(search: string): SessionChannel {
  const value = new URLSearchParams(search).get('c')?.trim().toLowerCase()
  return CHANNELS.find((channel) => channel === value) ?? 'direct'
}

export function sessionInfo(input: {
  search: string
  platform: Platform
  screenWidth: number
  screenHeight: number
  version: number
}): SessionInfo {
  const side = (value: number) => Math.min(99_999, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
  return {
    channel: channelFromSearch(input.search),
    device: input.platform.device,
    browser: input.platform.browser,
    os: input.platform.os,
    screen: `${side(input.screenWidth)}x${side(input.screenHeight)}`,
    version: input.version,
  }
}

export function pickVideoSource(
  media: VideoPageData['media'],
  matchMedia: (query: string) => { matches: boolean },
): string {
  return matchMedia(WIDE_QUERY).matches ? media.video1080 : media.video720
}
