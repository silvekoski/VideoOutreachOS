import type { ScriptContext } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { ModelError } from '../../src/providers/featherless.ts'
import { FakeModel } from '../../src/providers/model-fake.ts'

const context: ScriptContext = {
  lang: 'fi',
  company: 'Acme Oy',
  ownerFirstName: 'Matti',
  analystName: 'Aino Analyst',
  buyerNames: ['Nordic Capital', 'Baltic Industries'],
  buyerCount: 2,
  figures: { source: 'ask_in_form' },
  calculator: false,
  lines: ['Acme valmistaa metallirakenteita.', 'Yritys toimii Tampereella.', 'Asiakkaat ovat teollisuudessa.'],
  linesSource: 'model',
  hasWebsite: true,
  dealTexts: ['Konepaja myytiin strategiselle ostajalle.'],
  country: 'FI',
}

function ask(user: unknown, schemaName = 'slide-script') {
  return new FakeModel().completeJson({ system: 'x', user: JSON.stringify(user), schemaName, schema: {}, maxTokens: 100 })
}

describe('FakeModel', () => {
  it('answers each task in the output shape of the real model', async () => {
    const script = (await ask({ task: 'slide-script', slide: 2, context, facts: {} })) as { script: unknown }
    expect(typeof script.script).toBe('string')
    expect(String(script.script).length).toBeGreaterThan(0)

    const markdown = 'Acme Oy valmistaa metallirakenteita teollisuudelle. Yritys on perustettu 1985. Tehdas on Tampereella.'
    const lines = (await ask({ task: 'company-lines', lang: 'fi', company: 'Acme Oy', text: markdown }, 'company-lines')) as {
      lines: unknown[]
    }
    expect(lines.lines).toHaveLength(3)
    expect(lines.lines.every((line) => typeof line === 'string' && line.length > 0)).toBe(true)
  })

  it('keeps the original texts for a translation', async () => {
    const texts = [
      { id: 'buyer:b1', text: 'Buys metal workshops', max: 80 },
      { id: 'deal:d1', text: 'A machine shop with 48 staff was sold', max: 90 },
    ]
    expect(await ask({ task: 'translate-texts', lang: 'fi', texts }, 'translate-texts')).toEqual({
      texts: [
        { id: 'buyer:b1', text: 'Buys metal workshops' },
        { id: 'deal:d1', text: 'A machine shop with 48 staff was sold' },
      ],
    })
  })

  it('rejects a request that is not one of the known shapes', async () => {
    const error = await ask({ task: 'slide-script', slide: 1, context }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelError)
    expect(error).toMatchObject({ retryable: false, code: 'bad_request', provider: 'fake-model' })
    await expect(
      new FakeModel().completeJson({ system: 'x', user: 'not json', schemaName: 's', schema: {}, maxTokens: 1 }),
    ).rejects.toBeInstanceOf(ModelError)
  })
})
