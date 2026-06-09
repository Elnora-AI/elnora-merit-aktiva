import { describe, expect, it } from "vitest";
import { planPayout } from "../../src/reconcile/plan.js";
import type { PayoutBatch, StripeMap } from "../../src/reconcile/types.js";

const MAP: StripeMap = {
	currency: "EUR",
	cutoffDate: "2026-06-01",
	accounts: {
		revenue: "4000",
		vatPayable: "2310",
		stripeFees: "5290",
		platformFees: "5291",
		refunds: "4001",
		clearing: "1080",
	},
	vat: { rate: 0.24, code: "tax-guid" },
};

function batch(overrides: Partial<PayoutBatch> = {}): PayoutBatch {
	return {
		payout: { id: "po_1", amount: 41000, currency: "eur", created: 1, arrival_date: 2, status: "paid" },
		charges: [
			{
				chargeId: "ch_1",
				grossMinor: 44900,
				stripeFeeMinor: 1500,
				netMinor: 43400,
				created: 100,
				currency: "eur",
				buyerName: "Jane Buyer",
				buyerEmail: "jane@example.com",
				billing: { address: "", city: "", county: "", postalCode: "", phone: "", country: "" },
				description: "ticket",
				stripeTaxMinor: null,
				invoiceNoHint: null,
			},
		],
		applicationFeesMinor: 2400,
		refundsMinor: 0,
		otherFeesMinor: 0,
		currency: "eur",
		...overrides,
	};
}

describe("planPayout", () => {
	it("aggregates gross/net/VAT and is bookable when the batch balances", () => {
		const plan = planPayout(batch(), MAP);
		expect(plan.grossMinor).toBe(44900);
		expect(plan.netMinor).toBe(36210); // 44900 / 1.24
		expect(plan.vatMinor).toBe(8690);
		expect(plan.charges).toHaveLength(1);
		expect(plan.fees.stripeFeeMinor).toBe(1500);
		expect(plan.fees.platformFeeMinor).toBe(2400);
		expect(plan.bookable).toBe(true);
	});

	it("marks the payout unbookable and warns when it does not balance", () => {
		const plan = planPayout(
			batch({ payout: { id: "po_2", amount: 40000, currency: "eur", created: 1, arrival_date: 2, status: "paid" } }),
			MAP,
		);
		expect(plan.bookable).toBe(false);
		expect(plan.warnings.some((w) => w.includes("does not balance"))).toBe(true);
	});

	it("uses the Stripe tax line and warns when it disagrees with the configured rate", () => {
		const b = batch();
		b.charges[0].stripeTaxMinor = 0; // Stripe says no VAT, rate says 24%
		const plan = planPayout(b, MAP);
		expect(plan.vatMinor).toBe(0);
		expect(plan.charges[0].vatSource).toBe("stripe-tax");
		expect(plan.warnings.some((w) => w.includes("≠"))).toBe(true);
	});

	it("refuses to book a balanced payout whose charges span two VAT months", () => {
		const june = Date.UTC(2026, 5, 15, 12) / 1000;
		const july = Date.UTC(2026, 6, 15, 12) / 1000;
		const mkCharge = (created: number) => ({
			chargeId: `ch_${created}`,
			grossMinor: 26908,
			stripeFeeMinor: 0,
			netMinor: 21700,
			created,
			currency: "eur",
			buyerName: null,
			buyerEmail: null,
			billing: { address: "", city: "", county: "", postalCode: "", phone: "", country: "" },
			description: null,
			stripeTaxMinor: null,
			invoiceNoHint: null,
		});
		// Σnet 43400 − appFees 2400 = 41000 = payout → balances; only the month span blocks it.
		const plan = planPayout(
			batch({
				payout: { id: "po_span", amount: 41000, currency: "eur", created: 1, arrival_date: july, status: "paid" },
				charges: [mkCharge(june), mkCharge(july)],
			}),
			MAP,
		);
		expect(plan.imbalanceMinor).toBe(0);
		expect(plan.bookable).toBe(false);
		expect(plan.warnings.some((w) => /span 2026-06 \+ 2026-07/.test(w))).toBe(true);
	});
});
