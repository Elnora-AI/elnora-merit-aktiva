// Match a missing document against candidate files, by amount, date, and party.
//
// Pure and deterministic: no I/O, no clock. Every candidate carries hints the
// source already parsed (amounts, dates, text); this module scores how well a
// candidate explains a given MissingDoc and picks the best above a threshold.
//
// Scoring is a weighted sum of three independent signals so a strong match on
// two of three still clears the bar, but a lone weak signal never does:
//   amount 0.5, date 0.3, party-name 0.2.

import type { Candidate, DocsyncConfig, MatchResult, MissingDoc, ScoredCandidate } from "./types.js";

const WEIGHT_AMOUNT = 0.5;
const WEIGHT_DATE = 0.3;
const WEIGHT_PARTY = 0.2;

const AMOUNT_RE = /(?<!\d)(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{2}))(?!\d)/g;
const DATE_RE = /(\d{4})[-/.](\d{2})[-/.](\d{2})/g;

/** Normalise a money-like token ("1 347,01", "1,347.01", "89.03") to a number. */
export function parseAmount(token: string): number | null {
	let t = token.trim().replace(/\s/g, "");
	const lastComma = t.lastIndexOf(",");
	const lastDot = t.lastIndexOf(".");
	if (lastComma > -1 && lastDot > -1) {
		// The right-most of . or , is the decimal separator; the other groups thousands.
		const decimalIsComma = lastComma > lastDot;
		t = decimalIsComma ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
	} else if (lastComma > -1) {
		// Only commas: treat as decimal when it looks like ",dd", else thousands.
		t = /,\d{2}$/.test(t) ? t.replace(/\.(?=\d{3})/g, "").replace(",", ".") : t.replace(/,/g, "");
	}
	const n = Number.parseFloat(t);
	return Number.isFinite(n) ? n : null;
}

/** Pull candidate amounts from explicit hints plus the file/text as a fallback. */
export function extractAmounts(candidate: Candidate): number[] {
	const found = new Set<number>();
	for (const a of candidate.hints?.amounts ?? []) if (Number.isFinite(a)) found.add(Math.abs(a));
	const text = `${candidate.fileName} ${candidate.hints?.text ?? ""}`;
	for (const m of text.matchAll(AMOUNT_RE)) {
		const n = parseAmount(m[1]);
		if (n !== null) found.add(Math.abs(n));
	}
	return [...found];
}

/** Pull ISO dates from hints plus the file/text as a fallback. */
export function extractDates(candidate: Candidate): string[] {
	const found = new Set<string>();
	for (const d of candidate.hints?.dates ?? []) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) found.add(d);
	const text = `${candidate.fileName} ${candidate.hints?.text ?? ""}`;
	for (const m of text.matchAll(DATE_RE)) found.add(`${m[1]}-${m[2]}-${m[3]}`);
	return [...found];
}

function daysBetween(aIso: string, bIso: string): number {
	const a = Date.parse(aIso);
	const b = Date.parse(bIso);
	if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
	return Math.abs(a - b) / 86_400_000;
}

/** Reduce a party name to comparable word tokens (drops legal-form noise). */
export function tokenizeParty(name: string | null): string[] {
	if (!name) return [];
	const STOP = new Set(["ou", "oü", "as", "ltd", "limited", "inc", "gmbh", "ab", "oy", "the", "mtu", "mtü"]);
	return name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((w) => w.length > 1 && !STOP.has(w));
}

function partyScore(missing: MissingDoc, candidate: Candidate): number {
	const tokens = tokenizeParty(missing.partyName);
	if (tokens.length === 0) return 0;
	const hay = `${candidate.fileName} ${candidate.hints?.text ?? ""}`.toLowerCase().normalize("NFKD");
	const hits = tokens.filter((tok) => hay.includes(tok)).length;
	return hits / tokens.length;
}

/** Score one candidate for one missing doc. Returns null below any usable signal. */
export function scoreCandidate(
	missing: MissingDoc,
	candidate: Candidate,
	config: DocsyncConfig,
): ScoredCandidate | null {
	const reasons: string[] = [];

	const amounts = extractAmounts(candidate);
	const amountHit = amounts.some((a) => Math.abs(a - missing.grossTotal) <= config.amountTolerance);
	if (amountHit) reasons.push(`amount ${missing.grossTotal.toFixed(2)} matches`);

	let dateHit = false;
	if (missing.docDate) {
		const dates = extractDates(candidate);
		const nearest = Math.min(Number.POSITIVE_INFINITY, ...dates.map((d) => daysBetween(missing.docDate as string, d)));
		dateHit = nearest <= config.dateWindowDays;
		if (dateHit) reasons.push(`date within ${config.dateWindowDays}d`);
	}

	const party = partyScore(missing, candidate);
	if (party > 0) reasons.push(`party ${Math.round(party * 100)}%`);

	const score = (amountHit ? WEIGHT_AMOUNT : 0) + (dateHit ? WEIGHT_DATE : 0) + WEIGHT_PARTY * party;
	if (score <= 0) return null;
	return { candidate, score: Math.min(1, score), reasons };
}

/** Match every missing doc against the candidate pool. */
export function matchAll(missing: MissingDoc[], candidates: Candidate[], config: DocsyncConfig): MatchResult[] {
	return missing.map((doc) => {
		const scored = candidates
			.map((c) => scoreCandidate(doc, c, config))
			.filter((s): s is ScoredCandidate => s !== null)
			.sort((a, b) => b.score - a.score);
		const best = scored[0] && scored[0].score >= config.acceptThreshold ? scored[0] : null;
		const alternatives = scored.filter((s) => s !== best && s.score >= config.reviewThreshold).slice(0, 3);
		return { missing: doc, best, alternatives };
	});
}
