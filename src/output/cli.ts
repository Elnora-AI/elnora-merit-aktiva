// CLI output helpers for elnora-merit commands.
//
// Single contract every command handler uses:
//   - outputSuccess(data) → stdout, exit 0
//   - outputError(err) inside handleAsyncCommand → stderr, exit code per error
//
// Supports JSON (default), table (`--output table`), and CSV (`--output csv`)
// formats, optional pretty-printing (`--pretty`), and field filtering
// (`--fields a,b`). JSON is compact by default — agents are the primary
// consumer and pretty-printing burns extra tokens for nothing.

import { CliError, EXIT_CODES, ValidationError } from "../utils/errors.js";
import { redactSecrets } from "./formatter.js";

let prettyMode = false;
export function setPrettyMode(value: boolean): void {
	prettyMode = value;
}

type OutputFormat = "json" | "table" | "csv";
let outputFormat: OutputFormat = "json";
export function setOutputFormat(value: string): void {
	const valid: OutputFormat[] = ["json", "table", "csv"];
	if (!valid.includes(value as OutputFormat)) {
		throw new ValidationError(`Invalid --output value: "${value}". Must be one of: ${valid.join(", ")}.`);
	}
	outputFormat = value as OutputFormat;
}

let fieldFilter: string[] | null = null;
export function setFields(value: string): void {
	const fields = value
		.split(",")
		.map((f) => f.trim())
		.filter(Boolean);
	if (fields.length === 0) {
		throw new ValidationError(`Invalid --fields value: "${value}". Provide comma-separated field names.`);
	}
	fieldFilter = fields;
}

/** Test-only: reset module-level state between tests. */
export function _resetOutputState(): void {
	prettyMode = false;
	outputFormat = "json";
	fieldFilter = null;
}

/** Keys whose value is a non-empty array of objects (candidate tables). */
function arrayKeys(obj: Record<string, unknown>): string[] {
	return Object.keys(obj).filter((key) => {
		if (!Array.isArray(obj[key]) || (obj[key] as unknown[]).length === 0) return false;
		const first = (obj[key] as unknown[])[0];
		return typeof first === "object" && first !== null;
	});
}

function findDataArray(data: unknown): { key: string; rows: Record<string, unknown>[] } | null {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
	const obj = data as Record<string, unknown>;
	const keys = arrayKeys(obj);
	if (keys.length === 0) return null;
	return { key: keys[0], rows: obj[keys[0]] as Record<string, unknown>[] };
}

/** Warn (once, on the render path) when a response has more than one list field. */
function warnMultipleArrays(data: unknown, renderedKey: string): void {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return;
	const keys = arrayKeys(data as Record<string, unknown>);
	if (keys.length > 1) {
		const omitted = keys.filter((k) => k !== renderedKey);
		process.stderr.write(
			`Warning: response has multiple list fields (${keys.join(", ")}); rendering only "${renderedKey}", omitting ${omitted.join(", ")}. Use --output json for the full payload.\n`,
		);
	}
}

function formatCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function unionKeys(rows: Record<string, unknown>[]): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (const row of rows) {
		for (const k of Object.keys(row)) {
			if (!seen.has(k)) {
				seen.add(k);
				ordered.push(k);
			}
		}
	}
	return ordered;
}

function outputTable(data: unknown): void {
	const found = findDataArray(data);
	if (!found) {
		process.stderr.write("Warning: --output table requested but response is not a list. Falling back to JSON.\n");
		process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
		return;
	}
	warnMultipleArrays(data, found.key);
	const { rows } = found;
	const keys = unionKeys(rows);
	const cells = rows.map((row) => keys.map((k) => formatCell(row[k])));
	const MAX_COL_WIDTH = 60;
	const widths = keys.map((k, i) => Math.min(MAX_COL_WIDTH, Math.max(k.length, ...cells.map((row) => row[i].length))));
	const truncateCell = (value: string, maxWidth: number) =>
		value.length > maxWidth ? `${value.slice(0, maxWidth - 3)}...` : value;
	const header = keys.map((k, i) => k.toUpperCase().padEnd(widths[i])).join("  ");
	const separator = widths.map((w) => "-".repeat(w)).join("  ");
	process.stdout.write(`${header}\n${separator}\n`);
	for (const row of cells) {
		process.stdout.write(`${row.map((c, i) => truncateCell(c, widths[i]).padEnd(widths[i])).join("  ")}\n`);
	}
	const obj = data as Record<string, unknown>;
	const meta: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (k !== found.key && typeof v !== "object") meta.push(`${k}: ${v}`);
	}
	if (meta.length > 0) process.stdout.write(`\n${meta.join(" | ")}\n`);
}

