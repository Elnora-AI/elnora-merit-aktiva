import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isBooked, type LedgerEntry, loadLedger, recordEntry, saveLedger } from "../../src/reconcile/ledger.js";

function tmpLedgerPath(): string {
	return join(mkdtempSync(join(tmpdir(), "merit-ledger-")), "reconcile-ledger.json");
}

const ENTRY: LedgerEntry = {
	payoutId: "po_1",
	amountMinor: 41000,
	currency: "eur",
	postedAt: "2026-06-14T00:00:00.000Z",
	chargeCount: 1,
	glPosted: true,
};

describe("ledger", () => {
	it("returns an empty ledger when the file does not exist", () => {
		const ledger = loadLedger("/nope/ledger.json");
		expect(ledger.entries).toEqual({});
	});

	it("records, persists, and reloads an entry (idempotency)", () => {
		const path = tmpLedgerPath();
		const ledger = loadLedger(path);
		expect(isBooked(ledger, "po_1")).toBe(false);
		recordEntry(ledger, ENTRY);
		saveLedger(ledger, path);

		const reloaded = loadLedger(path);
		expect(isBooked(reloaded, "po_1")).toBe(true);
		expect(reloaded.entries.po_1.amountMinor).toBe(41000);
	});
});
