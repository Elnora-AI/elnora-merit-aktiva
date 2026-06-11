// HMAC-signed HTTP client for the Merit Aktiva API.
//
// One instance per CLI invocation (process-wide cache via getClient). Each call:
//   - serializes the body to a compact JSON string (the exact bytes signed + sent),
//   - generates a fresh UTC timestamp (re-generated on every retry, per Merit),
//   - signs apiId+timestamp+body with HMAC-SHA256 (see signer.ts),
//   - appends apiId/timestamp/signature as URL-encoded query params,
//   - POSTs (Merit endpoints take a JSON body even for queries),
//   - retries on HTTP 429 honouring Retry-After (rate limiting fires before Merit
//     processes the request, so a 429 retry can never double-apply a write),
//   - retries transient 5xx (502/503/504) ONLY for GET requests. Merit has no
//     idempotency key, and a gateway can die AFTER Merit processed a write — auto-
//     retrying a POST (sendglbatch, sendinvoice, sendpayment, ...) on 5xx could
//     silently double-post. POSTs fail fast so the operator verifies before re-running,
//   - maps non-2xx and 200-with-stacktrace responses to ApiError.

import { createRequire } from "node:module";
import { type ApiVersion, endpointUrl, resolveBaseUrl, resolvePalkBaseUrl } from "../config/index.js";
import { ApiError, RateLimitError, ValidationError } from "../utils/errors.js";
import { sleep } from "../utils/sleep.js";
import { type GetCredentialsOptions, getCredentials, getPalkCredentials, type MeritCredentials } from "./auth.js";
import { formatTimestamp, sign } from "./signer.js";

const pkg = createRequire(import.meta.url)("../../package.json") as { version: string };
const USER_AGENT = `@elnora-ai/merit-aktiva/${pkg.version}`;

const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 2_000;
// Cap so a hostile or buggy Retry-After header can't stall the process.
const MAX_RETRY_AFTER_MS = 60_000;

export interface MeritCallOptions {
	/** Override the default API version for this endpoint ("v1" | "v2"). */
	version?: ApiVersion;
	/** HTTP method. Defaults to POST (Merit takes a JSON body even for queries). */
	method?: "GET" | "POST";
	/** Request payload. Serialized to compact JSON, signed, and sent verbatim. */
	body?: unknown;
}

function looksLikeStackTrace(body: string): boolean {
	return /(\n\s+at\s|System\.|Microsoft\.|Exception:|StackTrace)/.test(body);
}

// Statuses worth retrying beyond 429: transient upstream/gateway errors. Only safe
// for GET — see the module header (a retried POST can double-apply a write).
const RETRYABLE_5XX = new Set([502, 503, 504]);

function parseRetryAfter(headerValue: string | null): number {
	if (headerValue) {
		// Numeric form ("Retry-After: 120" seconds).
		const seconds = Number.parseInt(headerValue, 10);
		if (Number.isFinite(seconds) && seconds > 0) {
			return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
		}
		// HTTP-date form ("Retry-After: Wed, 21 Oct 2026 07:28:00 GMT").
		const dateMs = Date.parse(headerValue);
		if (!Number.isNaN(dateMs)) {
			const delta = dateMs - Date.now();
			if (delta > 0) return Math.min(delta, MAX_RETRY_AFTER_MS);
		}
	}
	return DEFAULT_RETRY_AFTER_MS;
}

export class MeritClient {
	private readonly creds: MeritCredentials;
	private readonly baseUrl: string;

	constructor(creds: MeritCredentials, baseUrl: string = resolveBaseUrl()) {
		this.creds = creds;
		this.baseUrl = baseUrl;
	}

