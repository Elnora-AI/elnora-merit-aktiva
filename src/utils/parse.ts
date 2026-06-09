// Input parsing + validation utilities. Pure functions, no API calls.

import { readFileSync } from "node:fs";
import { ValidationError } from "./errors.js";

/**
 * Strip ONE balanced pair of wrapping single/double quotes, if present. Unlike a
 * naive `^["']|["']$` strip, this leaves asymmetric or quote-bearing values intact
 * (e.g. `it's` or `abc"` are returned unchanged).
 */
export function stripWrappingQuotes(value: string): string {
	return value.replace(/^(["'])([\s\S]*)\1$/, "$2");
}

/**
 * Parse a date for a Merit query field. Accepts `YYYY-MM-DD` or `YYYYMMDD` and
 * returns Merit's wire format `YYYYMMDD`. Rejects non-calendar dates.
 */
export function parseDateYmd(value: string | undefined, flagName = "--date"): string | undefined {
	if (!value) return undefined;
	const compact = value.replace(/-/g, "");
	if (!/^\d{8}$/.test(compact)) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Use YYYY-MM-DD or YYYYMMDD.`);
	}
	const y = Number(compact.slice(0, 4));
	const m = Number(compact.slice(4, 6));
	const d = Number(compact.slice(6, 8));
	const date = new Date(Date.UTC(y, m - 1, d));
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Not a real calendar date.`);
	}
	return compact;
}

/**
 * Parse a Merit Palk date. Palk's wire format is `YYYY-MM-DD` (per the Palk
 * reference manual's Request Format table) — NOT Aktiva's compact `YYYYMMDD`.
 * Accepts `YYYY-MM-DD` or `YYYYMMDD` input and returns `YYYY-MM-DD`.
 */
export function parseDateIso(value: string | undefined, flagName = "--date"): string | undefined {
	if (!value) return undefined;
	const compact = value.replace(/-/g, "");
	if (!/^\d{8}$/.test(compact)) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Use YYYY-MM-DD.`);
	}
	const y = Number(compact.slice(0, 4));
	const m = Number(compact.slice(4, 6));
	const d = Number(compact.slice(6, 8));
	const date = new Date(Date.UTC(y, m - 1, d));
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Not a real calendar date.`);
	}
	return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/**
 * Parse a Merit Palk accounting month. Wire format is `YYYYMM` (6 digits, e.g.
 * 202401 for January 2024). Accepts `YYYY-MM` or `YYYYMM` and returns `YYYYMM`.
 */
export function parseYearMonth(value: string | undefined, flagName = "--month"): string | undefined {
	if (!value) return undefined;
	const compact = value.replace(/-/g, "");
	if (!/^\d{6}$/.test(compact)) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Use YYYYMM (e.g. 202401).`);
	}
	const m = Number(compact.slice(4, 6));
	if (m < 1 || m > 12) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Month must be 01–12.`);
	}
	return compact;
}

/** Parse a positive integer flag (no upper cap). Returns defaultValue when unset. */
export function parsePositiveInt(
	value: string | undefined,
	flagName: string,
	defaultValue?: number,
): number | undefined {
	if (value === undefined) return defaultValue;
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Must be a positive integer.`);
	}
	return n;
}

/**
 * Parse a non-negative integer flag (0 allowed; no upper cap). Returns defaultValue when unset.
 * Use for enum-style flags whose lowest valid value is 0 — e.g. Merit `DateType` (0 = document
 * date, 1 = changed date), which `parsePositiveInt` would wrongly reject.
 */
export function parseNonNegativeInt(
	value: string | undefined,
	flagName: string,
	defaultValue?: number,
): number | undefined {
	if (value === undefined) return defaultValue;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Must be a non-negative integer.`);
	}
	return n;
}

