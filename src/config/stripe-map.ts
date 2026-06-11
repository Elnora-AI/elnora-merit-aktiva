// Load and validate the Stripe → Merit account/VAT mapping (stripe-map.json).
//
// The map is the only company-specific input: it ties Stripe's buckets to this
// company's chart of accounts + VAT code. It ships as a gitignored placeholder
// (written by `reconcile init`); a populated copy holds no secrets (the Stripe key
// stays in the environment), so it can live in a private config repo.
//
// Resolution: --map flag › MERIT_STRIPE_MAP env › ~/.config/elnora-merit/stripe-map.json

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_VAT_TIMEZONE } from "../reconcile/period.js";
import type { StripeMap } from "../reconcile/types.js";
import { ValidationError } from "../utils/errors.js";

export const DEFAULT_MAP_PATH = join(homedir(), ".config", "elnora-merit", "stripe-map.json");

export function resolveMapPath(flagPath?: string, env: NodeJS.ProcessEnv = process.env): string {
	return flagPath?.trim() || env.MERIT_STRIPE_MAP?.trim() || DEFAULT_MAP_PATH;
}

// `vatPayable` is intentionally NOT required: Merit posts the output VAT implicitly
// from the revenue line's TaxId, so the connector never writes to it. It may still be
// recorded in the map as documentation of where Merit books the VAT.
const REQUIRED_ACCOUNTS = ["revenue", "stripeFees", "platformFees", "refunds", "clearing"] as const;

function fail(message: string): never {
	throw new ValidationError(
		message,
		`Fix the mapping file, or run \`elnora-merit reconcile init\` to (re)generate a template and list candidate account/bank/VAT values.`,
	);
}

/** Load, validate, and return the Stripe map at the resolved path. */
export function loadStripeMap(flagPath?: string, env: NodeJS.ProcessEnv = process.env): StripeMap {
	const path = resolveMapPath(flagPath, env);
	if (!existsSync(path)) {
		fail(`Stripe map not found at ${path}.`);
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	} catch (err) {
		return fail(`Invalid JSON in ${path}: ${(err as Error).message}`);
	}

	if (parsed._placeholder === true) {
		fail(`The Stripe map at ${path} is still a placeholder — fill in your account codes and VAT code.`);
	}

	const accounts = (parsed.accounts ?? {}) as Record<string, unknown>;
	const vat = (parsed.vat ?? {}) as Record<string, unknown>;

	if (typeof parsed.currency !== "string") fail('Stripe map: `currency` is required (e.g. "EUR").');
	if (typeof parsed.cutoffDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.cutoffDate))
		fail("Stripe map: `cutoffDate` is required as YYYY-MM-DD.");
	for (const a of REQUIRED_ACCOUNTS) {
		if (typeof accounts[a] !== "string" || !accounts[a]) fail(`Stripe map: \`accounts.${a}\` is required.`);
	}
	if (typeof vat.rate !== "number") fail("Stripe map: `vat.rate` is required (e.g. 0.24).");
	// A rate given in percent (24 instead of 0.24) would silently book net = gross/25.
	if (vat.rate < 0 || vat.rate >= 1)
		fail(`Stripe map: \`vat.rate\` must be a fraction in [0, 1) — e.g. 0.24 for 24%, not ${vat.rate}.`);
	if (typeof vat.code !== "string" || !vat.code) fail("Stripe map: `vat.code` (Merit TaxId/Guid) is required.");
	if (
		parsed.vatTimezone !== undefined &&
		(typeof parsed.vatTimezone !== "string" || !isValidTimezone(parsed.vatTimezone))
	)
		fail(`Stripe map: \`vatTimezone\` must be a valid IANA timezone (e.g. "Europe/Tallinn").`);

	return {
		currency: parsed.currency,
		stripeAccount: typeof parsed.stripeAccount === "string" ? parsed.stripeAccount : undefined,
		cutoffDate: parsed.cutoffDate,
		accounts: {
			revenue: accounts.revenue as string,
			vatPayable: typeof accounts.vatPayable === "string" && accounts.vatPayable ? accounts.vatPayable : undefined,
			stripeFees: accounts.stripeFees as string,
			platformFees: accounts.platformFees as string,
			refunds: accounts.refunds as string,
			clearing: accounts.clearing as string,
		},
		vat: { rate: vat.rate, code: vat.code as string },
		vatTimezone: typeof parsed.vatTimezone === "string" ? parsed.vatTimezone : undefined,
		revenueMemo: typeof parsed.revenueMemo === "string" ? parsed.revenueMemo : undefined,
	};
}

/** True if `tz` is an IANA timezone the runtime's Intl understands. */
function isValidTimezone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat("en-CA", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** The placeholder object written by `reconcile init`. */
export const PLACEHOLDER_MAP = {
	_placeholder: true,
	_populated_by: "elnora-merit reconcile init",
	currency: "EUR",
	stripeAccount: "",
	cutoffDate: "2026-06-01",
	accounts: { revenue: "", vatPayable: "", stripeFees: "", platformFees: "", refunds: "", clearing: "" },
	vat: { rate: 0.24, code: "" },
	vatTimezone: DEFAULT_VAT_TIMEZONE,
};
