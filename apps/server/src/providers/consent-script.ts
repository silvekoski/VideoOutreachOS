import { countryLanguages } from '@mergero/shared'

export const CMP_CONTAINERS = [
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '#CybotCookiebotDialogBodyUnderlay',
  '#usercentrics-root',
  '#usercentrics-cmp-ui',
  '#uc-center-container',
  '#didomi-host',
  '#coiOverlay',
  '#coi-banner-wrapper',
  'div[id^="sp_message_container"]',
  '#truste-consent-track',
  '.truste_overlay',
  '.qc-cmp2-container',
  '#cmpbox',
  '#cmpbox2',
  '.cky-consent-container',
  '.cky-overlay',
  '#cmplz-cookiebanner-container',
  '#BorlabsCookieBox',
  '.osano-cm-window',
  '#iubenda-cs-banner',
  '.cookiefirst-root',
  '#ch2',
  '.klaro',
  '#axeptio_overlay',
  '#hs-eu-cookie-confirmation',
  '#ppms_cm_popup_overlay',
  '#shopify-pc__banner',
]

export const CONSENT_EXCLUDE_TAGS = [
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[aria-label*="cookie" i]',
  ...CMP_CONTAINERS,
]

const ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#accept-recommended-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'button[data-testid="uc-accept-all-button"]',
  '#didomi-notice-agree-button',
  '.coi-banner__accept',
  '#truste-consent-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '.cmpboxbtnyes',
  '.cky-btn-accept',
  '.cmplz-btn.cmplz-accept',
  '[data-cookiefirst-action="accept"]',
  '.osano-cm-accept-all',
  '.iubenda-cs-accept-btn',
  '.ch2-allow-all-btn',
  '.cm-btn-accept-all',
  '#axeptio_btn_acceptAll',
  '#hs-eu-confirmation-button',
  '#ppms_cm_agree-to-all',
  '#shopify-pc__banner__btn-accept',
  'a[data-cookie-accept-all]',
  '[data-borlabs-cookie-actions="accept-all"]',
]

