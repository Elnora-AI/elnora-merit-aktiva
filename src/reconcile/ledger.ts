// Idempotency ledger for reconciled payouts.
//
// Merit has no idempotency key, so booking the same payout twice would double the
// books. We record every successfully booked payout locally; `run` skips a payout
// already in the ledger unless --force. This file is the source of truth for "what
// has been booked" — back it up alongside the books.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_LEDGER_PATH = join(homedir(), ".config", "elnora-merit", "reconcile-ledger.json");

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
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as LedgerFile;
		if (!parsed.entries) return emptyLedger();
		return parsed;
	} catch {
		return emptyLedger();
	}
}

export function isBooked(ledger: LedgerFile, payoutId: string): boolean {
	return payoutId in ledger.entries;
}

export function recordEntry(ledger: LedgerFile, entry: LedgerEntry): void {
	ledger.entries[entry.payoutId] = entry;
}

export function saveLedger(ledger: LedgerFile, path: string = DEFAULT_LEDGER_PATH): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
}
