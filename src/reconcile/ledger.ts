// Idempotency ledger for reconciled payouts.
//
// Merit has no idempotency key, so booking the same payout twice would double the
// books. We record every successfully booked payout locally; `run` skips a payout
// already in the ledger unless --force. This file is the source of truth for "what
// has been booked" — back it up alongside the books.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { configPath } from "../config/config-dir.js";
import { ValidationError } from "../utils/errors.js";

// Honors MERIT_REFERENCES_DIR (default ~/.config/elnora-merit). NB: this file is
// idempotency state — if you relocate the references dir, move the existing ledger
// with it, or `run` will re-book payouts it has no record of. `--ledger` overrides.
export const DEFAULT_LEDGER_PATH = configPath("reconcile-ledger.json");

export interface LedgerEntry {
	payoutId: string;
	amountMinor: number;
	currency: string;
	postedAt: string; // ISO timestamp, stamped by the caller
	chargeCount: number;
	glPosted: boolean;
}

export interface LedgerFile {
	version: 1;
	entries: Record<string, LedgerEntry>;
}

function emptyLedger(): LedgerFile {
	return { version: 1, entries: {} };
}

export function loadLedger(path: string = DEFAULT_LEDGER_PATH): LedgerFile {
	if (!existsSync(path)) return emptyLedger();
	// A ledger that exists but cannot be parsed must FAIL LOUD, never silently reset:
	// an empty ledger makes every previously booked payout look unbooked, and the next
	// `run --yes` would double-book all of them.
	let parsed: LedgerFile;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as LedgerFile;
	} catch (err) {
		throw new ValidationError(
			`The reconcile ledger at ${path} exists but is not valid JSON: ${(err as Error).message}`,
			"The ledger is the source of truth for what has been booked — do NOT delete it blindly. Restore it from a backup, or move it aside and rebuild it from the Merit GL (DocNo = payout id) before running again.",
		);
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.entries !== "object" || parsed.entries === null) {
		throw new ValidationError(
			`The reconcile ledger at ${path} is malformed (missing the \`entries\` object).`,
			"Restore it from a backup, or move it aside and rebuild it from the Merit GL (DocNo = payout id) before running again.",
		);
	}
	return parsed;
}

export function isBooked(ledger: LedgerFile, payoutId: string): boolean {
	return payoutId in ledger.entries;
}

export function recordEntry(ledger: LedgerFile, entry: LedgerEntry): void {
	ledger.entries[entry.payoutId] = entry;
}

export function saveLedger(ledger: LedgerFile, path: string = DEFAULT_LEDGER_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	// Atomic write: a crash mid-write must never leave a truncated ledger behind
	// (loadLedger refuses to read one, halting all booking until it is restored).
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
	chmodSync(tmp, 0o600);
	renameSync(tmp, path);
}
