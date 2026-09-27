FEATHERLESS AI + KIMI-K3 RESEARCH REPORT (checked 2026-09-26, about 16:40 UTC)

Legend: VERIFIED-RUN means I ran it. VERIFIED-DOC means I read it in official docs (Featherless, Moonshot/Kimi, Hugging Face repo, vLLM recipe). UNVERIFIED means third-party evidence or inference. No API key was available, so I made no authenticated inference call.

1. ENDPOINT, AUTH, HEADERS
- Base URL: https://api.featherless.ai/v1. The API is designed to be OpenAI compatible. [VERIFIED-DOC]
- Chat endpoint: POST https://api.featherless.ai/v1/chat/completions. Text endpoint: POST /v1/completions. [VERIFIED-DOC]
- Auth header: "Authorization: Bearer $FEATHERLESS_API_KEY". [VERIFIED-DOC examples, VERIFIED-RUN]
  - The docs overview page has a typo ("Authentication: Bearer"). Use Authorization.
  - With no header, the server returns 401. With a bad key, it also returns 401 plus the header `www-authenticate: Bearer realm="Users", error="invalid_token"`. [VERIFIED-RUN]
- Required headers: Authorization and Content-Type: application/json. [VERIFIED-DOC]
- Requested but optional: HTTP-Referer (your app URL) and X-Title (your app title). [VERIFIED-DOC]
- Each response has a `request-id: <uuid>` header. Log it for support. [VERIFIED-RUN]
- The API sits behind Cloudflare (`server: cloudflare`, `cf-ray`). [VERIFIED-RUN]

2. MODEL ID AND LIVE METADATA
- Exact model id: "moonshotai/Kimi-K3". It is case sensitive: GET /v1/models/moonshotai/kimi-k3 returns 404. [VERIFIED-RUN]
- GET https://api.featherless.ai/v1/models/moonshotai/Kimi-K3 needs no auth and returned: [VERIFIED-RUN]
  {"id":"moonshotai/Kimi-K3","model_class":"kimi3-2780b","context_length":262144,"concurrency_cost":4,"pricing":{"prompt":"0.000003","completion":"0.000015","image":"0","request":"0","input":3,"output":15},"features":{"tool_use":true,"image_input":true},"status":"active","availability":{"tier":"warm","is_hot_live":true,...},"parameter_size":2780000000000,"is_moe":true,"active_parameters":104,"vision_supported":true,"created":1785207017}
  - `created` is 2026-07-28.
  - The response has NO `max_completion_tokens` field. The docs say that field is where the max output limit appears.
- Unknown id: HTTP 404 `{"error":{"message":"Model not found","type":"invalid_request_error","param":null,"code":"model_not_found"}}`. [VERIFIED-RUN]
- Moonshot's own API uses a different id and base URL: "kimi-k3" at https://api.moonshot.ai/v1. Do not mix them. [VERIFIED-DOC]

3. CONTEXT AND OUTPUT LIMITS
- Featherless serves Kimi-K3 at 262144 tokens (prompt plus completion). The model page shows "Context Size: 256k" and the docs table shows "Kimi 3 | kimi3-2780b | 262144 | 4". [VERIFIED-RUN, VERIFIED-DOC]
- The native model context is 1048576 tokens. Featherless does not serve that. [VERIFIED-DOC, HF README and generation_config]
- The plan also caps context. Featherless Chat allows up to 32K and Developer up to 256K. [VERIFIED-DOC]
  - Effective limit = min(model context_length, plan max_context_length). GET /v1/plan (auth required) returns `{"id","name","max_context_length","max_model_size","concurrency"}`. [VERIFIED-DOC]
- Max output tokens: no number is published for K3. [VERIFIED-RUN, field absent]
  - Docs: a max_tokens above max_completion_tokens is clamped, not rejected. [VERIFIED-DOC]
  - A third party saw Featherless clamp max_tokens to the remaining context instead of returning 400 (LiveBench qwen.yml, another model). [UNVERIFIED]
  - Moonshot's API defaults K3 max_completion_tokens to 131072. [VERIFIED-DOC, Moonshot only]
- Always set max_tokens yourself. Reasoning tokens count toward the budget. [UNVERIFIED for Featherless]

