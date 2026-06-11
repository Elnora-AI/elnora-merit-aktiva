// Minimal Stripe REST client (read-only) for the reconcile feature.
//
// Mirrors merit-client.ts in spirit: native fetch, no SDK dependency, retries on
// HTTP 429, machine-readable errors. We only ever READ from Stripe — payouts and
// balance transactions — so there is no write path here by design.
//
// Auth is a bearer secret key from STRIPE_API_KEY (loaded by loadEnvFile from the
// environment or ~/.config/elnora-merit/.env, same as the Merit credentials). A
// read-only restricted key is sufficient.

import { createRequire } from "node:module";
import { CliError, EXIT_CODES } from "../utils/errors.js";
import { stripWrappingQuotes } from "../utils/parse.js";
import { sleep } from "../utils/sleep.js";

const pkg = createRequire(import.meta.url)("../../package.json") as { version: string };
const USER_AGENT = `@elnora-ai/merit-aktiva/${pkg.version}`;

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 2_000;
const MAX_RETRY_AFTER_MS = 60_000;
// Statuses worth retrying beyond 429: transient gateway errors.
const RETRYABLE_5XX = new Set([502, 503, 504]);

/** Raised when Stripe returns a non-2xx status or the API key is missing/invalid. */
export class StripeError extends CliError {
	readonly status: number;
	constructor(status: number, message: string, data?: Record<string, unknown>) {
		super(message, {
			suggestion:
				status === 401
					? "Stripe returned 401. Check STRIPE_API_KEY — it must be a live secret/restricted key for the Stripe account whose payouts you book into Merit, not a test-mode key."
					: "Inspect the upstream Stripe response in the error data.",
			exitCode: status === 401 ? EXIT_CODES.AUTH : EXIT_CODES.API,
			data: { status, ...data },
		});
		this.name = "StripeError";
		this.status = status;
	}
}

/** A Stripe `list` object: `{ object: "list", data: [...], has_more }`. */
interface StripeList<T> {
	object: "list";
	data: T[];
	has_more: boolean;
}

/** Query parameter value — Stripe form-encodes nested keys like `created[gte]` and `expand[]`. */
export type StripeParams = Record<string, string | number | undefined>;

function buildQuery(params: StripeParams): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

function parseRetryAfter(headerValue: string | null): number {
	if (headerValue) {
		const seconds = Number.parseInt(headerValue, 10);
		if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
		const dateMs = Date.parse(headerValue); // HTTP-date form
		if (!Number.isNaN(dateMs)) {
			const delta = dateMs - Date.now();
			if (delta > 0) return Math.min(delta, MAX_RETRY_AFTER_MS);
		}
	}
	return DEFAULT_RETRY_AFTER_MS;
}

export class StripeClient {
	private readonly apiKey: string;
	private readonly baseUrl: string;

	constructor(apiKey: string, baseUrl: string = STRIPE_API_BASE) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
	}

	/** GET a single Stripe resource (e.g. `account`, `payouts/po_X`). */
	async get<T = unknown>(path: string, params: StripeParams = {}): Promise<T> {
		const url = `${this.baseUrl}/${path.replace(/^\/+/, "")}${buildQuery(params)}`;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			const res = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"User-Agent": USER_AGENT,
					Accept: "application/json",
				},
			});

			if (res.status === 429 || RETRYABLE_5XX.has(res.status)) {
				const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
				if (attempt < MAX_RETRIES) {
					const label = res.status === 429 ? "rate-limited (429)" : `transient error (${res.status})`;
					process.stderr.write(
						`Stripe ${label}: retrying in ${Math.ceil(retryAfterMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...\n`,
					);
					await sleep(retryAfterMs);
					continue;
				}
				if (res.status === 429) throw new StripeError(429, "Stripe API rate limit exceeded (HTTP 429).", { path });
				// Transient 5xx exhausted → fall through to the !res.ok branch below.
			}

			const text = await res.text();
			if (!res.ok) {
				throw new StripeError(res.status, `Stripe API error ${res.status} on ${path}.`, {
					path,
					body: text.slice(0, 2000),
				});
			}
			try {
				return JSON.parse(text) as T;
			} catch {
				throw new StripeError(res.status, `Stripe returned a non-JSON 2xx body on ${path}.`, {
					path,
					body: text.slice(0, 2000),
				});
			}
		}
		throw new StripeError(0, `Stripe API call to ${path} failed without a response.`);
	}

	/**
	 * GET every page of a Stripe list endpoint, following `has_more` via
	 * `starting_after`. Returns the concatenated `data` arrays.
	 */
	async listAll<T extends { id: string }>(path: string, params: StripeParams = {}): Promise<T[]> {
		const out: T[] = [];
		let startingAfter: string | undefined;
		// Hard cap on pages so a pathological response can't loop forever.
		const MAX_PAGES = 1000;
		for (let page = 0; page < MAX_PAGES; page++) {
			const list = await this.get<StripeList<T>>(path, {
				limit: 100,
				...params,
				starting_after: startingAfter,
			});
			out.push(...list.data);
			if (!list.has_more || list.data.length === 0) return out;
			startingAfter = list.data[list.data.length - 1].id;
		}
		// Truncating silently would hand the caller an incomplete transaction list —
		// for reconciliation that must be a hard failure, not a quiet imbalance.
		throw new StripeError(
			0,
			`Stripe list ${path} exceeded ${MAX_PAGES} pages — refusing to return a truncated result.`,
			{
				path,
				pages: MAX_PAGES,
			},
		);
	}
}

/** Resolve STRIPE_API_KEY and return a StripeClient, or throw a clear auth error. */
export function getStripeClient(env: NodeJS.ProcessEnv = process.env): StripeClient {
	const raw = env.STRIPE_API_KEY?.trim();
	const key = raw ? stripWrappingQuotes(raw) : undefined;
	if (!key) {
		throw new CliError("No Stripe API key found.", {
			suggestion:
				"Set STRIPE_API_KEY in your environment or in ~/.config/elnora-merit/.env (mode 0600). Use a live secret/restricted key for the Stripe account whose payouts you book into Merit — a read-only key is sufficient.",
			exitCode: EXIT_CODES.AUTH,
		});
	}
	return new StripeClient(key);
}
