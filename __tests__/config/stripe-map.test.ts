import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStripeMap, PLACEHOLDER_MAP, resolveMapPath } from "../../src/config/stripe-map.js";

function writeMap(content: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "merit-map-"));
	const path = join(dir, "stripe-map.json");
	writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
	return path;
}

const VALID = {
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

describe("resolveMapPath", () => {
	it("prefers the flag, then env, then the default", () => {
		expect(resolveMapPath("/a/b.json", {})).toBe("/a/b.json");
		expect(resolveMapPath(undefined, { MERIT_STRIPE_MAP: "/env/m.json" })).toBe("/env/m.json");
		expect(resolveMapPath(undefined, {})).toMatch(/stripe-map\.json$/);
	});
});

describe("loadStripeMap", () => {
	it("loads and normalizes a valid map", () => {
		const map = loadStripeMap(writeMap(VALID));
		expect(map.currency).toBe("EUR");
		expect(map.accounts.clearing).toBe("1080");
		expect(map.vat.rate).toBe(0.24);
	});

	it("rejects the shipped placeholder", () => {
		expect(() => loadStripeMap(writeMap(PLACEHOLDER_MAP))).toThrow(/placeholder/);
	});

	it("requires the clearing account", () => {
		const bad = { ...VALID, accounts: { ...VALID.accounts, clearing: "" } };
		expect(() => loadStripeMap(writeMap(bad))).toThrow(/accounts\.clearing/);
	});

	it("requires a VAT code", () => {
		const bad = { ...VALID, vat: { rate: 0.24, code: "" } };
		expect(() => loadStripeMap(writeMap(bad))).toThrow(/vat\.code/);
	});

	it("rejects a malformed cutoff date", () => {
		const bad = { ...VALID, cutoffDate: "June 1" };
		expect(() => loadStripeMap(writeMap(bad))).toThrow(/cutoffDate/);
	});

	it("throws a clear error when the file is missing", () => {
		expect(() => loadStripeMap("/nope/missing.json")).toThrow(/not found/);
	});
});