4. OPENAI COMPATIBILITY: DOCUMENTED CHAT FIELDS [VERIFIED-DOC]
- Documented fields: model, messages, presence_penalty, frequency_penalty, repetition_penalty, temperature, top_p, top_k, min_p, seed ("Not reliable"), stop, stop_token_ids, include_stop_str_in_output, max_tokens, min_tokens, chat_template_kwargs.
- Response shape: OpenAI chat.completion (id, object, created, model, choices[].message{role,content}, finish_reason, usage{prompt_tokens, completion_tokens, total_tokens}).
- The page does not list tools, stream, stream_options, response_format or reasoning_effort. Tools are documented on a separate page.
- Streaming with stream_options.include_usage works, and usage.prompt_tokens_details.cached_tokens is present (LiveBench, 2026-08-17, Qwen3.8 on Featherless). [UNVERIFIED]
- The usage object has no cost field (Kiln-AI notes). [UNVERIFIED]

5. STRUCTURED OUTPUT (response_format)
- Featherless has no structured output docs page. /docs/structured-output and /docs/structured-outputs return 404. [VERIFIED-RUN]
- The only official mention of JSON mode: the Tool Calling page and the featherless-ai/featherless-cookbook notebooks use `response_format={"type":"json_object"}` to simulate tools. [VERIFIED-DOC]
  - The cookbook adds that json_object "only supports a single JSON object (not an array)".
- json_schema: not documented. Kiln-AI tested it directly against Featherless: "GLM 5.2 accepts json_schema and silently ignores it ... DeepSeek V4 Pro and Kimi K2.6 return an APIError". [UNVERIFIED]
  - Do not depend on json_schema for Kimi on Featherless.
- The K3 chat encoder (HF encoding_k3.py) handles response_format only at prompt level. I ran it: json_object or json_schema adds a system message of type "response-format" with the schema text. This is not constrained decoding. [VERIFIED-RUN]
  - Whether Featherless forwards response_format into the encoder, or does guided decoding, is unknown. [UNVERIFIED]
- On Moonshot's own API, K3 supports json_schema with strict: true. Parse only message.content, not reasoning_content. [VERIFIED-DOC, Moonshot only]
- LiteLLM's `featherless_ai` provider drops response_format and rejects tools and tool_choice values other than auto/none (read in litellm/llms/featherless_ai/chat/transformation.py). If you need these fields, call Featherless with the OpenAI SDK directly, not through LiteLLM. [VERIFIED-RUN source read]

6. TOOL CALLING
- Supported: `features.tool_use: true`, and the model page says "Tool Calling: Supported". [VERIFIED-RUN, VERIFIED-DOC]
- Request and response use the OpenAI format (tools[].function{name,description,parameters}, message.tool_calls[].function.arguments as a JSON string). [VERIFIED-DOC]
  - The Featherless page's supported-model list is stale (Kimi-K2-Instruct and Qwen 3 only, last edited 2025-08-07).
- The vLLM K3 recipe warns: "K3 occasionally emit a tool-call format its own parser doesn't expect. Suggest to run do schema validation and retry." [VERIFIED-DOC]
- tool_choice "required" was accepted on Featherless for Qwen3.8 (LiveBench). [UNVERIFIED for K3]
- Some Featherless models return tool calls as plain text (voidrot/openai-featherless-compatible). [UNVERIFIED]
- Multi-turn and tool loops must send back the full assistant message, including reasoning_content and tool_calls. [VERIFIED-DOC, HF README and Moonshot docs]
- Recommendation: for "return JSON", do not use tools. Ask for plain JSON content and validate it.

7. REASONING OUTPUT (what to strip)
- K3 always thinks. The default effort is "max". Values are low, high and max. [VERIFIED-DOC]
  - tokenization_kimi.py runs `kwargs.setdefault("thinking_effort", "max")`. [VERIFIED-RUN source read]
- The raw format is XTML special tokens, not `<think>` tags. I ran the official encoder. The generation prompt ends with `<|open|>message role="assistant"<|sep|><|open|>think<|sep|>`. The model then emits `REASONING<|close|>think<|sep|><|open|>response<|sep|>ANSWER<|close|>response<|sep|>`. [VERIFIED-RUN]
- On vLLM, `--reasoning-parser kimi_k3 --tool-call-parser kimi_k3` split the reasoning into its own field. [VERIFIED-DOC, vLLM recipe]
  - Whether Featherless runs that parser for K3 is unknown. [UNVERIFIED]
  - The field name varies:
    - `reasoning_content`: Moonshot docs, and ax-llm's Featherless profile.
    - `reasoning`: LiveBench saw this on Featherless for Qwen3.8. The K3 README example also prints `message.reasoning`.
  - The Featherless chat_template_kwargs doc mentions "server reasoning parser" and "resend the reasoning_content". [VERIFIED-DOC]