const WORDS = {
  strong: [
    'accept all( cookies)?', 'allow all( cookies)?', 'accept (and|&) (close|continue)', 'i accept( all)?', 'agree( to all)?', 'i agree', 'accept cookies', 'allow cookies',
    'hyväksy kaikki( evästeet)?', 'hyväksy evästeet', 'salli kaikki( evästeet)?', 'hyväksyn( kaikki)?', 'sallin( kaikki)?',
    'godkänn alla( cookies| kakor)?', 'acceptera alla( cookies| kakor)?', 'tillåt alla( cookies| kakor)?', 'jag godkänner', 'godkänn cookies', 'acceptera cookies',
    'godta alle( informasjonskapsler| cookies)?', 'aksepter alle( informasjonskapsler| cookies)?', 'tillat alle( informasjonskapsler| cookies)?', 'godkjenn alle', 'jeg godtar', 'jeg aksepterer',
    'accepter alle( cookies)?', 'tillad alle( cookies)?', 'godkend alle( cookies)?', 'ja tak', 'jeg accepterer', 'accepter cookies',
    'alle akzeptieren', 'alle cookies akzeptieren', 'alles akzeptieren', 'alle zulassen', 'alle cookies zulassen', 'alle erlauben', 'alle annehmen',
    'akzeptieren und (weiter|schließen|fortfahren)', 'zustimmen und (weiter|fortfahren)', 'ich stimme zu', 'ich akzeptiere', 'einverstanden', 'cookies akzeptieren', 'cookies zulassen',
    'samþykkja( allt| allar| alla)?', 'leyfa allt',
    'tout accepter', 'accepter tout', "j'accepte", 'alles accepteren', 'accetta tutti', 'aceptar todo',
  ],
  weak: [
    'accept', 'allow', 'agree', 'ok', 'okay', 'got it', 'continue', 'i understand',
    'hyväksy', 'salli', 'ok, selvä', 'selvä', 'ymmärrän', 'jatka',
    'godkänn', 'acceptera', 'tillåt', 'jag förstår', 'fortsätt',
    'godta', 'aksepter', 'tillat', 'godkjenn', 'forstått', 'fortsett',
    'accepter', 'tillad', 'godkend', 'forstået', 'fortsæt',
    'akzeptieren', 'zustimmen', 'annehmen', 'zulassen', 'erlauben', 'verstanden', 'alles klar', 'weiter',
    'accepteren', 'accetta', 'aceptar',
  ],
  neg: [
    'reject', 'decline', 'deny', 'refuse', 'necessary', 'essential', 'only', 'setting', 'preference', 'customi', 'manage', 'option', 'more info', 'learn more', 'detail', 'without',
    'hylkää', 'kiellä', 'vain', 'välttämät', 'asetuks', 'mukauta', 'valitut', 'ilman',
    'avvisa', 'neka', 'endast', 'nödvändig', 'inställning', 'anpassa', 'valda', 'utan',
    'avslå', 'avvis', 'kun ', 'nødvendig', 'innstilling', 'tilpass', 'valgte', 'uten',
    'afvis', 'afslå', 'indstilling', 'tilpas', 'uden',
    'ablehnen', 'nur ', 'notwendig', 'erforderlich', 'essenziell', 'einstellung', 'anpassen', 'verwalten', 'auswahl', 'ausgewählt', 'speichern', 'mehr ', 'ohne',
    'refuser', 'rifiuta', 'rechazar', 'weigeren', 'paramètres',
  ],
  box: [
    'cookie', 'consent', 'gdpr', 'dsgvo', 'privacy', 'cmp', 'evä?ste', 'kakor', 'samtyk', 'samtycke', 'suostum', 'informasjonskapsl', 'datenschutz', 'einwillig',
    'onetrust', 'cybot', 'usercentrics', 'didomi', 'sp_message', 'truste', 'qc-cmp', 'cky-', 'cmplz', 'borlabs', 'osano', 'iubenda', 'klaro', 'coi-',
  ],
  close: ['close', 'dismiss', 'sulje', 'stäng', 'lukk', 'luk', 'schließen', 'schliessen', 'fermer', 'chiudi', 'cerrar', 'no thanks', 'ei kiitos', 'nej tack', 'nei takk', 'nej tak', 'nein danke', '×', '✕', 'x$'],
  hiddenBox: ['cookie', 'consent', 'gdpr', 'dsgvo', 'eva?ste', 'eväste', 'samtyk', 'samtycke', 'suostum', 'onetrust', 'cybot', 'usercentrics', 'didomi', 'sp_message', 'truste', 'qc-cmp', 'cmplz', 'borlabs', 'osano', 'iubenda', 'klaro'],
  bannerText: ['cookie', 'evästee', 'kakor', 'informasjonskapsl', 'samtyk', 'samtycke', 'suostum', 'datenschutz', 'einwillig', 'consent'],
}

export const CONSENT_HINT_PATTERN = WORDS.hiddenBox.join('|')

type ConsentPhase = 'accept' | 'cleanup'

interface ConsentConfig {
  strong: string[]
  weak: string[]
  neg: string[]
  box: string[]
  close: string[]
  hiddenBox: string[]
  bannerText: string[]
  acceptSelectors: string[]
  containers: string[]
  iframeContainers: string[]
  maxWaitMs: number
  quietMs: number
  apiAfterMs: number
}

export interface ConsentOutcome {
  phase: ConsentPhase
  method: string | null
  target: string | null
  removed: number
  what: string[]
  closed?: string[]
  visibleAfter: string | null
  ms: number
  error: string | null
}