/**
 * Parse a decimal/number flag. Returns undefined when unset. Accepts a plain decimal
 * (optional sign, digits, optional fraction) — rejects empty/whitespace, hex (`0x10`),
 * and exponent (`1e3`) forms that `Number()` would silently coerce. Important for money
 * fields, where an empty value must error rather than become 0.
 */
export function parseDecimal(value: string | undefined, flagName: string): number | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
		throw new ValidationError(`Invalid ${flagName} value: "${value}". Must be a decimal number.`);
	}
	return Number(trimmed);
}

/**
 * Parse a boolean flag value that may arrive as a string. Accepts true/false,
 * 1/0, yes/no (case-insensitive). Returns undefined when unset.
 */
export function parseBool(value: string | boolean | undefined, flagName: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "boolean") return value;
	const v = value.trim().toLowerCase();
	if (["true", "1", "yes", "y"].includes(v)) return true;
	if (["false", "0", "no", "n"].includes(v)) return false;
	throw new ValidationError(`Invalid ${flagName} value: "${value}". Must be true or false.`);
}

/**
 * Read a JSON request body from `--data <json>` (inline string) or
 * `--file <path>` (path to a .json file). Returns the parsed object, or
 * undefined if neither is provided. Throws ValidationError on invalid JSON or
 * an unreadable file.
 *
 * Merit's create/send endpoints take rich, nested bodies (invoices with line
 * rows + tax arrays, GL batches, etc.). Rather than flatten every field into a
 * flag, those commands accept the documented JSON body directly via --data/--file.
 */
export function readJsonBody(opts: { data?: string; file?: string }): unknown | undefined {
	let raw: string | undefined;
	let origin: string;
	if (opts.file) {
		origin = `--file ${opts.file}`;
		try {
			raw = readFileSync(opts.file, "utf8");
		} catch (err) {
			throw new ValidationError(`Could not read ${origin}: ${(err as Error).message}`);
		}
	} else if (opts.data) {
		origin = "--data";
		raw = opts.data;
	} else {
		return undefined;
	}
	try {
		return JSON.parse(raw);
	} catch (err) {
		throw new ValidationError(`Invalid JSON in ${origin}: ${(err as Error).message}`);
	}
}

/**
 * Resolve a request body for a create/send command: prefer the explicit JSON
 * body (--data/--file); otherwise fall back to a body assembled from flags.
 * Throws if the resulting body has no fields and one is required.
 *
 * `mergeFlags`: when true and the JSON body is a plain object, the flag-derived
 * values are merged in as defaults BENEATH the JSON body (the body wins on key
 * conflicts). Use it for `<id>` commands so the positional Id (and similar identity
 * flags) survive even when the caller passes --data/--file without repeating it —
 * otherwise the explicit body would silently drop the target Id. Default false keeps
 * the "--data overrides flags" behavior for value-only commands.
 */
export function resolveBody(
	jsonBody: unknown | undefined,
	fromFlags: Record<string, unknown>,
	{ required = true, mergeFlags = false }: { required?: boolean; mergeFlags?: boolean } = {},
): unknown {
	const cleaned: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(fromFlags)) {
		if (v !== undefined) cleaned[k] = v;
	}
	if (jsonBody !== undefined) {
		if (mergeFlags && jsonBody !== null && typeof jsonBody === "object" && !Array.isArray(jsonBody)) {
			return { ...cleaned, ...(jsonBody as Record<string, unknown>) };
		}
		return jsonBody;
	}
	if (required && Object.keys(cleaned).length === 0) {
		throw new ValidationError(
			"No request body provided.",
			"Pass --data '<json>' or --file <path.json> with the documented payload, or set the relevant flags.",
		);
	}
	return cleaned;
}

/** Guard: throws if `--yes` isn't set on a destructive command. */
export function requireYes(opts: Record<string, unknown>, action: string): void {
	if (!opts.yes) {
		throw new ValidationError(`Refusing to ${action} without --yes.`, "Re-run with --yes to confirm.");
	}
}