- Strategy: read only message.content, ignore both reasoning fields, and still strip leaked `<think>` and XTML markers. See section 12.
- Effort control on Featherless: the documented mechanism is chat_template_kwargs, and "unknown keys are accepted". [VERIFIED-DOC]
  - The K3 encoder key is `thinking_effort` with values "low", "high" and "max". The value "medium" raises AssertionError in the encoder. [VERIFIED-RUN]
  - Send `"chat_template_kwargs": {"thinking_effort": "low"}`. It is unknown if it reaches the K3 encoder on Featherless. [UNVERIFIED]
  - Top-level `reasoning_effort` is Moonshot's field and is not in the Featherless docs. opencodex notes that Featherless reasoning controls are chat_template_kwargs, not reasoning_effort. [UNVERIFIED]
- `thinking: false` (Featherless treats enable_thinking, thinking and do_reasoning as synonyms, and false wins). [VERIFIED-DOC]
  - The K3 encoder has a non-thinking mode: the prompt ends with `<|open|>response<|sep|>`. [VERIFIED-RUN]
  - The model card says K3 always thinks, so quality in that mode is unknown. [UNVERIFIED]

8. CONCURRENCY, PLANS, 429
- K3 concurrent unit cost is 4. A request reserves 4 units while in flight. The units are released on completion or cancellation. [VERIFIED-RUN, VERIFIED-DOC]
- Plans (docs last edited 2026-09-15): [VERIFIED-DOC]
  - Featherless Chat: $25/month, 4 units, context up to 32K. That allows 1 K3 request at a time.
  - Featherless Developer: from $50 credits/month, 100 units, context up to 256K, no model size limit. That allows 25 parallel K3 requests. Only successful requests are billed. Calls are blocked at zero balance; the status code for that is not documented.
  - Business: dedicated GPUs, custom pricing.
- Over budget: "rejected with HTTP 429". [VERIFIED-DOC]
- 429 body, as a test fixture from mlcommons/modelbench PR #1667, relayed through the Hugging Face router: [UNVERIFIED]
  {"error":{"message":"Per-user concurrency limit exceeded. This user has 10 active units; this request requires 2 units (limit: 10, over by 2). Model: dphn/Dolphin-Mistral-24B-Venice-Edition. Please wait for active requests to complete. Visit featherless.ai for higher limits and dedicated access.","type":"invalid_request_error","param":null,"code":"concurrency_limit_exceeded"}}
  - The `{"error":{...}}` wrapper matches the verified 401 wrapper on /v1. Whether a Retry-After header comes with it is unknown. [UNVERIFIED]