function csvEscape(value: string): string {
	// Neutralize spreadsheet formula injection (CWE-1236): a cell whose first character is
	// = + - @ (or a leading tab/CR) is evaluated as a formula by Excel/Sheets/LibreOffice.
	// Prefix it with a single quote so the cell renders as literal text. This must run
	// regardless of RFC-4180 quoting — quoting alone does not stop formula evaluation.
	let v = value;
	if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
	if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
		return `"${v.replace(/"/g, '""')}"`;
	}
	return v;
}

function outputCsv(data: unknown): void {
	const found = findDataArray(data);
	if (!found) {
		process.stderr.write("Warning: --output csv requested but response is not a list. Falling back to JSON.\n");
		process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
		return;
	}
	warnMultipleArrays(data, found.key);
	const { rows } = found;
	const keys = unionKeys(rows);
	process.stdout.write(`${keys.map((k) => csvEscape(k)).join(",")}\n`);
	for (const row of rows) {
		process.stdout.write(`${keys.map((k) => csvEscape(formatCell(row[k]))).join(",")}\n`);
	}
}

function pickFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
	const filtered: Record<string, unknown> = {};
	for (const field of fields) {
		if (field in row) filtered[field] = row[field];
	}
	return filtered;
}

function applyFieldFilter(data: unknown): unknown {
	if (!fieldFilter) return data;
	const found = findDataArray(data);
	if (found) {
		if (found.rows.length > 0) {
			const availableFields = unionKeys(found.rows);
			const availableSet = new Set(availableFields);
			const missingFields = fieldFilter.filter((f) => !availableSet.has(f));
			if (missingFields.length === fieldFilter.length) {
				throw new ValidationError(
					`--fields requested only non-existent field(s): ${missingFields.join(", ")}. Available: ${availableFields.join(", ")}`,
				);
			}
			if (missingFields.length > 0) {
				process.stderr.write(
					`Warning: --fields requested non-existent field(s): ${missingFields.join(", ")}. Available: ${availableFields.join(", ")}\n`,
				);
			}
		}
		const filteredRows = found.rows.map((row) => pickFields(row, fieldFilter as string[]));
		const obj = { ...(data as Record<string, unknown>) };
		obj[found.key] = filteredRows;
		return obj;
	}
	if (typeof data === "object" && data !== null && !Array.isArray(data)) {
		const obj = data as Record<string, unknown>;
		const availableFields = Object.keys(obj);
		const missingFields = fieldFilter.filter((f) => !(f in obj));
		if (missingFields.length === fieldFilter.length) {
			throw new ValidationError(
				`--fields requested only non-existent field(s): ${missingFields.join(", ")}. Available: ${availableFields.join(", ")}`,
			);
		}
		return pickFields(obj, fieldFilter);
	}
	process.stderr.write("Warning: --fields requested but response is not a list or object. Field filter ignored.\n");
	return data;
}

export function outputSuccess(data: unknown): void {
	const filtered = applyFieldFilter(data);
	switch (outputFormat) {
		case "table":
			outputTable(filtered);
			break;
		case "csv":
			outputCsv(filtered);
			break;
		default:
			process.stdout.write(`${prettyMode ? JSON.stringify(filtered, null, 2) : JSON.stringify(filtered)}\n`);
	}
}

export function outputError(error: unknown): void {
	if (error instanceof CliError) {
		const payload: Record<string, unknown> = { error: redactSecrets(error.userMessage) };
		if (error.suggestion) payload.suggestion = error.suggestion;
		if (error.data) {
			for (const [k, v] of Object.entries(error.data)) {
				if (!(k in payload)) payload[k] = typeof v === "string" ? redactSecrets(v) : v;
			}
		}
		process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
	} else if (error instanceof Error) {
		const payload: Record<string, string> = {
			error: redactSecrets(error.message),
			type: error.constructor.name,
		};
		if (process.env.MERIT_CLI_DEBUG) payload.stack = redactSecrets(error.stack ?? "");
		process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
	} else {
		process.stderr.write(`${JSON.stringify({ error: redactSecrets(String(error)) }, null, 2)}\n`);
	}
}

// biome-ignore lint/suspicious/noExplicitAny: handler wrapper must accept any commander action shape
type AsyncHandler = (...args: any[]) => Promise<void>;

export function handleAsyncCommand<T extends AsyncHandler>(fn: T): T {
	return (async (...args: unknown[]) => {
		try {
			await fn(...args);
		} catch (error) {
			outputError(error);
			const code = error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL;
			process.exit(code);
		}
	}) as T;
}
