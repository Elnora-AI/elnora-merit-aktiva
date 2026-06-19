// Estonian Business Register (äriregister) open-data cache + lookup index.
//
// Source: the daily "Basic data" file (ettevotja_rekvisiidid__lihtandmed), published
// under CC BY 4.0. Columns (semicolon-separated, UTF-8 BOM):
//   0 nimi (name) · 1 ariregistri_kood (registrikood) · 2 ettevotja_oiguslik_vorm
//   · 4 kmkr_nr (VAT) · 5 ettevotja_staatus ("R" = registered/active) · …
// A field may contain commas (addresses) but never the ";" delimiter, so a plain split
// is safe. We cache the unzipped CSV under ~/.config/elnora-merit and refresh on a TTL.
//
// This is the source of registrikood + VAT for matched buyers. VIES (vies.ts) then
// validates the VAT independently.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { compactName } from "./normalize.js";
import type { AriregCompany, CompanyCandidate, MatchReason } from "./types.js";

export const ARIREG_ZIP_URL =
	"https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__lihtandmed.csv.zip";

export const DEFAULT_ARIREG_CACHE = join(homedir(), ".config", "elnora-merit", "arireg-lihtandmed.csv");

/** Default freshness window for the cached CSV before a re-download is attempted. */
const DEFAULT_MAX_AGE_DAYS = 7;

export interface EnsureCacheOptions {
	cachePath?: string;
	maxAgeDays?: number;
	/** Force a re-download even if the cache is fresh. */
	refresh?: boolean;
	/** When false, never hit the network — fail if the cache is missing (for tests/offline). */
	allowDownload?: boolean;
}

async function download(cachePath: string): Promise<void> {
	process.stderr.write("Downloading äriregister open data (~18 MB)...\n");
	const res = await fetch(ARIREG_ZIP_URL);
	if (!res.ok) throw new Error(`äriregister download failed: HTTP ${res.status} on ${ARIREG_ZIP_URL}`);
	const zip = new Uint8Array(await res.arrayBuffer());
	const files = unzipSync(zip);
	const csvEntry = Object.entries(files).find(([name]) => name.toLowerCase().endsWith(".csv"));
	if (!csvEntry) throw new Error("äriregister zip contained no .csv entry");
	mkdirSync(dirname(cachePath), { recursive: true });
	writeFileSync(cachePath, Buffer.from(csvEntry[1]));
}

function ageDays(path: string): number {
	const mtimeMs = statSync(path).mtimeMs;
	return (Date.now() - mtimeMs) / 86_400_000;
}

/**
 * Ensure the äriregister CSV is cached and reasonably fresh; return its path. Downloads
 * when missing, when older than maxAgeDays, or when refresh is set. If a refresh fails
 * but a stale cache exists, the stale copy is used with a warning (offline resilience).
 */
export async function ensureAriregCsv(opts: EnsureCacheOptions = {}): Promise<string> {
	const cachePath = opts.cachePath ?? DEFAULT_ARIREG_CACHE;
	const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
	const allowDownload = opts.allowDownload ?? true;
	const exists = existsSync(cachePath);

	if (!exists) {
		if (!allowDownload) throw new Error(`äriregister cache not found at ${cachePath} and downloads are disabled.`);
		await download(cachePath);
		return cachePath;
	}
	const stale = opts.refresh || ageDays(cachePath) > maxAgeDays;
	if (stale && allowDownload) {
		try {
			await download(cachePath);
		} catch (err) {
			process.stderr.write(
				`Warning: could not refresh äriregister cache (${(err as Error).message}); using cached copy.\n`,
			);
		}
	}
	return cachePath;
}

const REASON_RANK: Record<MatchReason, number> = {
	override: 0,
	"stripe-vat": 1,
	"stripe-name": 2,
	"buyer-name-exact": 3,
	"name-exact": 4,
	"name-startswith": 5,
	"name-contains": 6,
};

/** Normalize a VAT id to a comparison key: uppercase, no spaces (e.g. "ee 100 1" → "EE1001"). */
export function normalizeVat(vat: string): string {
	return vat.toUpperCase().replace(/\s+/g, "");
}