	/**
	 * Call a Merit endpoint by its bare path (e.g. "getinvoices"). Returns the
	 * parsed JSON response, the raw string for non-JSON bodies, or null for an
	 * empty body. Throws RateLimitError / ApiError on failure.
	 */
	async call<T = unknown>(apiPath: string, opts: MeritCallOptions = {}): Promise<T> {
		const version = opts.version ?? this.creds.version;
		const method = opts.method ?? "POST";
		if (method === "GET" && opts.body !== undefined) {
			// A GET signs the body but never sends it (see below), so a body would only
			// cause a silent signature mismatch. Merit GET endpoints carry filters in the
			// query string, not a body — reject it up front with a clear error.
			throw new ValidationError("A GET request must not carry a body; Merit GET endpoints take query params only.");
		}
		const bodyString = opts.body === undefined ? "" : JSON.stringify(opts.body);
		const url = endpointUrl(this.baseUrl, version, apiPath);

		let lastRateLimit: RateLimitError | null = null;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			// Fresh timestamp + signature on every attempt — Merit rejects stale
			// timestamps, so a retried request must be re-signed.
			const timestamp = formatTimestamp(new Date());
			const signature = sign(this.creds.apiId, timestamp, bodyString, this.creds.apiKey);
			const qs =
				`apiId=${encodeURIComponent(this.creds.apiId)}` +
				`&timestamp=${encodeURIComponent(timestamp)}` +
				`&signature=${encodeURIComponent(signature)}`;

			// REST-style v2 endpoints (e.g. PaymentImports, Banks/{id}/IncomePayments)
			// carry their own query string in apiPath; the auth params must then be
			// joined with `&`, not a second `?` (which corrupts the URL and drops apiId).
			const sep = url.includes("?") ? "&" : "?";
			const res = await fetch(`${url}${sep}${qs}`, {
				method,
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					Accept: "application/json",
					"User-Agent": USER_AGENT,
				},
				body: method === "POST" ? bodyString : undefined,
			});

			const retryable5xx = RETRYABLE_5XX.has(res.status) && method === "GET";
			if (res.status === 429 || retryable5xx) {
				const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
				if (res.status === 429) lastRateLimit = new RateLimitError(retryAfterMs, { endpoint: apiPath, version });
				if (attempt < MAX_RETRIES) {
					const label = res.status === 429 ? "rate-limited (429)" : `transient error (${res.status})`;
					process.stderr.write(
						`Merit API ${label}: retrying in ${Math.ceil(retryAfterMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...\n`,
					);
					await sleep(retryAfterMs);
					continue;
				}
				if (res.status === 429) throw lastRateLimit as RateLimitError;
				// Transient 5xx with retries exhausted → fall through to the !res.ok branch
				// below, which surfaces a clear ApiError with the upstream body.
			}

			const text = await res.text();

			if (!res.ok) {
				throw new ApiError(res.status, `Merit API error ${res.status} on ${apiPath}.`, {
					endpoint: apiPath,
					version,
					body: text.slice(0, 2000),
				});
			}

			// 200 OK — but Merit signals malformed payloads with a 200 + stack trace.
			const trimmed = text.trim();
			if (trimmed === "") return null as T;
			try {
				return JSON.parse(trimmed) as T;
			} catch {
				if (looksLikeStackTrace(trimmed)) {
					throw new ApiError(200, `Merit returned a server stack trace on ${apiPath} (malformed payload).`, {
						endpoint: apiPath,
						version,
						body: trimmed.slice(0, 2000),
					});
				}
				// Non-JSON but not an error (e.g. a plain string id) — return raw.
				return trimmed as T;
			}
		}
		// Unreachable: the loop either returns or throws.
		throw lastRateLimit ?? new ApiError(0, `Merit API call to ${apiPath} failed without a response.`);
	}
}

let cached: MeritClient | null = null;

/** Resolve credentials and return a process-cached MeritClient. */
export async function getClient(opts?: GetCredentialsOptions): Promise<MeritClient> {
	if (cached) return cached;
	const creds = await getCredentials({ allowPrompt: true, ...opts });
	cached = new MeritClient(creds);
	return cached;
}

let cachedPalk: MeritClient | null = null;

/**
 * Resolve Merit Palk credentials and return a process-cached MeritClient pointed
 * at the Palk host. Palk is v1-only and Estonia-only, so version/localization
 * are fixed; the signing scheme is identical to Aktiva, so MeritClient is reused.
 */
export async function getPalkClient(opts?: GetCredentialsOptions): Promise<MeritClient> {
	if (cachedPalk) return cachedPalk;
	const creds = await getPalkCredentials({ allowPrompt: true, ...opts });
	cachedPalk = new MeritClient(
		{ apiId: creds.apiId, apiKey: creds.apiKey, localization: "ee", version: "v1" },
		resolvePalkBaseUrl(),
	);
	return cachedPalk;
}
