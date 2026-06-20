// Company profile: a machine-readable snapshot of the account's own reference data
// (chart of accounts, bank accounts, VAT codes, financial years), pulled live from
// Merit by `elnora-merit profile sync`.
//
// This is the structured half of a "company books reference": the real codes an agent
// needs to post correctly, captured once instead of hand-transcribed. The prose half
// (which revenue account to use, KMD cadence, local conventions) stays in the user's
// own markdown notes — the CLI needs the codes, not the explanations.
//
// Holds no secrets (the API key stays in the environment), but it is company-specific,
// so it is gitignored and must never be committed to the public repo.
//
// Resolution: --profile flag › MERIT_COMPANY_PROFILE env › <MERIT_REFERENCES_DIR>/company-profile.json
// (the base dir defaults to ~/.config/elnora-merit).

import { existsSync, readFileSync } from "node:fs";
import { ValidationError } from "../utils/errors.js";
import { configPath } from "./config-dir.js";

export const PROFILE_FILENAME = "company-profile.json";

export const DEFAULT_PROFILE_PATH = configPath(PROFILE_FILENAME);

export interface ProfileAccount {
	code: string;
	name: string;
	accountId: string;
	taxName: string;
}

export interface ProfileBank {
	name: string;
	iban: string;
	bankId: string;
	accountCode: string;
	currency: string;
}

export interface ProfileTax {
	id: string;
	code: string;
	name: string;
	/** Rate as a percentage number, e.g. 24 for 24%. */
	pct: number;
}

export interface ProfileFinancialYear {
	start: string;
	end: string;
	active: boolean;
}

export interface CompanyProfile {
	_generated_by: string;
	syncedAt: string;
	localization: string;
	accounts: ProfileAccount[];
	banks: ProfileBank[];
	taxes: ProfileTax[];
	financialYears: ProfileFinancialYear[];
}

export function resolveProfilePath(flagPath?: string, env: NodeJS.ProcessEnv = process.env): string {
	return flagPath?.trim() || env.MERIT_COMPANY_PROFILE?.trim() || configPath(PROFILE_FILENAME, env);
}

function fail(message: string): never {
	throw new ValidationError(
		message,
		"Run `elnora-merit profile sync` to (re)generate it from your live Merit account.",
	);
}

/** Load and lightly validate the company profile at the resolved path. */
export function loadCompanyProfile(flagPath?: string, env: NodeJS.ProcessEnv = process.env): CompanyProfile {
	const path = resolveProfilePath(flagPath, env);
	if (!existsSync(path)) {
		fail(`Company profile not found at ${path}.`);
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	} catch (err) {
		return fail(`Invalid JSON in ${path}: ${(err as Error).message}`);
	}

	// The profile is machine-generated, so validation is light: confirm the four
	// reference arrays are present and array-typed. A hand-edited or truncated file
	// that drops one of them is the realistic failure we want to catch.
	for (const key of ["accounts", "banks", "taxes", "financialYears"] as const) {
		if (!Array.isArray(parsed[key])) {
			fail(`Company profile at ${path} is missing or has a malformed \`${key}\` array.`);
		}
	}

	return {
		_generated_by: typeof parsed._generated_by === "string" ? parsed._generated_by : "",
		syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : "",
		localization: typeof parsed.localization === "string" ? parsed.localization : "",
		accounts: parsed.accounts as ProfileAccount[],
		banks: parsed.banks as ProfileBank[],
		taxes: parsed.taxes as ProfileTax[],
		financialYears: parsed.financialYears as ProfileFinancialYear[],
	};
}
