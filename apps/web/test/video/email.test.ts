import { describe, expect, it } from 'vitest'
import { bookSchema } from '@mergero/shared'
import { isEmail } from '../../src/video/email.ts'

const START = '2026-09-28T06:00:00.000Z'

describe('isEmail', () => {
  it.each([
    'matti@acme.fi',
    'hans.meier@firma.de',
    "o'brien+test@mail.example.co.uk",
    'a_b-c@sub-domain.example.com',
    'hans@firma',
    'hans@firma.d',
    '.hans@firma.de',
    'hans.@firma.de',
    'hans..meier@firma.de',
    'hans meier@firma.de',
    'hans@-firma.de',
    'hans@firma..de',
    'hans@@firma.de',
    'ä@firma.de',
    `${'a'.repeat(245)}@firma.de`,
    `${'a'.repeat(246)}@firma.de`,
  ])('agrees with the booking schema for %j', (email) => {
    expect(isEmail(email)).toBe(bookSchema.safeParse({ start: START, email }).success)
  })

  it('rejects the address from the audit that the browser accepts', () => {
    expect(isEmail('hans@firma')).toBe(false)
  })
})
