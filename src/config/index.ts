// Merit Aktiva endpoint configuration.
//
// Resolves the service base URL from the account localization and the default
// API version. Everything is environment-driven so the package is universal —
// no account-specific values are baked in.
//
//   MERIT_LOCALIZATION  "ee" (Estonia) | "pl" (Poland)            default: ee
//   MERIT_API_VERSION   "v1" | "v2"  (default for dual-version endpoints)  default: v1
//   MERIT_BASE_URL      full override of the API base (for testing/mocking) optional

export type Localization = "ee" | "pl";
export type ApiVersion = "v1" | "v2";

// Base URLs per localization, WITHOUT a trailing version segment.
const BASE_URLS: Record<Localization, string> = {
	ee: "https://aktiva.merit.ee/api",
	pl: "https://program.360ksiegowosc.pl/api",
};

export function resolveLocalization(env: NodeJS.ProcessEnv = process.env): Localization {
	const raw = (env.MERIT_LOCALIZATION ?? "ee").trim().toLowerCase();
	if (raw !== "ee" && raw !== "pl") {
		throw new Error(`Invalid MERIT_LOCALIZATION: "${raw}". Must be "ee" or "pl".`);
	}
	return raw;
}

export function resolveDefaultVersion(env: NodeJS.ProcessEnv = process.env): ApiVersion {
	const raw = (env.MERIT_API_VERSION ?? "v1").trim().toLowerCase();
	if (raw !== "v1" && raw !== "v2") {
		throw new Error(`Invalid MERIT_API_VERSION: "${raw}". Must be "v1" or "v2".`);
	}
	return raw;
}

/** Base API URL without a trailing slash, e.g. https://aktiva.merit.ee/api */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.MERIT_BASE_URL?.trim();
	if (override) return override.replace(/\/+$/, "");
	return BASE_URLS[resolveLocalization(env)];
}

/**
 * Build the full endpoint URL: `{baseUrl}/{version}/{apiPath}`.
 * `apiPath` is the bare endpoint name, e.g. "getinvoices".
 */
export function endpointUrl(baseUrl: string, version: ApiVersion, apiPath: string): string {
	const path = apiPath.replace(/^\/+/, "");
	return `${baseUrl}/${version}/${path}`;
}

// Merit Palk (payroll) is a separate product from Aktiva (accounting): different
// host, its own credentials, and a v1-only API. Estonia-only — there is no PL
// Palk host. Base URL WITHOUT a trailing version segment.
const PALK_BASE_URL = "https://palk.merit.ee/api";

/** Base Merit Palk API URL without a trailing slash, e.g. https://palk.merit.ee/api */
export function resolvePalkBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.MERIT_PALK_BASE_URL?.trim();
	if (override) return override.replace(/\/+$/, "");
	return PALK_BASE_URL;
}
