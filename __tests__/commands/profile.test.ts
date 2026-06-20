import { describe, expect, it } from "vitest";
import { buildProfile, mapAccounts, mapBanks, mapFinancialYears, mapTaxes } from "../../src/commands/profile.js";

// Raw payloads shaped like the Merit read endpoints (getaccounts / getbanks /
// gettaxes / getaccperiods).
const RAW_ACCOUNTS = [
	{ AccountID: "acc-1", Code: "4000", Name: "Müük", TaxName: "24%", NonActive: "false", IsParent: "false" },
	{ AccountID: "acc-2", Code: "1010", Name: "LHV pank", TaxName: "" },
];
const RAW_BANKS = [
	{
		Name: "LHV",
		IBANCode: "EE001234",
		Description: "Main",
		BankId: "bank-1",
		CurrencyCode: "EUR",
		AccountCode: "1010",
	},
];
const RAW_TAXES = [
	{ Id: "tax-1", Code: "24", Name: "Käibemaks 24%", NameEN: "VAT 24%", TaxPct: 24.0 },
	{ Id: "tax-2", Code: "0", Name: "Maksuvaba", TaxPct: 0 },
];
// Merit's getaccperiods misspells the array key as "AccPeripods" (verified against the
// live API); the mapper accepts both that and the correct spelling.
const RAW_PERIODS = {
	SaveFrom: "2026-01-01",
	SaveTo: "2026-12-31",
	AccPeripods: [
		{ AccPeriodId: "p-1", StartDate: "2026-01-01", EndDate: "2026-12-31", Active: true },
		{ AccPeriodId: "p-0", StartDate: "2025-01-01", EndDate: "2025-12-31", Active: false },
	],
};

describe("profile mappers", () => {
	it("maps accounts to code/name/accountId/taxName", () => {
		expect(mapAccounts(RAW_ACCOUNTS)).toEqual([
			{ code: "4000", name: "Müük", accountId: "acc-1", taxName: "24%" },
			{ code: "1010", name: "LHV pank", accountId: "acc-2", taxName: "" },
		]);
	});

	it("maps banks including the BankId guid", () => {
		expect(mapBanks(RAW_BANKS)).toEqual([
			{ name: "LHV", iban: "EE001234", bankId: "bank-1", accountCode: "1010", currency: "EUR" },
		]);
	});

	it("maps taxes with TaxPct coerced to a number", () => {
		const taxes = mapTaxes(RAW_TAXES);
		expect(taxes[0]).toEqual({ id: "tax-1", code: "24", name: "Käibemaks 24%", pct: 24 });
		expect(taxes[1].pct).toBe(0);
	});

	it("unwraps periods from the getaccperiods envelope (misspelled live key)", () => {
		expect(mapFinancialYears(RAW_PERIODS)).toEqual([
			{ start: "2026-01-01", end: "2026-12-31", active: true },
			{ start: "2025-01-01", end: "2025-12-31", active: false },
		]);
	});

	it("also accepts the correctly-spelled AccPeriods key", () => {
		const corrected = { AccPeriods: [{ StartDate: "2026-01-01", EndDate: "2026-12-31", Active: true }] };
		expect(mapFinancialYears(corrected)).toEqual([{ start: "2026-01-01", end: "2026-12-31", active: true }]);
	});

	it("returns empty arrays for missing/malformed payloads", () => {
		expect(mapAccounts(undefined)).toEqual([]);
		expect(mapBanks(null)).toEqual([]);
		expect(mapTaxes({})).toEqual([]);
		expect(mapFinancialYears({})).toEqual([]);
	});
});

describe("buildProfile", () => {
	it("assembles a full profile with the caller-stamped timestamp and localization", () => {
		const profile = buildProfile(
			{ accounts: RAW_ACCOUNTS, banks: RAW_BANKS, taxes: RAW_TAXES, periods: RAW_PERIODS },
			"2026-06-20T12:00:00.000Z",
			"ee",
		);
		expect(profile._generated_by).toBe("elnora-merit profile sync");
		expect(profile.syncedAt).toBe("2026-06-20T12:00:00.000Z");
		expect(profile.localization).toBe("ee");
		expect(profile.accounts).toHaveLength(2);
		expect(profile.banks).toHaveLength(1);
		expect(profile.taxes).toHaveLength(2);
		expect(profile.financialYears).toHaveLength(2);
	});
});
