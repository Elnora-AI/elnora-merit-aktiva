import { describe, expect, it } from "vitest";
import { splitVat } from "../../src/reconcile/vat.js";

describe("splitVat", () => {
	it("splits a 24% VAT-inclusive gross into net + VAT", () => {
		// €449.00 gross at 24% → €362.10 net + €86.90 VAT (matches Luma ex-VAT pricing).
		const { netMinor, vatMinor, source } = splitVat(44900, 0.24);
		expect(netMinor).toBe(36210);
		expect(vatMinor).toBe(8690);
		expect(netMinor + vatMinor).toBe(44900);
		expect(source).toBe("rate");
	});

	it("handles a 0% rate (no VAT) without inventing tax", () => {
		const { netMinor, vatMinor, source } = splitVat(10000, 0);
		expect(netMinor).toBe(10000);
		expect(vatMinor).toBe(0);
		expect(source).toBe("rate");
	});

	it("uses the Stripe tax line when present (authoritative per-invoice)", () => {
		const { netMinor, vatMinor, source, mismatch } = splitVat(44900, 0.24, 8690);
		expect(vatMinor).toBe(8690);
		expect(netMinor).toBe(36210);
		expect(source).toBe("stripe-tax");
		expect(mismatch).toBeUndefined();
	});

	it("flags a Stripe tax line that disagrees with the configured rate", () => {
		// Stripe recorded 0 VAT but the rate says 24% → use Stripe's value, flag it.
		const { vatMinor, netMinor, source, mismatch } = splitVat(44900, 0.24, 0);
		expect(vatMinor).toBe(0);
		expect(netMinor).toBe(44900);
		expect(source).toBe("stripe-tax");
		expect(mismatch).toEqual({ ratedVatMinor: 8690, stripeVatMinor: 0 });
	});

	it("never splits below zero and rounds to the cent", () => {
		const { netMinor, vatMinor } = splitVat(1, 0.24);
		expect(netMinor + vatMinor).toBe(1);
		expect(netMinor).toBeGreaterThanOrEqual(0);
		expect(vatMinor).toBeGreaterThanOrEqual(0);
	});
});
