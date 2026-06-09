import { describe, expect, it } from "vitest";
import { formatMinor, minorToDecimal } from "../../src/reconcile/money.js";

describe("minorToDecimal", () => {
	it("converts integer minor units to a 2-decimal number", () => {
		expect(minorToDecimal(44900)).toBe(449);
		expect(minorToDecimal(8690)).toBe(86.9);
		expect(minorToDecimal(1)).toBe(0.01);
		expect(minorToDecimal(0)).toBe(0);
	});
	it("handles negatives (refund contra)", () => {
		expect(minorToDecimal(-1000)).toBe(-10);
	});
});

describe("formatMinor", () => {
	it("always shows two decimals", () => {
		expect(formatMinor(44900)).toBe("449.00");
		expect(formatMinor(8690)).toBe("86.90");
		expect(formatMinor(5)).toBe("0.05");
	});
	it("formats negatives", () => {
		expect(formatMinor(-1000)).toBe("-10.00");
	});
});
