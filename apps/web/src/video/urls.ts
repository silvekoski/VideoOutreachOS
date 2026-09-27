export function shareUrl(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('preview')
  url.hash = ''
  return url.toString()
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/iu.test(text) ? text : `https://${text}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//iu, '').replace(/^www\./iu, '').replace(/\/$/u, '')
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/gu, '')}`
}
