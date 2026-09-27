import { describe, expect, it } from 'vitest'
import { displayUrl, safeHttpUrl, shareUrl, telHref } from '../../src/video/urls.ts'

describe('shareUrl', () => {
  it('removes the preview parameter and the hash and keeps the channel', () => {
    expect(shareUrl('https://video.mergero.com/v/AbCdEfGhIjKlMnOpQrStUv?c=linkedin&preview=1#form')).toBe(
      'https://video.mergero.com/v/AbCdEfGhIjKlMnOpQrStUv?c=linkedin',
    )
    expect(shareUrl('https://video.mergero.com/v/AbCdEfGhIjKlMnOpQrStUv?preview=1')).toBe(
      'https://video.mergero.com/v/AbCdEfGhIjKlMnOpQrStUv',
    )
  })
})

describe('safeHttpUrl', () => {
  it('accepts http and https and adds https to a bare host name', () => {
    expect(safeHttpUrl('https://buyer.example/about')).toBe('https://buyer.example/about')
    expect(safeHttpUrl('http://buyer.example')).toBe('http://buyer.example/')
    expect(safeHttpUrl('buyer.example')).toBe('https://buyer.example/')
  })

  it('rejects other schemes and empty values', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.c', '', '  ', null, undefined]) {
      expect(safeHttpUrl(value)).toBeNull()
    }
  })
})

describe('displayUrl and telHref', () => {
  it('shortens a URL for link text', () => {
    expect(displayUrl('https://mergero.com/privacy-policy/')).toBe('mergero.com/privacy-policy')
    expect(displayUrl('https://www.mergero.com')).toBe('mergero.com')
  })

  it('keeps only digits and the plus sign in a phone link', () => {
    expect(telHref('+358 10 212 1380')).toBe('tel:+358102121380')
  })
})
