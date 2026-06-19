// EU VIES VAT-number validation (free, no auth). Confirms that a candidate company's
// VAT number is currently valid and returns the registered legal name, corroborating the
// äriregister match before we book a real invoice to that entity.
//
// Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
// Body: { countryCode: "EE", vatNumber: "100030417" }  (digits only, no country prefix)
//
// CRITICAL: VIES is a real-time proxy to each national database. A member-state outage
// returns an error, NOT valid:false — treating that as "invalid" would be a false
// negative. We map outages/timeouts to valid:null ("could not check"), distinct from a
// genuine valid:false. Estonia returns name + address (some states suppress them).

import type { ViesResult } from "./types.js";

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

// VIES error codes that mean "the service/member state could not answer" rather than
// "this number is invalid". A negative under any of these must not be trusted.
const UNAVAILABLE_ERRORS = new Set([
	"MS_UNAVAILABLE",
	"MS_MAX_CONCURRENT_REQ",
	"GLOBAL_MAX_CONCURRENT_REQ",
	"SERVICE_UNAVAILABLE",
	"TIMEOUT",
	"SERVER_BUSY",
]);

interface ViesResponse {
	valid?: boolean;
	name?: string;
	userError?: string;
	errorWrappers?: { error?: string }[];
}

/**
 * Split an EE VAT id into the VIES (countryCode, vatNumber) pair. Accepts "EE100030417"
 * or a bare "100030417". Returns null if it has no usable digits.
 */
export function splitVatId(vat: string): { countryCode: string; vatNumber: string } | null {
	const trimmed = vat.trim().toUpperCase().replace(/\s+/g, "");
	const m = /^([A-Z]{2})?(\d{2,})$/.exec(trimmed);
	if (!m) return null;
	return { countryCode: m[1] ?? "EE", vatNumber: m[2] };
}

/**
 * Validate a VAT id against VIES. Never throws — a network/HTTP failure is reported as
 * checked:true, valid:null with a note, so the caller can decide (we keep the äriregister
 * match but flag it rather than dropping it).
 */
export async function validateVat(vat: string, timeoutMs = 10_000): Promise<ViesResult> {
	const parts = splitVatId(vat);
	if (!parts) return { checked: false, valid: null, name: null, note: `unparseable VAT id "${vat}"` };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(VIES_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ countryCode: parts.countryCode, vatNumber: parts.vatNumber }),
			signal: controller.signal,
		});
		if (!res.ok) {
			return { checked: true, valid: null, name: null, note: `VIES HTTP ${res.status} — could not verify` };
		}
		const data = (await res.json()) as ViesResponse;
		const wrapperError = data.errorWrappers?.find((w) => w.error)?.error;
		const errorCode = data.userError && data.userError !== "VALID" ? data.userError : wrapperError;
		if (errorCode && UNAVAILABLE_ERRORS.has(errorCode)) {
			return { checked: true, valid: null, name: null, note: `VIES unavailable (${errorCode})` };
		}
		if (data.valid === true) {
			const name = data.name && data.name !== "---" ? data.name : null;
			return { checked: true, valid: true, name };
		}
		return {
			checked: true,
			valid: false,
			name: null,
			note: errorCode ? `VIES: ${errorCode}` : "VIES reports the VAT id as not valid",
		};
	} catch (err) {
		const reason = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
		return { checked: true, valid: null, name: null, note: `VIES request failed (${reason})` };
	} finally {
		clearTimeout(timer);
	}
}