interface CmpWindow {
  OneTrust?: { AllowAll?: () => void }
  Cookiebot?: { submitCustomConsent?: (a: boolean, b: boolean, c: boolean) => void; hasResponse?: boolean }
  UC_UI?: { acceptAllConsents?: () => Promise<unknown>; closeCMP?: () => void }
  __ucCmp?: { acceptAllConsents?: () => Promise<unknown> }
  Didomi?: { setUserAgreeToAll?: () => void }
  CookieInformation?: { submitAllCategories?: () => void }
}

function consentPage(phase: ConsentPhase, cfg: ConsentConfig): Promise<ConsentOutcome> {
  const t0 = Date.now()
  const out: ConsentOutcome = { phase, method: null, target: null, removed: 0, what: [], visibleAfter: null, ms: 0, error: null }
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const norm = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const strong = new RegExp('^(' + cfg.strong.join('|') + ')[.!]?$')
  const weak = new RegExp('^(' + cfg.weak.join('|') + ')[.!]?$')
  const neg = new RegExp(cfg.neg.join('|'))
  const boxRe = new RegExp(cfg.box.join('|'), 'i')
  const bannerRe = new RegExp(cfg.bannerText.join('|'), 'i')
  const closeRe = new RegExp('^(' + cfg.close.join('|') + ')')
  const hiddenRe = new RegExp(cfg.hiddenBox.join('|'), 'i')
  const classOf = (el: Element) => (typeof el.className === 'string' ? el.className : '')
  const roots = () => {
    const list: (Document | ShadowRoot)[] = [document]
    for (let i = 0; i < list.length; i++) {
      for (const el of Array.from(list[i]!.querySelectorAll('*'))) {
        if (el.shadowRoot) list.push(el.shadowRoot)
        if (el.tagName === 'IFRAME') {
          try {
            const doc = (el as HTMLIFrameElement).contentDocument
            if (doc) list.push(doc)
          } catch {
            // cross-origin frame
          }
        }
      }
    }
    return list
  }
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement
    const root = el.getRootNode()
    return root instanceof ShadowRoot ? root.host : null
  }
  const inBox = (el: Element) => {
    let hint = 0
    for (let node: Element | null = el, depth = 0; node && depth < 15; node = parentOf(node), depth++) {
      const tag = [node.id, classOf(node), node.getAttribute('aria-label'), node.getAttribute('data-testid')].join(' ')
      if (boxRe.test(tag)) return 2
      const role = node.getAttribute('role')
      if (role === 'dialog' || role === 'alertdialog' || node.getAttribute('aria-modal') === 'true') hint = 1
      if (node !== el && getComputedStyle(node).position === 'fixed') hint = 1
    }
    return hint
  }
  const label = (el: HTMLElement) =>
    norm(el.innerText || (el as HTMLInputElement).value || el.getAttribute('aria-label') || el.getAttribute('title'))
  const safeLink = (el: Element) => {
    if (el.tagName !== 'A') return true
    const href = (el.getAttribute('href') || '').trim()
    return href === '' || href === '#' || href.startsWith('javascript:') || el.getAttribute('role') === 'button'
  }
  const later = (fn: () => unknown) =>
    setTimeout(() => {
      try {
        fn()
      } catch {
        // the page changed after the click
      }
    }, 50)
  const findBySelector = (rs: (Document | ShadowRoot)[]) => {
    for (const sel of cfg.acceptSelectors) {
      for (const root of rs) {
        const el = root.querySelector<HTMLElement>(sel)
        if (el && visible(el)) return { el, sel }
      }
    }
    return null
  }
  const findByText = (rs: (Document | ShadowRoot)[]) => {
    let best: { el: HTMLElement; txt: string; score: number } | null = null
    for (const root of rs) {
      for (const el of Array.from(
        root.querySelectorAll<HTMLElement>('button, [role="button"], a, input[type="button"], input[type="submit"]'),
      )) {
        const txt = label(el)
        if (!txt || txt.length > 60 || neg.test(txt) || !safeLink(el) || !visible(el)) continue
        const strength = strong.test(txt) ? 3 : weak.test(txt) ? 1 : 0
        if (!strength) continue
        const box = inBox(el)
        if (strength === 1 && box < 2) continue
        if (strength === 3 && box < 1 && !/all|kaikki|alla|alle/.test(txt)) continue
        const score = strength * 10 + box
        if (!best || score > best.score) best = { el, txt, score }
      }
    }
    return best
  }
  const apis = (): [string, () => unknown] | null => {
    const w = window as unknown as CmpWindow
    if (typeof w.OneTrust?.AllowAll === 'function') return ['onetrust', () => w.OneTrust?.AllowAll?.()]
    if (typeof w.Cookiebot?.submitCustomConsent === 'function' && w.Cookiebot.hasResponse === false) {
      return ['cookiebot', () => w.Cookiebot?.submitCustomConsent?.(true, true, true)]
    }
    if (typeof w.UC_UI?.acceptAllConsents === 'function') {
      return ['usercentrics-v2', () => w.UC_UI?.acceptAllConsents?.().then(() => w.UC_UI?.closeCMP?.())]
    }
    if (typeof w.__ucCmp?.acceptAllConsents === 'function') return ['usercentrics-v3', () => w.__ucCmp?.acceptAllConsents?.()]
    if (typeof w.Didomi?.setUserAgreeToAll === 'function') return ['didomi', () => w.Didomi?.setUserAgreeToAll?.()]
    if (typeof w.CookieInformation?.submitAllCategories === 'function') {
      return ['cookieinformation', () => w.CookieInformation?.submitAllCategories?.()]
    }
    return null
  }
  const bannerVisible = (rs: (Document | ShadowRoot)[]) => {
    for (const sel of cfg.containers) {
      for (const root of rs) {
        for (const el of Array.from(root.querySelectorAll(sel))) if (visible(el)) return sel
      }
    }
    for (const root of rs) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (getComputedStyle(el).position !== 'fixed' || !visible(el)) continue
        const text = el.innerText || ''
        if (text.length < 3000 && bannerRe.test(text)) return 'fixed:' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      }
    }
    return null
  }
  const isBackdrop = (cs: CSSStyleDeclaration) => {
    const match = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
    const alpha = match ? Number((match[1]!.split(',')[3] || '1').trim()) : 0
    return (alpha > 0.05 && alpha < 0.95) || (cs.backdropFilter !== '' && cs.backdropFilter !== 'none')
  }
  const dismissModals = () => {
    const closed: string[] = []
    const area = innerWidth * innerHeight
    for (const root of roots()) {
      for (const box of Array.from(
        root.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open], [class*="modal"], [class*="popup"], [class*="overlay"]'),
      )) {
        if (!visible(box)) continue
        const rect = box.getBoundingClientRect()
        if (rect.width * rect.height < area * 0.15) continue
        for (const el of Array.from(box.querySelectorAll<HTMLElement>('button, [role="button"], a'))) {
          const txt = norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText)
          if (!txt || txt.length > 30 || !closeRe.test(txt) || !safeLink(el) || !visible(el)) continue
          el.click()
          closed.push(txt)
          break
        }
      }
    }
    return closed
  }
  const describe = (el: Element, classCount: number) => {
    const cls = classOf(el).trim()
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.split(/\s+/).slice(0, classCount).join('.') : '')
  }
  const cleanup = () => {
    let removed = 0
    for (const root of roots()) {
      for (const sel of cfg.containers) {
        for (const el of Array.from(root.querySelectorAll(sel))) {
          out.what.push(sel)
          el.remove()
          removed++
        }
      }
    }
    const area = innerWidth * innerHeight
    for (const el of Array.from(document.body ? document.body.querySelectorAll<HTMLElement>('*') : [])) {
      if (!el.isConnected) continue
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' || !visible(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width * rect.height < area * 0.02) continue
      const text = el.innerText || ''
      const covers = rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.9
      const backdrop =
        covers && removed > 0 && text.trim().length < 20 && !el.querySelector('img,video,canvas,picture,iframe') && isBackdrop(cs)
      if ((text.length < 3000 && bannerRe.test(text)) || boxRe.test(el.id + ' ' + classOf(el)) || backdrop) {
        out.what.push(describe(el, 2))
        el.remove()
        removed++
      }
    }
    for (const root of roots()) {
      for (const el of Array.from(
        root.querySelectorAll('div, section, aside, dialog, form, [role="dialog"], [role="region"]'),
      )) {
        if (!el.isConnected || el === document.body) continue
        const tag = (el.id || '') + ' ' + classOf(el) + ' ' + (el.getAttribute('aria-label') || '')
        if (!hiddenRe.test(tag)) continue
        if ((el.textContent || '').length > 3000 || el.querySelector('main, article, h1')) continue
        out.what.push('dom:' + describe(el, 1))
        el.remove()
        removed++
      }
    }
    if (removed > 0) {
      for (const node of [document.documentElement, document.body]) {
        if (!node) continue
        const cs = getComputedStyle(node)
        if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') node.style.setProperty('overflow', 'auto', 'important')
        if (cs.position === 'fixed') node.style.setProperty('position', 'static', 'important')
      }
      document.documentElement.classList.remove('sp-message-open', 'didomi-popup-open', 'ot-overflow-hidden')
    }
    return removed
  }
  return (async () => {
    try {
      if (phase === 'accept') {
        const deadline = t0 + cfg.maxWaitMs
        while (Date.now() < deadline) {
          const rs = roots()
          const bySelector = findBySelector(rs)
          if (bySelector) {
            out.method = 'selector'
            out.target = bySelector.sel
            later(() => bySelector.el.click())
            break
          }
          const byText = findByText(rs)
          if (byText) {
            out.method = 'text'
            out.target = byText.txt
            later(() => byText.el.click())
            break
          }
          const api = apis()
          if (api && Date.now() - t0 > cfg.apiAfterMs) {
            out.method = 'api'
            out.target = api[0]
            later(api[1])
            break
          }
          if (Date.now() - t0 > cfg.quietMs && !bannerVisible(rs)) {
            out.method = 'none-visible'
            break
          }
          const iframeCmp = cfg.iframeContainers.find((sel) =>
            rs.some((root) => Array.from(root.querySelectorAll(sel)).some(visible)),
          )
          if (iframeCmp) {
            out.method = 'iframe-cmp'
            out.target = iframeCmp
            break
          }
          await sleep(250)
        }
      } else {
        out.closed = dismissModals()
        if (out.closed.length) await sleep(400)
        out.removed = cleanup()
        out.visibleAfter = bannerVisible(roots())
      }
    } catch (error) {
      out.error = String(error instanceof Error ? error.message : error)
    }
    out.ms = Date.now() - t0
    return out
  })()
}

export function consentScript(phase: ConsentPhase): string {
  const cfg: ConsentConfig = {
    ...WORDS,
    acceptSelectors: ACCEPT_SELECTORS,
    containers: CMP_CONTAINERS,
    iframeContainers: ['div[id^="sp_message_container"]', '.truste_overlay'],
    maxWaitMs: 5000,
    quietMs: 1500,
    apiAfterMs: 2500,
  }
  return `(${consentPage.toString()})(${JSON.stringify(phase)}, ${JSON.stringify(cfg)})`
}

export const CONSENT_SETTLE_MS = 1500
export const CONSENT_AFTER_CLICK_MS = 2000

export function scrapeLocale(country: string | undefined): { country: string; locale: string } | null {
  const code = country?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return null
  return { country: code, locale: `${countryLanguages(code)[0] ?? 'en'}-${code}` }
}
