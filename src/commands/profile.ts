// `profile` command group — sync the account's reference data into a local
// company-profile.json and read it back.
//
// `sync` pulls the chart of accounts, banks, VAT codes, and financial years straight
// from the user's own Merit account (the same read endpoints `reconcile init` uses to
// list candidates) and writes a structured snapshot. `show` reads it back, optionally
// sliced to one section. The profile is the machine-readable half of a company books
// reference — see src/config/company-profile.ts.

import { closeSync, fchmodSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command } from "commander";
import { getClient } from "../client/index.js";
import {
	type CompanyProfile,
	loadCompanyProfile,
	type ProfileAccount,
	type ProfileBank,
	type ProfileFinancialYear,
	type ProfileTax,
	resolveProfilePath,
} from "../config/company-profile.js";
import { resolveLocalization } from "../config/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { ValidationError } from "../utils/errors.js";

// --- Mappers from raw Merit payloads to the profile snapshot shape. Exported for tests.

function str(v: unknown): string {
	return v == null ? "" : String(v);
}

export function mapAccounts(raw: unknown): ProfileAccount[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((a) => {
		const o = a as Record<string, unknown>;
		return { code: str(o.Code), name: str(o.Name), accountId: str(o.AccountID), taxName: str(o.TaxName) };
	});
}

export function mapBanks(raw: unknown): ProfileBank[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((b) => {
		const o = b as Record<string, unknown>;
		return {
			name: str(o.Name),
			iban: str(o.IBANCode),
			bankId: str(o.BankId),
			accountCode: str(o.AccountCode),
			currency: str(o.CurrencyCode),
		};
	});
}

export function mapTaxes(raw: unknown): ProfileTax[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((t) => {
		const o = t as Record<string, unknown>;
		return { id: str(o.Id), code: str(o.Code), name: str(o.Name), pct: Number(o.TaxPct ?? 0) };
	});
}

export function mapFinancialYears(raw: unknown): ProfileFinancialYear[] {
	// getaccperiods returns the period array under a misspelled key, "AccPeripods"
	// (Merit's own typo). Accept the correct spelling too in case they ever fix it.
	const env = raw as Record<string, unknown>;
	const periods = env?.AccPeripods ?? env?.AccPeriods;
	if (!Array.isArray(periods)) return [];
	return periods.map((p) => {
		const o = p as Record<string, unknown>;
		return { start: str(o.StartDate), end: str(o.EndDate), active: Boolean(o.Active) };
	});
}

/** Assemble a CompanyProfile from the four raw Merit payloads. `syncedAt` is caller-stamped. */
export function buildProfile(
	parts: { accounts: unknown; banks: unknown; taxes: unknown; periods: unknown },
	syncedAt: string,
	localization: string,
): CompanyProfile {
	return {
		_generated_by: "elnora-merit profile sync",
		syncedAt,
		localization,
		accounts: mapAccounts(parts.accounts),
		banks: mapBanks(parts.banks),
		taxes: mapTaxes(parts.taxes),
		financialYears: mapFinancialYears(parts.periods),
	};
}

export function setupProfileCommand(program: Command): void {
	const grp = program
		.command("profile")
		.description(
			"Company profile: a local snapshot of your account's reference data (chart of accounts, banks, VAT codes, financial years), pulled from Merit. Used as the machine-readable company books reference.",
		);

	grp
		.command("sync")
		.description(
			"Fetch the chart of accounts, banks, VAT codes, and financial years from your live Merit account and write them to company-profile.json (default <MERIT_REFERENCES_DIR>/company-profile.json, mode 0600). Refuses to overwrite without --force.",
		)
		.option("--profile <path>", "Path to the company profile file")
		.option("--force", "Overwrite an existing profile file")
		.action(
			handleAsyncCommand(async (opts: { profile?: string; force?: boolean }) => {
				const path = resolveProfilePath(opts.profile);
				mkdirSync(dirname(path), { recursive: true });

				// Atomic create: `wx` fails with EEXIST if the file exists (no TOCTOU window
				// for a symlink swap); `--force` opts into truncate-overwrite. We operate on
				// the fd so the 0600 bits land on the file we opened, never a swapped-in one.
				let fd: number;
				try {
					fd = openSync(path, opts.force ? "w" : "wx", 0o600);
				} catch (err) {
					if (!opts.force && (err as NodeJS.ErrnoException).code === "EEXIST") {
						throw new ValidationError(
							`A profile already exists at ${path}.`,
							"Re-sync with --force to refresh it from Merit, or pass --profile <path> for a different location.",
						);
					}
					throw err;
				}

				let profile: CompanyProfile;
				try {
					const client = await getClient();
					const [accounts, banks, taxes, periods] = await Promise.all([
						client.call("getaccounts", { version: "v1", body: {} }),
						client.call("getbanks", { version: "v1", body: {} }),
						client.call("gettaxes", { version: "v1", body: {} }),
						client.call("getaccperiods", { version: "v2", body: {} }),
					]);
					profile = buildProfile({ accounts, banks, taxes, periods }, new Date().toISOString(), resolveLocalization());
					writeFileSync(fd, `${JSON.stringify(profile, null, 2)}\n`);
					fchmodSync(fd, 0o600);
				} finally {
					closeSync(fd);
				}

				outputSuccess({
					profilePath: path,
					written: true,
					syncedAt: profile.syncedAt,
					counts: {
						accounts: profile.accounts.length,
						banks: profile.banks.length,
						taxes: profile.taxes.length,
						financialYears: profile.financialYears.length,
					},
				});
			}),
		);

	grp
		.command("show")
		.description("Print the synced company profile, or one section of it.")
		.option("--profile <path>", "Path to the company profile file")
		.option("--section <name>", "Show only one section: accounts | banks | taxes | years")
		.action(
			handleAsyncCommand(async (opts: { profile?: string; section?: string }) => {
				const profile = loadCompanyProfile(opts.profile);
				if (!opts.section) {
					outputSuccess(profile);
					return;
				}
				const section = opts.section.trim().toLowerCase();
				const map: Record<string, unknown[]> = {
					accounts: profile.accounts,
					banks: profile.banks,
					taxes: profile.taxes,
					years: profile.financialYears,
				};
				const items = map[section];
				if (!items) {
					throw new ValidationError(
						`Unknown section "${opts.section}".`,
						"Valid sections: accounts, banks, taxes, years.",
					);
				}
				outputSuccess({ items, count: items.length });
			}),
		);
}
