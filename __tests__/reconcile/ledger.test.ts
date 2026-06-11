import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

	it("throws (never silently resets) on a corrupt ledger file", () => {
		// A silent reset would make every booked payout look unbooked → mass double-booking.
		const path = tmpLedgerPath();
		writeFileSync(path, '{"version":1,"entries":{"po_1"'); // truncated mid-write
		expect(() => loadLedger(path)).toThrow(/not valid JSON/);
	});

	it("throws on a ledger missing the entries object", () => {
		const path = tmpLedgerPath();
		writeFileSync(path, '{"version":1}');
		expect(() => loadLedger(path)).toThrow(/malformed/);
	});

	it("saves atomically — no .tmp file left behind", () => {
		const path = tmpLedgerPath();
		const ledger = loadLedger(path);
		recordEntry(ledger, ENTRY);
		saveLedger(ledger, path);
		expect(readdirSync(dirname(path))).toEqual(["reconcile-ledger.json"]);
		expect(loadLedger(path).entries.po_1.payoutId).toBe("po_1");
	});
});
