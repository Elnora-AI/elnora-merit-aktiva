// Error hierarchy for the elnora-merit CLI.
//
// Every error class carries a userMessage + suggestion + structured exit code
// so the CLI dispatcher can map them to predictable shell exit codes and emit
// machine-readable JSON envelopes that agents can parse and self-correct from.

/**
 * Dedicated exit codes per error type.
 * 0 = success, 1 = general/unknown, 2 = validation, 3 = auth,
 * 5 = rate limited, 6 = upstream API error.
 * (4 is reserved — it belonged to a removed not-found error type; existing
 * agents may still special-case it, so it is not reused.)
 */
export const EXIT_CODES = {
	SUCCESS: 0,
	GENERAL: 1,
	VALIDATION: 2,
	AUTH: 3,
	RATE_LIMIT: 5,
	API: 6,
} as const;

export class CliError extends Error {
	readonly userMessage: string;
	readonly suggestion?: string;
	readonly exitCode: number;
	/**
	 * Optional structured payload merged into the JSON error envelope. Used to
	 * expose machine-readable detail (HTTP status, upstream body, retry-after)
	 * so an agent can self-correct without guessing.
	 */
	readonly data?: Record<string, unknown>;

	constructor(message: string, options?: { suggestion?: string; exitCode?: number; data?: Record<string, unknown> }) {
		super(message);
		this.name = "CliError";
		this.userMessage = message;
		this.suggestion = options?.suggestion;
		this.exitCode = options?.exitCode ?? EXIT_CODES.GENERAL;
		this.data = options?.data;
	}
}

export class AuthError extends CliError {
	constructor(message?: string, suggestion?: string) {
		super(message ?? "No Merit Aktiva API credentials found.", {
			suggestion:
				suggestion ??
				"Set MERIT_API_ID and MERIT_API_KEY in your environment, or place them in ~/.config/elnora-merit/.env (mode 0600). Generate them in Merit Aktiva: Settings → Company data → API settings.",
			exitCode: EXIT_CODES.AUTH,
		});
		this.name = "AuthError";
	}
}

export class ValidationError extends CliError {
	constructor(message: string, suggestion?: string, data?: Record<string, unknown>) {
		super(message, { suggestion, exitCode: EXIT_CODES.VALIDATION, data });
		this.name = "ValidationError";
	}
}

/** Raised when Merit returns HTTP 429. Carries the parsed retry-after (ms). */
export class RateLimitError extends CliError {
	readonly retryAfterMs: number;
	constructor(retryAfterMs: number, data?: Record<string, unknown>) {
		super(`Merit API rate limit exceeded (HTTP 429).`, {
			suggestion: `Retry after ${Math.ceil(retryAfterMs / 1000)}s. The CLI retries automatically; if you see this, all retries were exhausted.`,
			exitCode: EXIT_CODES.RATE_LIMIT,
			data,
		});
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * Raised when Merit returns a non-2xx HTTP status, or a 200 whose body is an
 * ASP.NET stack trace (Merit signals malformed payloads this way). Carries the
 * HTTP status and a redacted snippet of the upstream body for diagnosis.
 */
export class ApiError extends CliError {
	readonly status: number;
	constructor(status: number, message: string, data?: Record<string, unknown>) {
		super(message, {
			suggestion:
				status === 401
					? 'Merit returned 401. If the body is "api-wronglicense", the account is not on a Pro/Premium plan. Otherwise check MERIT_API_ID/MERIT_API_KEY.'
					: status === 400
						? "Merit returned 400. Check the request payload fields and types against the endpoint spec."
						: "Inspect the upstream response in the error data.",
			exitCode: EXIT_CODES.API,
			data: { status, ...data },
		});
		this.name = "ApiError";
		this.status = status;
	}
}
