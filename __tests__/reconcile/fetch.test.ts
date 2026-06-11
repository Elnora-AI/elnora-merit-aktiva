import { describe, expect, it } from "vitest";
import type { StripeClient } from "../../src/client/stripe-client.js";
import { batchImbalanceMinor, cutoffToUnix, fetchPayoutBatch } from "../../src/reconcile/fetch.js";
import type { StripeBalanceTransaction, StripePayout } from "../../src/reconcile/types.js";

const PAYOUT: StripePayout = {
	id: "po_1",
	amount: 41000, // net deposit
	currency: "eur",
	created: 1_700_000_000,
	arrival_date: 1_700_100_000,
	status: "paid",
};

// One charge: gross 44900, stripe fee 1500, net 43400. Application (Luma) fee 2400.
// Expected net = 43400 - 2400 = 41000 → balances to the payout.
const TXNS: StripeBalanceTransaction[] = [
	{
		id: "txn_charge",
		type: "charge",
		amount: 44900,
		fee: 1500,
		net: 43400,
		currency: "eur",
		created: 1_700_000_500,
		source: {
			id: "ch_1",
			amount: 44900,
			currency: "eur",
			description: "Hackathon — Build Day",
			receipt_email: "buyer@example.com",
			billing_details: { name: "Jane Buyer", email: "jane@example.com" },
			metadata: { invoice_no: "LKOZNVBY-0007" },
		} as StripeBalanceTransaction["source"],
	},
	{
		id: "txn_appfee",
		type: "application_fee",
		amount: -2400,
		fee: 0,
		net: -2400,
		currency: "eur",
		created: 1_700_000_600,
		source: "fee_1",
	},
];

function fakeClient(txns: StripeBalanceTransaction[]): StripeClient {
	return { listAll: async () => txns } as unknown as StripeClient;
}

describe("cutoffToUnix", () => {
	it("converts a YYYY-MM-DD to a UTC unix-seconds start of day", () => {
		expect(cutoffToUnix("2026-06-01")).toBe(Math.floor(Date.UTC(2026, 5, 1) / 1000));
	});
	it("rejects a malformed date", () => {
		expect(() => cutoffToUnix("2026/06/01")).toThrow();
	});
	it("rejects a non-calendar date instead of letting Date.UTC roll it over", () => {
		expect(() => cutoffToUnix("2026-13-45")).toThrow(/calendar/);
		expect(() => cutoffToUnix("2026-02-30")).toThrow(/calendar/);
	});
});

describe("fetchPayoutBatch", () => {
	it("classifies charges, fees, and surfaces buyer + invoice hint", async () => {
		const batch = await fetchPayoutBatch(fakeClient(TXNS), PAYOUT);
		expect(batch.charges).toHaveLength(1);
		const c = batch.charges[0];
		expect(c.chargeId).toBe("ch_1");
		expect(c.grossMinor).toBe(44900);
		expect(c.stripeFeeMinor).toBe(1500);
		expect(c.netMinor).toBe(43400);
		expect(c.buyerName).toBe("Jane Buyer");
		expect(c.buyerEmail).toBe("jane@example.com");
		expect(c.invoiceNoHint).toBe("LKOZNVBY-0007");
		expect(batch.applicationFeesMinor).toBe(2400);
	});

	it("balances to zero when the payout net matches charges minus fees", async () => {
		const batch = await fetchPayoutBatch(fakeClient(TXNS), PAYOUT);
		expect(batchImbalanceMinor(batch)).toBe(0);
	});

	it("reports a non-zero imbalance when the numbers don't reconcile", async () => {
		const batch = await fetchPayoutBatch(fakeClient(TXNS), { ...PAYOUT, amount: 40000 });
		expect(batchImbalanceMinor(batch)).toBe(1000);
	});

	it("falls back to receipt_email when billing email is absent", async () => {
		const txns: StripeBalanceTransaction[] = [
			{
				...TXNS[0],
				source: {
					id: "ch_2",
					amount: 44900,
					currency: "eur",
					description: null,
					receipt_email: "fallback@example.com",
					billing_details: { name: "No Email", email: null },
				} as StripeBalanceTransaction["source"],
			},
		];
		const batch = await fetchPayoutBatch(fakeClient(txns), PAYOUT);
		expect(batch.charges[0].buyerEmail).toBe("fallback@example.com");
	});
});