- Monitoring endpoints (auth required): [VERIFIED-DOC]
  - GET https://api.featherless.ai/account/concurrency returns a JSON snapshot.
  - GET /account/concurrency/stream returns SSE, one frame every 2 s.
  - Frame shape: `{"limit":8,"used_cost":4,"request_count":1,"requests":[{"id","cost","model","started_at","duration_ms"}]}`. `limit` null means no cap.
  - /account/* errors use another shape: `{"statusCode":401,"message":"...","code":"unauthorized"}`. [VERIFIED-RUN]
- Client rule: use one semaphore per account, sized to floor(plan.concurrency / 4) for K3. Units are shared across all models and processes on the account.

9. OTHER ERRORS [VERIFIED-DOC unless marked]
- 400: model is cold. Warm-up takes 5 min to 1 h. Wait; do not retry fast.
- 401: key not recognized. Body: `{"error":{"message":"You must be signed in to access this resource","type":"invalid_request_error","param":null,"code":"unauthorized"}}`. [VERIFIED-RUN]
- 403: gated model, or model not on your plan (`available_on_current_plan` false). Kiln reports code `model_gated_needs_oauth`. [UNVERIFIED]
- 404: `model_not_found`. [VERIFIED-RUN]
- 500: internal error.
- 503 "Service Temporarily Unavailable / No valid Executor" means capacity is low. Retry the same request. If it persists past 3 retries, treat the model class as down.

10. RATE LIMITS AND TIMEOUTS
- No RPM or TPM limits are documented. Chat plans have "unlimited monthly requests". The concurrency limit is the only throttle. [VERIFIED-DOC]
- The 401 responses had no x-ratelimit headers. [VERIFIED-RUN, 401 responses only]
- No server timeout is documented. [VERIFIED-DOC]
- Featherless targets "a consistent token throughput of > 10 tok/s for all models". So 16384 output tokens can take up to about 27 min at the floor rate. [VERIFIED-DOC]
- Because of Cloudflare, a non-stream call can get HTTP 524 when the origin is silent too long. The Cloudflare default is 100 s; Featherless' actual setting is unknown. [UNVERIFIED]
  - Use stream: true.
  - Set the client timeout to 600000 ms. The OpenAI SDK default is already 10 min. [VERIFIED-RUN source read]

11. PRICING (per 1M tokens)
- /v1/models and the pricing docs table: input $3, cached input $0.3, output $15 (class kimi3-2780b). [VERIFIED-RUN, VERIFIED-DOC]
- The model page shows "Input $2 / Cached $0.3 / Output $10 ‡" with a pricing addendum marker. The addendum text is not in the server HTML. This conflicts with the API numbers; budget at $3 and $15. [VERIFIED-RUN]
- Cached input billing is automatic for exact repeated prefixes of about 1,000 tokens or more. Put the stable system prompt and schema first. [VERIFIED-DOC]

12. RECOMMENDED REQUEST BODY FOR "return JSON that matches this schema"
The mock server captured this exact body from openai@7.23.0 (with stream on for production): [VERIFIED-RUN against local mock]
{
  "model": "moonshotai/Kimi-K3",
  "messages": [
    {"role": "system", "content": "<task instructions>\n\nReturn exactly one JSON value that matches this JSON Schema. Output raw JSON only: no markdown code fences, no prose before or after.\nJSON Schema:\n<z.toJSONSchema(schema, {target:'draft-7'})>"},
    {"role": "user", "content": "<lead data>"}
  ],
  "max_tokens": 16384,
  "temperature": 1,
  "top_p": 0.95,
  "chat_template_kwargs": {"thinking_effort": "low"},
  "stream": true,
  "stream_options": {"include_usage": true}
}
Rationale:
- Moonshot fixes K3 at temperature 1.0 and top_p 0.95 on its own API. [VERIFIED-DOC] I set them explicitly because Featherless defaults are unknown.
- The first request leaves out response_format. Kimi K2.6 json_schema returned an APIError per Kiln. [UNVERIFIED]
- `response_format: {"type":"json_object"}` is available behind a flag (`jsonObjectMode`) after a live test.

Client (openai 7.23.0, zod 4.6.5, Node v26.3.0, TypeScript 7.0.2 strict tsc passes): [VERIFIED-RUN]
  new OpenAI({ apiKey, baseURL: 'https://api.featherless.ai/v1', timeout: 600_000, maxRetries: 0, defaultHeaders: { 'HTTP-Referer': '<url>', 'X-Title': '<app>' } })
- Extra body fields (chat_template_kwargs, stream_options) pass through unchanged. Pass the body with a cast (`as never`). [VERIFIED-RUN]
- The SDK default is maxRetries 2. It retries 408, 409, 429 and 5xx and honors retry-after and retry-after-ms. With the default, a mocked 429 was sent 3 times. [VERIFIED-RUN]
- On a mocked 429: err.status 429, err.code "concurrency_limit_exceeded", err.type "invalid_request_error". [VERIFIED-RUN]

13. PARSE STRATEGY (all 12 mock scenarios passed) [VERIFIED-RUN]
Steps:
1. Read choices[0].message.content (or the concatenated delta.content when streaming). Ignore `reasoning` and `reasoning_content`.
2. Strip leaks:
   - If `<|open|>response<|sep|>` is present, take the text in the last response section.
   - Remove `<think>...</think>` blocks.
   - If a lone `</think>` remains, keep only the text after it.
   - Remove `<|...|>` markers.
3. Candidates, in order: the full cleaned text, then fenced ```json blocks (last first), then every balanced {..} or [..] span.
   - The span scan is string and escape aware. It sorts by end position descending, then outermost first. This survives stray braces in reasoning and markers stripped to plain words.
4. For each candidate, JSON.parse and then run zod safeParse. Return the first valid one.
5. If none is valid and finish_reason is "length", throw TruncatedOutputError. Retry with a higher max_tokens or a lower effort.
6. Else run one repair attempt as a new single-shot request: the original messages plus a user message with the bad output and z.prettifyError issues.
   - Do not replay an assistant turn. K3 would then need its reasoning_content round-tripped.

Core code (ran):
  const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
  const XTML_RESPONSE = /<\|open\|>response<\|sep\|>([\s\S]*?)(?:<\|close\|>response<\|sep\|>|$)/g;
  const FENCE = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
  export function stripReasoning(content: string): string {
    let text = content;
    const xtml = [...text.matchAll(XTML_RESPONSE)];
    if (xtml.length > 0) text = xtml[xtml.length - 1][1];
    text = text.replace(THINK_BLOCK, '');
    const lastClose = text.toLowerCase().lastIndexOf('</think>');
    if (lastClose !== -1) text = text.slice(lastClose + '</think>'.length);
    return text.replace(/<\|[a-z_]+\|>/g, '').trim();
  }
  function matchingEnd(text: string, start: number): number {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; }
      else if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i; if (depth < 0) return -1; }
    }
    return -1;
  }
  export function balancedJsonSpans(text: string): string[] {
    const spans: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{' && text[i] !== '[') continue;
      const end = matchingEnd(text, i);
      if (end !== -1) spans.push({ start: i, end });
    }
    spans.sort((a, b) => b.end - a.end || a.start - b.start);
    return spans.map(({ start, end }) => text.slice(start, end + 1));
  }
  export function extractJson<T>(content: string, schema: z.ZodType<T>): T {
    const cleaned = stripReasoning(content);
    const fenced = [...cleaned.matchAll(FENCE)].map((m) => m[1].trim());
    const candidates = [cleaned, ...fenced.reverse(), ...balancedJsonSpans(cleaned)];
    let lastIssues = 'no parseable JSON found';
    for (const candidate of candidates) {
      let parsed: unknown;
      try { parsed = JSON.parse(candidate); } catch { continue; }
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastIssues = z.prettifyError(result.error);
    }
    throw new NoValidJsonError('model output has no JSON value that matches the schema', content, lastIssues);
  }

Mock results:
- PASS on 1 attempt: reasoning-field, reasoning-content-field, inline-think-fenced, unclosed-think, xtml-leak, stripped-marker-leak, stream.
- PASS on 2 attempts: repair.
- Expected errors: truncated gave TruncatedOutputError. concurrency-429 was detected by isConcurrencyLimit. no-executor-503 gave status 503.

Retry policy:
- 429 concurrency_limit_exceeded: wait for a semaphore slot, then retry with jitter (honor Retry-After if present).
- 503: retry up to 3 times with backoff.
- 400 cold: poll GET /v1/models/moonshotai/Kimi-K3 `availability.tier` until "warm".
- 401 and 403: fail fast.
- Network timeout or 524: retry with streaming.

14. GOTCHAS
- The model id is case sensitive: "moonshotai/Kimi-K3".
- The K3 context on Featherless is 262144 tokens, not 1M. The WebFetch summarizer wrongly reported 1M; the raw page says 256k.
- The Featherless Chat plan caps context at 32K and allows only 1 parallel K3 request.
- The default thinking effort is max, which is slow and expensive at $15/M output. Send thinking_effort "low". Never send "medium", which fails the K3 encoder assertion.
- Reasoning can come as `reasoning`, `reasoning_content`, inline `<think>`, or leaked XTML text. Parse content only, defensively.
- Treat response_format json_schema as unsupported on Featherless for Kimi. Even where the K3 template honors it, it is only a prompt instruction.
- K3 tool-call output is sometimes malformed (vLLM recipe). Validate and retry.
- Do not route through LiteLLM's featherless_ai provider: it drops response_format and rejects tools.
- Two error shapes: `{"error":{message,type,param,code}}` on /v1, and `{statusCode,message,code}` on /account and /models/.../debug.
- The pricing on the model page ($2/$10) conflicts with the API and docs ($3/$15).
- Featherless docs (Tool Calling page 2025-08-07, chat_template_kwargs page 2026-07-16) do not mention K3. K3 was added to Featherless on 2026-07-28.

15. TO CHECK ON THE FIRST CALL WITH A REAL KEY (all UNVERIFIED now)
1. Does json_object return 200 for K3? Does json_schema return 200 or an error?
2. Which field holds the reasoning?
3. Does chat_template_kwargs.thinking_effort "low" reduce usage.completion_tokens compared with no kwargs?
4. Does top-level reasoning_effort give 400 or get ignored?
5. What is the exact 429 body, and is there a Retry-After header? On the Chat plan, fire 2 parallel K3 calls.
6. Does a non-stream call longer than 100 s return 524?
7. Is max_tokens clamping silent?
8. Does GET /v1/plan show your concurrency?

FILES
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/ts/kimi-json.ts (request builder, parser, generateJson, isConcurrencyLimit)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/ts/run-spike.ts (mock Featherless server and scenarios; run with `node run-spike.ts`)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/render-k3-prompt.py (renders K3 prompts with the official encoder)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/kimi-k3-detail.json (live model metadata)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/hf-encoding_k3.py (K3 chat encoder from Hugging Face)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/featherless-kimi/docs_*.txt (plain-text copies of the Featherless docs pages)
