MCP TypeScript SDK 1.x spike report (2026-09-26)

Spike folder: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/mcp
I did not change /Users/veikka/prompt-marketing-hackathon-monorepo. All code below ran on Node v26.3.0 with pnpm 10.13.1 on macOS.

FILES (absolute paths, all run successfully)
- .../spikes/mcp/schemas.ts: shared zod v4 input and output schemas for the 3 tools. The server and the client both import it.
- .../spikes/mcp/sales-video-server.ts: buildServer() registers list_templates, create_video_job and get_video_job.
- .../spikes/mcp/server-node-http.ts: stateless Streamable HTTP on plain node:http, no express. This is the primary server.
- .../spikes/mcp/server-express.ts: stateless variant with the SDK helper createMcpExpressApp().
- .../spikes/mcp/server-stateful.ts: stateful variant with session IDs. Used only for the reconnect test.
- .../spikes/mcp/client.ts: connects by URL, lists tools, calls tools, reads structuredContent, closes.
- .../spikes/mcp/reconnect.ts: starts the server as a child process, stops it, restarts it, and shows the reconnect behavior. Run it as `node reconnect.ts server-node-http.ts|server-stateful.ts`.
- .../spikes/mcp/edge-cases.ts: in-memory tests for validation errors, zod/v3, zod/mini and client-side validation.
- .../spikes/mcp/zod3/zod3-check.ts: a separate install where zod@3.25.76 is the project zod.
- .../spikes/mcp/gotchas/*.ts: small repros for the type-import failure and the stateful shutdown hang.
- .../spikes/mcp/package.json (scripts: typecheck, server, server:express, server:stateful, client, reconnect:stateless, reconnect:stateful, edge-cases) and tsconfig.json.

1. VERSIONS (VERIFIED with npm view and the installed tree)
- @modelcontextprotocol/sdk 1.30.1 is dist-tag latest, published 2026-09-23. 1.30.0 was published 2026-07-27.
- Hard dependencies of the SDK: express ^5.2.1 (resolved 5.2.1), hono ^4.11.4 (4.13.9), @hono/node-server "^1.19.9 || ^2.0.5" (2.1.1), ajv ^8.17.1 (8.20.0), ajv-formats ^3.0.1, zod-to-json-schema ^3.25.1, cors, express-rate-limit, jose, eventsource, pkce-challenge, cross-spawn, raw-body, content-type.
- Peer dependencies: zod "^3.25 || ^4.0" (required), @cfworker/json-schema ^4.1.1 (optional).
- engines: node >=18.
- Other resolved versions: zod 4.6.5, tsx 4.23.15, typescript 7.0.2, @types/node 26.6.3, @types/express 5.0.6.
- Protocol constants in 1.30.1 (types.js): LATEST_PROTOCOL_VERSION = '2025-11-25'. SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'].
- DEFAULT_REQUEST_TIMEOUT_MSEC = 60000.

2. DECISION POINT: SDK v2 IS THE STABLE LINE (VERIFIED: npm metadata and the GitHub main README)
- Split packages are published:
  - @modelcontextprotocol/server 2.1.0
  - @modelcontextprotocol/client 2.1.0
  - @modelcontextprotocol/node 2.1.0
  - @modelcontextprotocol/express 2.0.1
- 2.0.0 was published 2026-07-27 and 2.1.0 on 2026-09-23.
- The main README says v2 is "the stable release line", released with the 2026-07-28 MCP spec. It also says v1.x "continues to receive bug fixes and security updates for at least 6 months after v2's release".
- v2 server and client need zod ^4.2.0. The README says v2 schemas use Standard Schema (zod v4, Valibot, ArkType).
- 1.30.1 does not list '2026-07-28' in SUPPORTED_PROTOCOL_VERSIONS (VERIFIED). A 1.x client against a v2 server, or the reverse, is UNVERIFIED. I did not spike v2.

3. ZOD MAJOR (VERIFIED by running)
- The SDK accepts both zod v3 and v4 schemas. The type is AnySchema = z3.ZodTypeAny | z4.$ZodType, from '@modelcontextprotocol/sdk/server/zod-compat.js'.
- Tested and working:
  a) zod 4.6.5 with `import * as z from 'zod'` (v4 classic): raw shapes and z.object() both work for inputSchema and outputSchema.
  b) `import { z as z3 } from 'zod/v3'` inside the zod 4 package works.
  c) `import * as zm from 'zod/mini'` works (zm.object).
  d) A separate project with zod@3.25.76 and `import { z } from 'zod'` (v3 API) passes tsc and runs.
- zod older than 3.25 is outside the peer range and was not tested.
- The SDK imports 'zod/v4' and 'zod/v4-mini' internally.
- JSON Schema output (VERIFIED):
  - Every schema is draft-07 ("$schema": "http://json-schema.org/draft-07/schema#").
  - zod v4 input schemas have no additionalProperties:false. zod v4 output schemas have additionalProperties:false.
  - zod v3 (through zod-to-json-schema) sets additionalProperties:false on both.
  - z.uuid() gives format "uuid" plus a pattern. z.iso.datetime() gives format "date-time" plus a pattern. z.url() gives format "uri". z.number().int() gives "type":"integer" with maximum 9007199254740991.
- Recommendation: use zod 4 and keep one copy in the monorepo. The SDK FAQ says multiple zod copies can cause TS2589 "Type instantiation is excessively deep".
- TypeScript 7.0.2 checks all spike files with strict: true and no skipLibCheck, with 0 errors in about 1.1 s (VERIFIED).

4. EXACT IMPORTS (VERIFIED, ESM, the ".js" suffix is required)
- import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
- import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';   (node:http and express)
- import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';   (Fetch API: handleRequest(req: Request, options?) => Promise<Response>. Signature VERIFIED in the .d.ts. Not run.)
- import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
- import { hostHeaderValidation, localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';   (express middleware)
- import { Server } from '@modelcontextprotocol/sdk/server/index.js';   (low-level)
- import { Client } from '@modelcontextprotocol/sdk/client/index.js';
- import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
- import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';   (tests: InMemoryTransport.createLinkedPair())
- import { ErrorCode, McpError, CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
- import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';   (use `import type`, see section 10)
- The export map has a "./*" entry to dist/esm/*, so any deep path with ".js" resolves. CJS "require" builds also exist.

5. IS EXPRESS REQUIRED? No (VERIFIED)
- StreamableHTTPServerTransport.handleRequest(req: IncomingMessage & { auth?: AuthInfo }, res: ServerResponse, parsedBody?: unknown): Promise<void> works with plain node:http. Internally it uses @hono/node-server getRequestListener.
- Without parsedBody, the transport reads the body itself. The cap is maxRequestBodySize, default 4194304 bytes (4 MiB), and a larger body gets HTTP 413.
- express 5.2.1 is still installed, because it is a hard dependency of the SDK.
- Under pnpm, your own code cannot import 'express' unless you add it to your package.json. `node` gave ERR_MODULE_NOT_FOUND "Cannot find package 'express'" (VERIFIED).
- createMcpExpressApp() works without that step, because the SDK imports express itself.
- For express types you need @types/express, because express 5.2.1 ships no "types" field (VERIFIED in its package.json).
- What createMcpExpressApp(options?: { host?: string; allowedHosts?: string[] }): Express does (VERIFIED in source and at runtime):
  - Default host is '127.0.0.1'.
  - For '127.0.0.1', 'localhost' or '::1', it adds localhostHostValidation(), which allows the Host names localhost, 127.0.0.1 and [::1]. A bad Host gets 403 {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}.
  - It then adds express.json(). The body-parser 2.3.0 default limit is 100 kb (102400 bytes), which is lower than the 4 MiB transport default.
  - `host` only selects the middleware. You still pass the host to app.listen().
- The SDK docs and example servers use express. The Streamable HTTP spec also says servers MUST validate the Origin header. Neither the express helper nor my node:http server checks Origin. I only read this in the docs and did not implement it.

6. SERVER FILE: server-node-http.ts (VERIFIED, runs with `node server-node-http.ts` and with tsx)
```
import { createServer, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './sales-video-server.ts';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3333);
const allowedHostnames = new Set(['127.0.0.1', 'localhost', '[::1]']);

const jsonRpcError = (res: ServerResponse, status: number, code: number, message: string) =>
  res
    .writeHead(status, { 'content-type': 'application/json', ...(status === 405 && { allow: 'POST' }) })
    .end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));

const httpServer = createServer(async (req, res) => {
  if (URL.parse(req.url ?? '', 'http://x')?.pathname !== '/mcp') return void res.writeHead(404).end();
  const hostname = URL.parse(`http://${req.headers.host ?? ''}`)?.hostname;
  if (!hostname || !allowedHostnames.has(hostname)) return jsonRpcError(res, 403, -32000, 'Invalid Host header');
  if (req.method !== 'POST') return jsonRpcError(res, 405, -32000, 'Method not allowed');

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: process.env.MCP_JSON === '1',
  });
  res.on('close', () => void server.close());
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP request failed', error);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
  }
});

httpServer.listen(port, host, () => console.log(`listening http://${host}:${port}/mcp`));

const shutdown = () => httpServer.close(() => process.exit(0));
process.once('SIGINT', shutdown).once('SIGTERM', shutdown);
```

Tool registration pattern from sales-video-server.ts (VERIFIED):
```
server.registerTool(
  'create_video_job',
  {
    title: 'Create video job',
    description: 'Queue a personalized video render for one prospect.',
    inputSchema: createVideoJobInput,    // z.object({...}) or a raw shape { key: zodType }
    outputSchema: createVideoJobOutput,  // z.object({...}) or a raw shape
  },
  async ({ templateId }) => {            // args are typed from inputSchema, defaults applied
    ...
    return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
  },
);
```
- Signature (VERIFIED in mcp.d.ts): registerTool<OutputArgs extends ZodRawShapeCompat | AnySchema, InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(name: string, config: { title?; description?; inputSchema?: InputArgs; outputSchema?: OutputArgs; annotations?: ToolAnnotations; _meta?: Record<string, unknown> }, cb: ToolCallback<InputArgs>): RegisteredTool.
- The handler gets (args, extra). extra includes sessionId, signal and more.
- server.tool() is deprecated. Use registerTool.
- McpServer turns on the capability {"tools":{"listChanged":true}} by itself.
- structuredContent must be an object, so wrap an array: { templates: [...] }. Also put the same JSON in a text content block for older clients (the docs pattern).
- With a stateless server, state must live at module level, outside buildServer(), because each request gets a new McpServer. Proof at runtime: a job created in one HTTP request was found in the next request.

7. WIRE FORMAT (VERIFIED with curl against server-node-http.ts)
- Endpoint: POST http://127.0.0.1:3333/mcp.
- Request headers: content-type: application/json and accept: application/json, text/event-stream. After initialize, the SDK client also sends mcp-protocol-version: 2025-11-25. A stateful server adds mcp-session-id.
- Default response for a request: content-type: text/event-stream, with the body `event: message` then `data: {"result":{...},"jsonrpc":"2.0","id":N}`.
- With enableJsonResponse: true: content-type: application/json with a plain JSON-RPC body.
- The tools/call result shape: {"result":{"content":[{"type":"text","text":"..."}],"structuredContent":{"templates":[...]}},"jsonrpc":"2.0","id":2}
- A stateless server accepts tools/call without an earlier initialize.
- Accept without text/event-stream: HTTP 406, {"jsonrpc":"2.0","error":{"code":-32000,"message":"Not Acceptable: Client must accept both application/json and text/event-stream"},"id":null}
- Bad mcp-protocol-version: HTTP 400, "Bad Request: Unsupported protocol version: 1999-01-01 (supported versions: ...)".
- GET and DELETE: my server returns 405 with allow: POST, as the official stateless example does. The SDK client treats a 405 on its GET SSE stream as normal.

8. CLIENT FILE: client.ts (VERIFIED with node and tsx)
```
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createVideoJobOutput, getVideoJobOutput, listTemplatesOutput } from './schemas.ts';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:3333/mcp');
const client = new Client({ name: 'sales-video-client', version: '0.1.0' });
const started = performance.now();

await client.connect(new StreamableHTTPClientTransport(url));
try {
  console.log('server', client.getServerVersion(), 'capabilities', JSON.stringify(client.getServerCapabilities()));
  const { tools } = await client.listTools();
  for (const tool of tools) console.log('tool', tool.name, JSON.stringify({ input: tool.inputSchema, output: tool.outputSchema }));
  const listed = await client.callTool({ name: 'list_templates', arguments: { aspectRatio: '9:16' } });
  const { templates } = listTemplatesOutput.parse(listed.structuredContent);
  const created = await client.callTool({
    name: 'create_video_job',
    arguments: { templateId: templates[0].id, prospect: { firstName: 'Aino', company: 'Nokia', websiteUrl: 'https://www.nokia.com' } },
  });
  const { jobId } = createVideoJobOutput.parse(created.structuredContent);
  const status = await client.callTool({ name: 'get_video_job', arguments: { jobId } });
  console.log('get_video_job', JSON.stringify(getVideoJobOutput.parse(status.structuredContent)));
  const bad = await client.callTool({ name: 'get_video_job', arguments: { jobId: 'not-a-uuid' } });
  console.log('invalid input', JSON.stringify(bad));
} finally {
  await client.close();
}
```
(The file on disk has more console.log lines. The logic is the same.)

Output from the run: {"jobId":"fd7d7b34-...","status":"queued","createdAt":"2026-09-26T16:46:38.520Z"}, then get_video_job {"status":"rendering","progress":0.0006...}. The invalid input gave {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Invalid arguments for tool get_video_job: Invalid UUID at jobId"}],"isError":true}.

API notes:
- Constructors: new Client(clientInfo: { name, version }, options?) and new StreamableHTTPClientTransport(url: URL, opts?: { requestInit?, fetch?, authProvider?, reconnectionOptions?, sessionId? }).
- callTool(params: { name, arguments? }, resultSchema?, options?: RequestOptions). RequestOptions = { timeout? (default 60000 ms), signal?, onprogress?, resetTimeoutOnProgress?, maxTotalTimeout?, ... }.
- structuredContent is typed as Record<string, unknown> | undefined. Parse it with the shared zod schema to get a typed value.
- The client has a `client.transport` getter.
- One full run (connect, list, 4 calls, close) took about 80 ms. `node client.ts` exits in 0.21 s wall time, and no keep-alive socket holds the process open.

Tool error semantics (VERIFIED in edge-cases.ts):
- These cases all come back as a normal result with isError: true. They are not JSON-RPC errors, so callTool does not throw:
  - input validation failure ("MCP error -32602: Input validation error: ...")
  - output validation failure ("Output validation error: Invalid structured content ...")
  - outputSchema without structuredContent ("... has an output schema but no structured content was provided")
  - unknown tool ("Tool nope not found")
  - a handler that throws (text is the error message, "render farm offline")
- When isError is true, the SDK skips output validation.
- Client-side validation: after listTools(), callTool checks structuredContent against the cached outputSchema (ajv, strict false, with ajv-formats). On a mismatch it throws McpError -32602 "Structured content does not match the tool's output schema: data/n must be number". Before listTools() there is no client-side check.

9. CLOSING CONNECTIONS CLEANLY (VERIFIED unless marked)
- Client: `await client.close()` aborts in-flight fetches through an AbortController and fires client.onclose. It finished in 1 ms.
- Stateful client: call `await (client.transport as StreamableHTTPClientTransport).terminateSession()` first. It sends HTTP DELETE with mcp-session-id, and the server fired onsessionclosed.
- A StreamableHTTPClientTransport cannot be started again after close(). start() throws "StreamableHTTPClientTransport already started!", because _abortController is not reset (read in source). Always create a new transport for each connect.
- The same Client instance can connect again after close() (VERIFIED).
- Log noise: if you close right after an SSE-mode call, client.onerror gets "SSE stream disconnected: AbortError: This operation was aborted". It does no harm. With enableJsonResponse: true it does not appear. Ignore AbortError in onerror.
- Server, per request: `res.on('close', () => void server.close())`. McpServer.close() also closes its transport.
- Stateless rule: create a new McpServer and a new transport for each request.
  - Reusing the transport throws "Stateless transport cannot be reused across requests. Create a new transport per request." (read in source).
  - Connecting a connected McpServer again throws "Already connected to a transport. Call close() before connecting to a new transport..." (read in source).
- Server process, stateless: httpServer.close() is sufficient on Node 26, because it closes idle keep-alive sockets. The process exited 44 ms after SIGTERM.
- Server process, stateful: close every session transport before httpServer.close().
  - Without that step, with a client that holds the GET SSE stream, the process was still running 6 s after SIGTERM (repro: gotchas/stateful-no-session-close.ts).
  - With it, the process exited in 96 ms.
- Stateful sessions are removed only on DELETE or transport close. There is no idle timeout, so add a timeout yourself (UNVERIFIED as a leak test, based on the code in server-stateful.ts).

10. RECONNECT AFTER SERVER RESTART (VERIFIED with reconnect.ts)
- While the server is down, callTool rejects with TypeError "fetch failed" and cause.code 'ECONNREFUSED', and client.onerror gets the same error.
- The Client stays "connected": the transport is still set and onclose does not fire.
- A connect() to a dead server also throws TypeError "fetch failed".
- Stateless: after the restart, the same Client works with no reconnect step, because there is no session.
- Stateful: after the restart, the old session gets HTTP 404. callTool throws StreamableHTTPError with code 404 and the message 'Streamable HTTP error: Error POSTing to endpoint: {..."Session not found"...}'. The fix: client.close(), then client.connect(new StreamableHTTPClientTransport(url)). This sends a new initialize and gets a new session ID.
- Client.connect() skips initialize when transport.sessionId is already set (read in source). Pass { sessionId } to the transport only to resume a session that still exists.
- The built-in reconnectionOptions only apply to the resumption of the GET SSE stream. The defaults are initialReconnectionDelay 1000, maxReconnectionDelay 30000, reconnectionDelayGrowFactor 1.5, maxRetries 2. After the server died, the client logged "Failed to reconnect SSE stream: fetch failed" and then "Maximum reconnection attempts (2) exceeded." The POST path does not retry.
- The cached output validators are not cleared on close. Call listTools() after a reconnect to refresh them (read in source).

Tested helper from reconnect.ts:
```
async function connect(client: Client, attempts = 5, delayMs = 200) {
  for (let attempt = 1; ; attempt++) {
    try { await client.connect(new StreamableHTTPClientTransport(url)); return; }
    catch (error) { if (attempt >= attempts) throw error; await sleep(delayMs * 2 ** (attempt - 1)); }
  }
}
const isConnectionError = (error: unknown) =>
  (error instanceof TypeError && error.message === 'fetch failed') ||
  (error instanceof StreamableHTTPError && error.code === 404) ||
  (error instanceof McpError && error.code === ErrorCode.ConnectionClosed);
async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  try { return await client.callTool({ name, arguments: args }); }
  catch (error) {
    if (!isConnectionError(error)) throw error;
    await client.close();
    await connect(client);
    await client.listTools();
    return client.callTool({ name, arguments: args });
  }
}
```
Do not retry a tool call that is not idempotent, such as create_video_job, without an idempotency key. This is a design note and was not tested.

11. NODE v26.3.0: NATIVE TYPE STRIPPING vs TSX (VERIFIED)
- Both work for the servers and the client.
- `node file.ts` works with no flag and no warning. process.features.typescript is 'strip' and amaro is 1.1.9.
- Native stripping has four rules:
  (a) Use `import type` for type-only imports. `import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'` fails at runtime with "SyntaxError: The requested module ... does not provide an export named 'CallToolResult'". tsx accepts it.
  (b) Relative imports need the ".ts" extension.
  (c) Use only erasable syntax: no enums, namespaces or parameter properties.
  (d) No path aliases.
- A tsconfig that catches all of this at typecheck (tsc gave TS1484 for the bad imports): module and moduleResolution "nodenext", strict, noEmit, allowImportingTsExtensions, verbatimModuleSyntax, erasableSyntaxOnly, types ["node"].
- tsx 4.23.15 needs no config. pnpm printed "Ignored build scripts: esbuild", but tsx still ran.
- Recommendation: use native `node` with the tsconfig above, and tsc for type checks. Keep tsx only if you need non-erasable syntax.

12. OTHER GOTCHAS
- A tool that has any inputSchema, even the empty raw shape {}, rejects a call that has no `arguments` key: "Input validation error: ... expected object, received undefined". Always send arguments: {} (VERIFIED).
- zod v4 input objects strip unknown keys, and their JSON Schema has no additionalProperties:false. Clients can send extra fields without an error (VERIFIED for the schema output, and the strip behavior is standard zod).
- The express.json() limit of 100 kb is lower than the 4 MiB transport default. Raise it if tool arguments can be large.
- The docs link to the 2025-11-25 transport spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports (VERIFIED in docs/server.md at tag 1.30.1).
- Sources I read: the README, docs/server.md, docs/client.md, docs/faq.md and src/examples/server/simpleStatelessStreamableHttp.ts at tag 1.30.1 (raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/1.30.1/...), the GitHub main README for v2, and the installed dist/esm sources.

UNVERIFIED
- 1.x and v2 interoperability.
- WebStandardStreamableHTTPServerTransport at runtime.
- Behavior with an OAuth authProvider.
- The idle session leak in stateful mode.
