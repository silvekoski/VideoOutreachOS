import { describe, expect, it } from 'vitest'
import { fileExtension, pickMimeType } from '../../src/hooks/use-media-recorder'

describe('pickMimeType', () => {
  it('prefers MP4 when the browser supports it', () => {
    expect(pickMimeType('video', () => true)).toBe('video/mp4;codecs=avc1,mp4a')
  })

  it('falls back to WebM and to null', () => {
    expect(pickMimeType('video', (type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus')
    expect(pickMimeType('audio', () => false)).toBeNull()
  })
})

describe('fileExtension', () => {
  it('maps the media type to a file extension', () => {
    expect(fileExtension('video/mp4;codecs=avc1')).toBe('mp4')
    expect(fileExtension('audio/mp4')).toBe('m4a')
    expect(fileExtension('audio/ogg;codecs=opus')).toBe('ogg')
    expect(fileExtension('video/webm')).toBe('webm')
  })
})
