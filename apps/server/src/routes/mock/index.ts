import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { z } from 'zod'

const seedSchema = z.object({
  companies: z.record(
    z.string(),
    z.object({ revenue: z.number(), profit: z.number(), fiscalYear: z.int() }),
  ),
})

type Companies = z.infer<typeof seedSchema>['companies']

export function createMockRoutes(seedFile: string): Hono {
  const app = new Hono()
  let companies: Promise<Companies> | null = null
  const load = (): Promise<Companies> =>
    (companies ??= readFile(seedFile, 'utf8')
      .then((text) => seedSchema.parse(JSON.parse(text)).companies)
      .catch((error: unknown) => {
        companies = null
        throw new Error(`The Asiakastieto seed ${seedFile} could not be read`, { cause: error })
      }))

  app.get('/mock/asiakastieto/:businessId', async (c) => {
    const businessId = c.req.param('businessId').trim()
    const data = await load()
    const record = Object.hasOwn(data, businessId) ? data[businessId] : undefined
    if (!record) return c.json({ error: `No financial data for the business ID ${businessId}` }, 404)
    return c.json({ businessId, ...record })
  })

  return app
}
