import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { introCaptionsUrl } from '../../src/admin/lib/captions'
import { useReturnFocus } from '../../src/admin/lib/use-return-focus'

class FakeElement {
  isConnected = true
  focus = vi.fn()
}

function returnFocusHandlers(): ReturnType<typeof useReturnFocus> {
  let handlers: ReturnType<typeof useReturnFocus> | null = null
  function Probe() {
    handlers = useReturnFocus()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  if (!handlers) throw new Error('The hook did not run')
  return handlers
}

function closeEvent(): Event {
  return { preventDefault: vi.fn() } as unknown as Event
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useReturnFocus', () => {
  it('gives the focus back to the element that opened the dialog', () => {
    const opener = new FakeElement()
    vi.stubGlobal('HTMLElement', FakeElement)
    vi.stubGlobal('document', { activeElement: opener, body: new FakeElement() })
    const { onOpenAutoFocus, onCloseAutoFocus } = returnFocusHandlers()
    onOpenAutoFocus()
    const event = closeEvent()
    onCloseAutoFocus(event)
    expect(opener.focus).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps the default focus when the opener left the page or was the page body', () => {
    const opener = new FakeElement()
    const body = new FakeElement()
    vi.stubGlobal('HTMLElement', FakeElement)
    vi.stubGlobal('document', { activeElement: opener, body })
    const gone = returnFocusHandlers()
    gone.onOpenAutoFocus()
    opener.isConnected = false
    const first = closeEvent()
    gone.onCloseAutoFocus(first)
    expect(first.preventDefault).not.toHaveBeenCalled()

    vi.stubGlobal('document', { activeElement: body, body })
    const fromBody = returnFocusHandlers()
    fromBody.onOpenAutoFocus()
    const second = closeEvent()
    fromBody.onCloseAutoFocus(second)
    expect(second.preventDefault).not.toHaveBeenCalled()
    expect(body.focus).not.toHaveBeenCalled()
  })
})

describe('introCaptionsUrl', () => {
  it('builds WebVTT captions over the intro length from the transcript', () => {
    const url = introCaptionsUrl({ language: 'fi', durationS: 30, transcript: ' Hei, olen Aino Mergerosta. Kiitos ajastasi. ' })
    expect(url?.startsWith('data:text/vtt;charset=utf-8,')).toBe(true)
    const vtt = decodeURIComponent(url?.slice('data:text/vtt;charset=utf-8,'.length) ?? '')
    expect(vtt.startsWith('WEBVTT\n\n1\n00:00:00.000 --> ')).toBe(true)
    expect(vtt).toContain('Hei, olen Aino Mergerosta.')
    expect(vtt).toContain('--> 00:00:30.000\nKiitos ajastasi.')
  })

  it('gives no captions without a transcript or a length', () => {
    expect(introCaptionsUrl({ language: 'fi', durationS: 30, transcript: null })).toBeNull()
    expect(introCaptionsUrl({ language: 'fi', durationS: 30, transcript: '  ' })).toBeNull()
    expect(introCaptionsUrl({ language: 'fi', durationS: null, transcript: 'Hei.' })).toBeNull()
  })
})
