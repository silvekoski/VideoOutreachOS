ELEVENLABS API RESEARCH REPORT (2026-09-26)

Summary: all three request shapes are correct. I ran the TTS, voice clone and get voice requests against the live API with a fake key. Each one got past the server's body check and stopped at the key check (401). The server checks the body before the key, so a bad body gets 422 first. For a cloned voice that must speak FI, SV, NO, DA, DE and EN, use eleven_v3. eleven_multilingual_v2 has no Norwegian and does not take language_code.

Spike folder: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/elevenlabs-api/
- openapi.json: official spec from https://api.elevenlabs.io/openapi.json (2,210,640 bytes, OpenAPI 3.1.0).
- docs/*.md: official doc pages, fetched as https://elevenlabs.io/docs/<path>.md.
- raw-fetch.ts, sdk.ts, curl-shapes.sh: scripts I ran (Node v26.3.0, runs .ts natively).
- sample.mp3: a 74 KB clip made with macOS `say` and ffmpeg.
- SDK: @elevenlabs/elevenlabs-js 2.69.0 (npm, published 2026-09-24, node >=18). Installed locally in the folder.

Tags: VERIFIED means I ran it or read it in the official spec or docs. UNVERIFIED means I did not confirm it.

=====================================================================
1. TEXT TO SPEECH
=====================================================================
Endpoint (VERIFIED spec and docs):
  POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
  operationId text_to_speech_full. SDK: client.textToSpeech.convert(voice_id, request, requestOptions?)
Regional servers (VERIFIED docs, SDK ElevenLabsEnvironment):
  - https://api.us.elevenlabs.io (US)
  - https://api.eu.residency.elevenlabs.io (EU)
  - https://api.in.residency.elevenlabs.io (India)
  - https://api.sg.residency.elevenlabs.io (Singapore)
  I did not confirm whether the EU residency host is enterprise-only. UNVERIFIED.

Headers (VERIFIED):
  - xi-api-key: <key>
  - Content-Type: application/json
  - Accept: audio/mpeg is optional.
  The server also reads an Authorization header. A bad Bearer value returned 401 with code "unauthorized" and status "invalid_authorization_header" (VERIFIED, ran). Whether an API key works as a Bearer token is UNVERIFIED, so use xi-api-key.

Query params (VERIFIED spec):
  - output_format: string enum, default mp3_44100_128. Format is codec_samplerate_bitrate.
    - MP3 values: mp3_22050_32, mp3_24000_48, mp3_44100_32, mp3_44100_64, mp3_44100_96, mp3_44100_128, mp3_44100_192.
    - Other values: pcm_8000..48000, wav_8000..48000, opus_48000_32..192, ulaw_8000, alaw_8000.
    - mp3_44100_192 needs Creator tier or above. PCM and WAV at 44.1 kHz need Pro or above.
  - enable_logging: bool, default true. false turns on zero retention mode, which is enterprise only and disables request stitching.
  - optimize_streaming_latency: int 0 to 4. DEPRECATED.

Body, JSON (VERIFIED spec schema Body_text_to_speech_full; only text is required):
  - text: string, required.
  - model_id: string, default "eleven_multilingual_v2".
  - language_code: string or null, ISO 639-1.
    - Spec: "If the model does not support the provided language code, it will be ignored. This parameter is not supported for multilingual_v2 models."
  - voice_settings: object or null. Overrides the stored settings for this request only.
    - stability: number 0..1, default 0.5. The schema enforces the range and returns 422 when out of range (VERIFIED, ran).
    - similarity_boost: number 0..1, default 0.75. Range enforced with 422 (VERIFIED, ran).
    - style: number, default 0. Values above 0 add latency.
    - use_speaker_boost: bool, default true.
    - speed: number, default 1.0. Docs give a range of 0.7 to 1.2. The main endpoint does not check this range before auth: speed 2 got 401, not 422 (VERIFIED, ran).
  - seed: int or null, 0 to 4294967295. Best-effort determinism, not guaranteed.
    - A non-integer returns 422 int_parsing (VERIFIED, ran).
    - seed -1 got past the pre-auth check (VERIFIED, ran), so the range is checked later if at all.
  - previous_text, next_text: string or null. Improve continuity across chunks.
  - previous_request_ids, next_request_ids: string[] or null, max 3 each.
    - Request ids must be less than 2 hours old.
    - If both are sent, previous_text or next_text is ignored.
  - pronunciation_dictionary_locators: [{pronunciation_dictionary_id, version_id?}], max 3.
  - apply_text_normalization: "auto" | "on" | "off", default "auto".
  - apply_language_text_normalization: bool. Japanese only.
  - use_pvc_as_ivc: bool. Deprecated.

Response (VERIFIED spec):
  - 200: Content-Type audio/mpeg, body is binary audio. The SDK returns ReadableStream<Uint8Array>.
  - 422: HTTPValidationError.
  - Success response headers: "request-id" (use it for previous_request_ids) and "character-cost". VERIFIED in the official stitching guide; not observed, since there is no key.
  - Concurrency headers: current-concurrent-requests and maximum-concurrent-requests. VERIFIED in docs, not observed.

Related endpoint (VERIFIED spec): POST /v1/text-to-speech/{voice_id}/with-timestamps.
  - Returns JSON: {audio_base64, alignment: {characters[], character_start_times_seconds[], character_end_times_seconds[]}, normalized_alignment}.
  - Useful for captions and lip-sync timing.
  - Streaming variants: /stream and /stream/with-timestamps.

Exact curl (VERIFIED: ran it with a fake key, the body passed the schema check and returned 401):
  curl -sS -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" \
    -H "xi-api-key: $XI_API_KEY" -H "Content-Type: application/json" -H "Accept: audio/mpeg" \
    -d '{"text":"Hei Matti, tämä video on tehty sinulle.","model_id":"eleven_flash_v2_5","language_code":"fi",
         "voice_settings":{"stability":0.5,"similarity_boost":0.75,"style":0,"use_speaker_boost":true,"speed":1.0},
         "seed":12345,"previous_text":"Edellinen lause.","next_text":"Seuraava lause."}' \
    -o out.mp3

Raw fetch (VERIFIED, ran; the same body with model_id eleven_v3 also passed the schema check and returned 401):
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_v3", language_code: "fi", seed: 42 }),
  });
  const mp3 = Buffer.from(await res.arrayBuffer());

SDK (VERIFIED, ran; signatures read from 2.69.0 .d.ts files):
  import { ElevenLabsClient, ElevenLabsError, ElevenLabs } from "@elevenlabs/elevenlabs-js";
  const client = new ElevenLabsClient({ apiKey, maxRetries: 0, timeoutInSeconds: 30 });
  const stream = await client.textToSpeech.convert(voiceId, {
    text, modelId: "eleven_flash_v2_5", languageCode: "sv", outputFormat: "mp3_44100_128",
    voiceSettings: { stability: 0.5, similarityBoost: 0.75, speed: 1 }, seed: 7, previousText: "..." });

  Request type BodyTextToSpeechFull, all camelCase:
    enableLogging, optimizeStreamingLatency, outputFormat, text, modelId, languageCode, voiceSettings,
    pronunciationDictionaryLocators, seed, previousText, nextText, previousRequestIds, nextRequestIds,
    usePvcAsIvc, applyTextNormalization, applyLanguageTextNormalization.

  To read headers: await client.textToSpeech.convert(...).withRawResponse() returns {data, rawResponse}. Then call rawResponse.headers.get("request-id"). VERIFIED in the official docs example.

Model language support (VERIFIED, docs/overview-models.md):
  - eleven_v3: 70+ languages.
    - Includes Finnish (fin), Swedish (swe), Norwegian (nor), Danish (dan), German (deu), English (eng). ALL 6.
    - 5,000 chars per request.
  - eleven_multilingual_v2: 29 languages: en ja zh de hi fr ko pt it es id nl tr fil pl sv bg ro ar cs el fi hr ms sk da ta uk ru.
    - Has fi, sv, da, de, en. NO Norwegian.
    - 10,000 chars per request.
  - eleven_flash_v2_5: every multilingual_v2 language plus hu, no, vi (32 languages). ALL 6.
    - 40,000 chars per request. About 75 ms latency. Price per character is 50% lower.
  - eleven_turbo_v2_5: DEPRECATED. Same 32 languages as flash_v2_5. Docs: "functionally equivalent" to Flash but with higher latency. Replacement is eleven_flash_v2_5.

Which models accept language_code:
  - eleven_v3: YES. VERIFIED: the spec's ElevenV3Request schema (/v1/flows/text-to-speech) has language_code.
  - eleven_flash_v2_5: YES. VERIFIED: ElevenFlashV2_5Request has language_code.
  - eleven_multilingual_v2: NO. VERIFIED: the main endpoint says so and ElevenMultilingualV2Request has no such field.
    - What the API does if you send it anyway (ignore or reject) is UNVERIFIED. Omit it for this model.
  - eleven_turbo_v2_5: YES per older docs. UNVERIFIED in the current spec.
  - Norwegian: the language_code value in the models table is "no". Whether "nb" is accepted is UNVERIFIED.

Recommendation for an IVC voice in FI, SV, NO, DA, DE, EN:
  - Use eleven_v3 with language_code as the main model. It is the only quality-tier model that covers all 6 languages.
  - Official docs pick eleven_v3 as the model "for quality" and "for multilingual" (VERIFIED).
  - Docs say PVCs are "not fully optimized for Eleven v3" and advise an IVC or designed voice for v3 (VERIFIED). That fits the IVC plan.
  - Fall back to eleven_flash_v2_5 for low cost or low latency.
  - Use eleven_multilingual_v2 only if Norwegian is not needed.

v3 limits:
  - Request stitching is "not available for the eleven_v3 model" (VERIFIED, docs). This covers previous_request_ids. Whether previous_text and next_text change v3 output is UNVERIFIED.
  - No SSML <break> tags. Use punctuation or audio tags such as [whispers] (VERIFIED, docs).
  - The v3 per-request voice_settings schema accepts only "stability" (VERIFIED, spec ElevenV3VoiceSettings).
  - The docs describe stability as Creative, Natural or Robust. The claim that only 0.0, 0.5 or 1.0 is accepted is UNVERIFIED.

Flash v2.5 gotchas:
  - It reads numbers, dates and currencies poorly. Its default normalization is off.
  - apply_text_normalization "on" is enterprise only for v2.5 models (VERIFIED, docs).
  - Pre-normalize text: write numbers as words, especially for Nordic currency and dates.

Language behavior (VERIFIED, help center): the text sets the language, and the voice sets the accent and pronunciation. Clone each rep speaking the target language for a native accent.

=====================================================================
2. INSTANT VOICE CLONING (IVC)
=====================================================================
Endpoint (VERIFIED spec and docs):
  POST https://api.elevenlabs.io/v1/voices/add
  Content-Type: multipart/form-data. operationId add_voice.
  SDK: client.voices.ivc.create(request, requestOptions?) returns AddVoiceIvcResponseModel.

Multipart fields (VERIFIED spec Body_Add_voice_v1_voices_add_post; required: name, files):
  - name: string, required.
  - files: binary[], required. Repeat the "files" part once per file.
  - remove_background_noise: bool, default false. Docs warn it "can make the quality worse" on clean samples.
  - description: string or null.
  - labels: object or JSON string or null. Keys: language, accent, gender, age. Example: {"language":"en","accent":"en-US","gender":"male","age":"middle-aged"}.

Response 200 (VERIFIED spec AddVoiceIVCResponseModel, both fields required):
  {"voice_id":"c38kUX8pkfYO2kHyqfFy","requires_verification":false}

Errors: 422 HTTPValidationError. A missing name or missing files returns 422 before auth (VERIFIED, ran).

Exact curl (VERIFIED: ran with a fake key, passed the schema check, returned 401):
  curl -sS -X POST "https://api.elevenlabs.io/v1/voices/add" -H "xi-api-key: $XI_API_KEY" \
    -F "name=Matti Myyja" -F "files=@sample.mp3;type=audio/mpeg" -F "remove_background_noise=false" \
    -F "description=Sales rep voice" -F 'labels={"language":"fi","accent":"fi-FI","gender":"male"}'

Raw fetch with Node FormData and Blob (VERIFIED, ran, got 401):
  const form = new FormData();
  form.append("name", "spike-voice");
  form.append("files", new Blob([bytes], { type: "audio/mpeg" }), "sample.mp3");
  form.append("remove_background_noise", "false");
  form.append("labels", JSON.stringify({ language: "fi" }));
  await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": KEY }, body: form });
  Do not set Content-Type by hand. fetch adds the boundary.

SDK (VERIFIED, ran):
  - Call: client.voices.ivc.create({ name, files: [fs.createReadStream(path)], removeBackgroundNoise: false, labels: { language: "fi" } })
  - Type: files is core.file.Uploadable[]; labels is Record<string,string> | string.

IVC is immediate. There is no training step, and the voice is usable right away (VERIFIED, docs "Voice cloning: how it works").

Sample guidance (VERIFIED, docs):
  - Use 1 to 2 minutes of clean single-speaker audio. More than 3 minutes gives little gain or makes the clone worse.
  - Use MP3 at 128 kbps or more; docs recommend 192 kbps. WAV does not help and can cause upload problems.
  - Target -23 to -18 dB RMS, with true peak at -3 dB.

Consent and verification:
  - The API has NO consent field on /v1/voices/add (VERIFIED, spec).
  - The dashboard IVC flow makes the user "confirm that you have the right and consent to clone the voice" (VERIFIED, docs). The Terms of Service and Prohibited Use Policy apply, and all generated audio can be traced to the account.
  - Collect and store consent from each sales rep in our own app.
  - Docs say "Both IVC and PVC include a voice verification step" that uses voice captcha (VERIFIED, docs). The API signals this through requires_verification in the create response, and voice_verification in GET voice.
  - The spec has verification endpoints only for PVC: /v1/voices/pvc/{voice_id}/captcha and /verification. How to verify an IVC voice through the API is UNVERIFIED. Treat requires_verification=true as "voice not usable yet" and surface it to the user.
  - PVC works only for your own voice, "Even with their consent, you cannot clone someone else's voice" (VERIFIED, docs). That rule is stated for PVC only.

Plan: IVC needs Starter or above; Free does not have it. VERIFIED from the official pricing page through a WebFetch summary. The docs page only says "available on most plans".
Free tier: Voice Library voices are not available through the API (VERIFIED, docs).

=====================================================================
3. ERRORS, 401, 422, 429, CONCURRENCY
=====================================================================
The API returns two different "detail" shapes, and clients must handle both.

(a) API error, detail is an object. VERIFIED, observed live:
  {"detail":{"type":"authentication_error","code":"unauthorized","message":"Invalid API key","status":"invalid_api_key","request_id":"cafc5cb04369d15dc6034a91624b7c23"}}
  - "status" is a legacy field. Docs say to use "code" instead. Validation errors may also carry "param" (VERIFIED, docs).
  - The request_id matches the x-trace-id response header (VERIFIED, observed).

(b) Schema validation (FastAPI/pydantic), detail is an ARRAY. VERIFIED, observed live:
  HTTP 422 {"detail":[{"type":"missing","loc":["body","text"],"msg":"Field required","input":null}]}
  HTTP 422 {"detail":[{"type":"less_than_equal","loc":["body","voice_settings","stability"],"msg":"Input should be less than or equal to 1","input":2,"ctx":{"le":1.0}}]}

Order of checks (VERIFIED, ran):
  - The body schema check (422) runs BEFORE auth (401).
  - Enum values in query params are not checked before auth: output_format=mp3_foo got 401.

401 cases (VERIFIED, observed live):
  - No key: message "Neither authorization header nor xi-api-key received, please provide one.", status "needs_authorization".
  - Bad key: message "Invalid API key", status "invalid_api_key".
  - Bad Bearer header: message "Provided authorization header was invalid.", status "invalid_authorization_header".
  - All three have type "authentication_error" and code "unauthorized".
  - GET /v1/models with no key returns 404 code "workspace_not_found" ("Workspace 1anonymous1 not found."), not 401 (VERIFIED, observed).

Type to HTTP status (VERIFIED, docs/errors):
  - validation_error, invalid_request: 400
  - authentication_error: 401
  - payment_required: 402
  - authorization_error: 403
  - not_found: 404 (codes include voice_not_found, model_not_found)
  - conflict: 409
  - rate_limit_error: 429
  - internal_error: 500
  - service_unavailable: 503
  Useful codes: text_too_long, invalid_voice_settings, unsupported_model, invalid_output_format, invalid_audio, audio_too_short, voice_access_denied, model_access_denied, feature_not_available, subscription_required, insufficient_credits.

429 (VERIFIED, docs), type rate_limit_error:
  - code "concurrent_limit_exceeded": too many parallel requests. Wait for in-flight requests to finish.
  - code "rate_limit_exceeded": too many requests in a short window. Use exponential backoff.
  - code "system_busy": server load. Retry.
  - The help center names the legacy messages "too_many_concurrent_requests" and "system_busy". Expect either value in detail.status or detail.code. The exact live JSON is UNVERIFIED because I had no key.

Quota versus concurrency: running out of credits is NOT a 429.
  - The new docs map it to 402 payment_required, code "insufficient_credits".
  - The legacy help center lists "quota_exceeded" under "Error Code 400 or 401".
  - Which status code the live API sends is UNVERIFIED. Treat 402, and a 401 with status or code quota_exceeded, as "out of credits, do not retry".

Concurrency limits for TTS (VERIFIED, docs/overview-models.md and help center):
  | Plan       | Multilingual v2 (and "all other models") | Flash (and Turbo) |
  | Free       | 2        | 4        |
  | Starter    | 3        | 6        |
  | Creator    | 5        | 10       |
  | Pro        | 10       | 20       |
  | Scale      | 15       | 30       |
  | Business   | 15       | 30       |
  | Enterprise | elevated | elevated |
  - Each HTTP request counts toward the limit while it runs.
  - The models page says requests over the limit "are processed in a queue" (about 50 ms extra). The help center says you get 429 too_many_concurrent_requests. The docs conflict. Size a client-side semaphore to the plan limit and still handle 429.
  - That v3 is in the "other models" group, not Flash, is UNVERIFIED. The /v1/models response has a concurrency_group field (VERIFIED, spec).

SDK behavior (VERIFIED, read in 2.69.0 source):
  - Default maxRetries is 2. It retries on 408, 429 and 5xx.
  - It honors Retry-After and X-RateLimit-Reset. Otherwise exponential backoff from 1 s, capped at 60 s, with jitter.
  - Default timeout is 240 s.
  - A 401 from textToSpeech.convert, voices.ivc.create or voices.get is thrown as a plain ElevenLabsError, not as ElevenLabs.UnauthorizedError. These clients map only 422, to ElevenLabs.UnprocessableEntityError (VERIFIED, ran).
  - ElevenLabsError has statusCode, body and rawResponse.
  - Its requestId getter reads the "x-request-id" header, which is absent on errors, so it returned undefined (VERIFIED, ran). Read (e.body as any).detail.request_id instead.

=====================================================================
4. GET VOICE (status check)
=====================================================================
Endpoint (VERIFIED spec and docs):
  GET https://api.elevenlabs.io/v1/voices/{voice_id}
  Header: xi-api-key. Query: with_settings is deprecated and ignored.
  SDK: client.voices.get(voice_id, request?, requestOptions?) returns ElevenLabs.Voice.
curl (VERIFIED, ran, got 401 with a fake key):
  curl -sS "https://api.elevenlabs.io/v1/voices/$VOICE_ID" -H "xi-api-key: $XI_API_KEY"

Response VoiceResponseModel (VERIFIED, spec).
  Required fields: voice_id, name, category, labels, available_for_tiers, high_quality_base_model_ids.
  Fields to use for status:
  - category: "generated" | "cloned" | "premade" | "professional" | "famous" | "high_quality". An IVC voice is "cloned"; that mapping is UNVERIFIED.
  - voice_verification: {requires_verification, is_verified, verification_failures[], verification_attempts_count, language?, verification_attempts?}.
  - samples[]: {sample_id, file_name, mime_type, size_bytes, hash, duration_secs?, remove_background_noise?, ...}.
  - fine_tuning: PVC only. state is a map of model_id to one of "not_started" | "queued" | "fine_tuning" | "fine_tuned" | "failed" | "delayed". Also progress and message.
  - safety_control: "NONE" | "BAN" | "CAPTCHA" | "ENTERPRISE_BAN" | "ENTERPRISE_CAPTCHA" | null.
  - Other fields: settings (stability, similarity_boost, style, use_speaker_boost, speed), verified_languages[], is_owner, created_at_unix, recording_quality, labelling_status.
  - Unknown id: 404, code voice_not_found (VERIFIED, docs).
  - Suggested readiness rule: 200 and voice_verification.requires_verification !== true and safety_control not BAN or CAPTCHA. This rule is my own inference, UNVERIFIED.

Delete voice: DELETE /v1/voices/{voice_id} returns {"status":"ok"} (VERIFIED, spec).

Sources: https://api.elevenlabs.io/openapi.json, https://elevenlabs.io/docs/api-reference/text-to-speech/convert, https://elevenlabs.io/docs/api-reference/voices/ivc/create, https://elevenlabs.io/docs/api-reference/voices/get, https://elevenlabs.io/docs/overview/models, https://elevenlabs.io/docs/eleven-api/resources/errors, https://elevenlabs.io/docs/help-center/technical/api-error-code-429, https://elevenlabs.io/docs/help-center/technical/api-error-code-400-or-401, https://elevenlabs.io/docs/eleven-api/concepts/voice-cloning, https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching, https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices, https://elevenlabs.io/pricing
