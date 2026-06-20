import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCompanyProfile, resolveProfilePath } from "../../src/config/company-profile.js";

function writeProfile(content: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "merit-profile-"));
	const path = join(dir, "company-profile.json");
	writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
	return path;
}

const VALID = {
	_generated_by: "elnora-merit profile sync",
	syncedAt: "2026-06-20T00:00:00.000Z",
	localization: "ee",
	accounts: [{ code: "4000", name: "Müük", accountId: "acc-guid", taxName: "24%" }],
	banks: [{ name: "LHV", iban: "EE00", bankId: "bank-guid", accountCode: "1010", currency: "EUR" }],
	taxes: [{ id: "tax-guid", code: "24", name: "Käibemaks 24%", pct: 24 }],
	financialYears: [{ start: "2026-01-01", end: "2026-12-31", active: true }],
};

describe("resolveProfilePath", () => {
	it("prefers the flag, then env, then the default", () => {
		expect(resolveProfilePath("/a/p.json", {})).toBe("/a/p.json");
		expect(resolveProfilePath(undefined, { MERIT_COMPANY_PROFILE: "/env/p.json" })).toBe("/env/p.json");
		expect(resolveProfilePath(undefined, {})).toMatch(/company-profile\.json$/);
	});

	it("derives the default from MERIT_REFERENCES_DIR", () => {
		expect(resolveProfilePath(undefined, { MERIT_REFERENCES_DIR: "/srv/refs" })).toBe("/srv/refs/company-profile.json");
	});
});

describe("loadCompanyProfile", () => {
	it("loads a valid profile", () => {
		const profile = loadCompanyProfile(writeProfile(VALID));
		expect(profile.accounts).toHaveLength(1);
		expect(profile.taxes[0].id).toBe("tax-guid");
		expect(profile.localization).toBe("ee");
	});

	it("throws a clear error when the file is missing", () => {
		expect(() => loadCompanyProfile("/nope/missing.json")).toThrow(/not found/);
	});

	it("throws on invalid JSON", () => {
		expect(() => loadCompanyProfile(writeProfile("{ not json"))).toThrow(/Invalid JSON/);
	});

	it("rejects a profile missing one of the reference arrays", () => {
		const { taxes, ...withoutTaxes } = VALID;
		void taxes;
		expect(() => loadCompanyProfile(writeProfile(withoutTaxes))).toThrow(/taxes/);
	});

	it("rejects a malformed (non-array) section", () => {
		expect(() => loadCompanyProfile(writeProfile({ ...VALID, banks: {} }))).toThrow(/banks/);
	});
});
