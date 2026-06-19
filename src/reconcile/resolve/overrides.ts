// User-maintained overrides for buyer → company resolution.
//
// Automatic email-domain matching cannot be perfect (brand ≠ legal name, corporate
// families share a brand, free-mail buyers may be companies). The override file lets the
// operator pin a decision once — by exact email or by domain — and have it applied with
// full confidence on every future run. It is also where review-list decisions are
// recorded so the tail shrinks over time.
//
// Format (JSON), all keys lowercase:
//   {
//     "byEmail":  { "buyer@acme.com": { "regNo": "10000001", "name": "Acme AS", "vat": "EE100000001" } },
//     "byDomain": { "globex.ee": { "regNo": "10000002", "name": "Globex OÜ" },
//                   "gmail.com": { "private": true } }
//   }
// An entry with "private": true forces the anonymous summary (e.g. a personal domain a
// company person uses). Otherwise regNo + name are required; vat is optional.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "../../utils/errors.js";

export const DEFAULT_OVERRIDES_PATH = join(homedir(), ".config", "elnora-merit", "arireg-overrides.json");

export interface OverrideEntry {
	regNo?: string;
	name?: string;
	vat?: string | null;
	private?: boolean;
}

export interface OverrideMap {
	byEmail: Record<string, OverrideEntry>;
	byDomain: Record<string, OverrideEntry>;
}

const EMPTY: OverrideMap = { byEmail: {}, byDomain: {} };

function lowerKeys(obj: Record<string, OverrideEntry>): Record<string, OverrideEntry> {
	const out: Record<string, OverrideEntry> = {};
	for (const [k, v] of Object.entries(obj)) out[k.toLowerCase().trim()] = v;
	return out;
}

/** Load the override map, or an empty map when no file exists. Throws on malformed JSON. */
export function loadOverrides(path: string = DEFAULT_OVERRIDES_PATH): OverrideMap {
	if (!existsSync(path)) return { byEmail: {}, byDomain: {} };
	let parsed: Partial<OverrideMap>;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<OverrideMap>;
	} catch (err) {
		throw new ValidationError(
			`The resolver overrides file at ${path} is not valid JSON: ${(err as Error).message}`,
			"Fix the JSON, or remove the file to disable overrides.",
		);
	}
	return {
		byEmail: lowerKeys(parsed.byEmail ?? {}),
		byDomain: lowerKeys(parsed.byDomain ?? {}),
	};
}

/** Look up an override by exact email first, then by domain. Returns null if none. */
export function findOverride(map: OverrideMap, email: string | null, domain: string | null): OverrideEntry | null {
	if (email) {
		const e = map.byEmail[email.toLowerCase().trim()];
		if (e) return e;
	}
	if (domain) {
		const d = map.byDomain[domain.toLowerCase().trim()];
		if (d) return d;
	}
	return null;
}

export { EMPTY as EMPTY_OVERRIDES };