/** In-memory lookup over the äriregister rows. Built once per CLI run. */
export class AriregIndex {
	private readonly rows: AriregCompany[];
	private readonly compacts: string[];
	private readonly byCompact: Map<string, number[]>;
	private readonly byVat: Map<string, number[]>;

	private constructor(rows: AriregCompany[], compacts: string[]) {
		this.rows = rows;
		this.compacts = compacts;
		this.byCompact = new Map();
		this.byVat = new Map();
		for (let i = 0; i < compacts.length; i++) {
			const key = compacts[i];
			if (key) {
				const list = this.byCompact.get(key);
				if (list) list.push(i);
				else this.byCompact.set(key, [i]);
			}
			const vat = rows[i].vat;
			if (vat) {
				const vk = normalizeVat(vat);
				const vlist = this.byVat.get(vk);
				if (vlist) vlist.push(i);
				else this.byVat.set(vk, [i]);
			}
		}
	}

	/** Build an index from in-memory companies (tests, and any non-CSV source). */
	static fromCompanies(companies: AriregCompany[]): AriregIndex {
		return new AriregIndex(
			companies.slice(),
			companies.map((c) => compactName(c.name)),
		);
	}

	/** Parse the cached CSV into an index. */
	static fromCsv(csvPath: string): AriregIndex {
		const text = readFileSync(csvPath, "utf8");
		const rows: AriregCompany[] = [];
		const compacts: string[] = [];
		let first = true;
		for (const rawLine of text.split("\n")) {
			const line = rawLine.replace(/\r$/, "").replace(/^﻿/, "");
			if (line.length === 0) continue;
			if (first) {
				first = false; // header
				continue;
			}
			const f = line.split(";");
			if (f.length < 6) continue;
			const name = f[0].trim();
			const regNo = f[1].trim();
			if (!name || !regNo) continue;
			const vat = f[4].trim();
			const company: AriregCompany = {
				name,
				regNo,
				legalForm: f[2].trim(),
				vat: vat || null,
				active: f[5].trim() === "R",
			};
			rows.push(company);
			compacts.push(compactName(name));
		}
		return new AriregIndex(rows, compacts);
	}

	get size(): number {
		return this.rows.length;
	}

	/** Exact compact-name match (used for the Stripe buyer name). Active entities only. */
	findByExactName(name: string): AriregCompany[] {
		const key = compactName(name);
		if (!key) return [];
		const idxs = this.byCompact.get(key) ?? [];
		return idxs.map((i) => this.rows[i]).filter((c) => c.active);
	}

	/** Exact VAT-number match. Returns all entities (rare collisions, e.g. VAT groups). */
	findByVat(vat: string): AriregCompany[] {
		const idxs = this.byVat.get(normalizeVat(vat)) ?? [];
		return idxs.map((i) => this.rows[i]);
	}

	/**
	 * Candidates for an email-domain token, ranked exact → startswith → contains, with
	 * active entities and VAT-registered ones preferred. Tokens shorter than 3 chars are
	 * ignored (too noisy); "contains" requires ≥4 chars.
	 */
	searchByToken(token: string): CompanyCandidate[] {
		if (token.length < 3) return [];
		const out: CompanyCandidate[] = [];
		for (let i = 0; i < this.rows.length; i++) {
			const c = this.compacts[i];
			if (!c) continue;
			let reason: MatchReason | null = null;
			if (c === token) reason = "name-exact";
			else if (c.startsWith(token)) reason = "name-startswith";
			else if (token.length >= 4 && c.includes(token)) reason = "name-contains";
			if (reason) out.push({ ...this.rows[i], matchReason: reason });
		}
		return sortCandidates(out);
	}
}

/** Rank: by match reason, then active first, then VAT-registered first, then name. */
export function sortCandidates(cands: CompanyCandidate[]): CompanyCandidate[] {
	return cands.slice().sort((a, b) => {
		const r = REASON_RANK[a.matchReason] - REASON_RANK[b.matchReason];
		if (r !== 0) return r;
		if (a.active !== b.active) return a.active ? -1 : 1;
		const av = a.vat ? 0 : 1;
		const bv = b.vat ? 0 : 1;
		if (av !== bv) return av - bv;
		return a.name.localeCompare(b.name);
	});
}
