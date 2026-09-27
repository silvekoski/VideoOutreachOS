import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { log } from './log.ts'
import type { MgxSeed } from './seed.ts'
import { sendText, serveStatic, type StaticMount } from './static-files.ts'
import { buildMcpServer } from './tools.ts'

export interface MgxServerOptions {
  seed: MgxSeed
  seedDir: string
  storageDir: string
  publicUrl: string | null
}

function jsonRpcError(res: ServerResponse, status: number, message: string): void {
  res
    .writeHead(status, { 'content-type': 'application/json', ...(status === 405 ? { allow: 'POST' } : {}) })
    .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

export function createMgxServer(options: MgxServerOptions): Server {
  const submissionsFile = path.join(options.storageDir, 'data', 'mgx-submissions.jsonl')
  const logos: StaticMount = { prefix: '/logos/', root: path.join(options.seedDir, 'logos') }
  const allowedOriginHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (options.publicUrl !== null) allowedOriginHosts.add(new URL(options.publicUrl).hostname)

  const baseUrl = (req: IncomingMessage): string => {
    if (options.publicUrl !== null) return options.publicUrl
    const fromHost = req.headers.host ? URL.parse(`http://${req.headers.host}`)?.origin : undefined
    return fromHost ?? `http://127.0.0.1:${req.socket.localPort}`
  }

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin
    if (origin !== undefined && !allowedOriginHosts.has(URL.parse(origin)?.hostname ?? '')) {
      return jsonRpcError(res, 403, 'Origin not allowed')
    }
    if (req.method !== 'POST') return jsonRpcError(res, 405, 'Method not allowed')
    const mcp = buildMcpServer({ seed: options.seed, logoBaseUrl: baseUrl(req), submissionsFile })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      mcp.close().catch((error: unknown) => log.warn('MCP server close failed', { error }))
    })
    await mcp.connect(transport)
    await transport.handleRequest(req, res)
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = URL.parse(req.url ?? '/', 'http://localhost')
    if (url === null) return sendText(res, 400, 'Bad request')
    if (url.pathname === '/mcp') return handleMcp(req, res)
    if (url.pathname.startsWith(logos.prefix)) return serveStatic(req, res, url, logos)
    if (url.pathname === '/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed', { allow: 'GET, HEAD' })
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}')
      return
    }
    sendText(res, 404, 'Not found')
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log.error('request failed', { method: req.method, url: req.url, error })
      if (res.headersSent) res.destroy()
      else sendText(res, 500, 'Internal server error')
    })
  })
}
