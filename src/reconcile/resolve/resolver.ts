// Resolve a Stripe buyer to an Estonian legal entity, a private individual, or a case
// that needs human review. Pure given its injected dependencies (an AriregIndex, an
// optional override map, and an optional VIES validator), so it is fully unit-testable.
//
// Signal priority (strongest first) — the buyer-entered Stripe identity beats any guess:
//   1. Override (exact email, then domain) — authoritative.
//   2. Stripe VAT id → äriregister-by-VAT + VIES → confirmed.
//   3. Stripe company name → äriregister-by-name → confirmed; a clear PERSON name (no
//      legal form, no register match, unrelated to the domain) → private.
//   4. Fallback for charges without usable Stripe identity: email-domain token / buyer
//      name → äriregister candidates; a unique top-tier match → confirmed, else review.
// A confirmed company carrying a VAT id is VIES-validated; a hard "invalid" (not a
// member-state outage) demotes it to review.

import type { AriregIndex } from "./arireg.js";
import { sortCandidates } from "./arireg.js";
import { isFreeEmailDomain } from "./freemail.js";
import { compactName, domainToken, emailDomain, hasLegalFormWord } from "./normalize.js";
import { findOverride, type OverrideMap } from "./overrides.js";
import type { AriregCompany, BuyerInput, CompanyCandidate, Resolution, ViesResult } from "./types.js";

/** Max candidates carried into the review list (full set is used for the decision). */
const MAX_CANDIDATES = 8;

export interface ResolveDeps {
	arireg: AriregIndex;
	overrides?: OverrideMap;
	/** When provided, used to VIES-validate a confirmed company's VAT id. */
	vies?: (vat: string) => Promise<ViesResult>;
}

type Base = { emailDomain: string | null; freeMail: boolean };

function toCandidate(c: AriregCompany, reason: CompanyCandidate["matchReason"]): CompanyCandidate {
	return { ...c, matchReason: reason };
}

function dedupeByRegNo(cands: CompanyCandidate[]): CompanyCandidate[] {
	const seen = new Map<string, CompanyCandidate>();
	for (const c of cands) {
		if (!seen.has(c.regNo)) seen.set(c.regNo, c); // sorted input ⇒ strongest reason kept
	}
	return [...seen.values()];
}

/** The candidates sharing the best (lowest-rank) match reason among the active set. */
function topTier(cands: CompanyCandidate[]): CompanyCandidate[] {
	const active = cands.filter((c) => c.active);
	const pool = active.length > 0 ? active : cands;
	if (pool.length === 0) return [];
	const best = pool[0].matchReason; // pool is pre-sorted
	return pool.filter((c) => c.matchReason === best);
}

async function viesFor(company: CompanyCandidate, deps: ResolveDeps): Promise<ViesResult | undefined> {
	if (!deps.vies || !company.vat) return undefined;
	return deps.vies(company.vat);
}

function confirmed(
	company: CompanyCandidate,
	candidates: CompanyCandidate[],
	base: Base,
	reason: string,
	vies?: ViesResult,
): Resolution {
	return { ...base, tier: "confirmed", reason, company, candidates: candidates.slice(0, MAX_CANDIDATES), vies };
}

function review(base: Base, candidates: CompanyCandidate[], reason: string, vies?: ViesResult): Resolution {
	return { ...base, tier: "review", reason, company: null, candidates: candidates.slice(0, MAX_CANDIDATES), vies };
}

function privateBuyer(base: Base, reason: string): Resolution {
	return { ...base, tier: "private", reason, company: null, candidates: [] };
}

export async function resolveBuyer(buyer: BuyerInput, deps: ResolveDeps): Promise<Resolution> {
	const domain = emailDomain(buyer.email);
	const base: Base = { emailDomain: domain, freeMail: isFreeEmailDomain(domain) };

	// 1. Override.
	const override = deps.overrides ? findOverride(deps.overrides, buyer.email, domain) : null;
	if (override) {
		if (override.private) return privateBuyer(base, "override: marked private");
		if (override.regNo && override.name) {
			const company = toCandidate(
				{ name: override.name, regNo: override.regNo, legalForm: "", vat: override.vat ?? null, active: true },
				"override",
			);
			return confirmed(company, [company], base, "override", await viesFor(company, deps));
		}
	}

	// 2. Stripe VAT id — the strongest automatic signal.
	if (buyer.vatId) {
		const byVat = deps.arireg.findByVat(buyer.vatId);
		if (byVat.length === 1) {
			const chosen = toCandidate(byVat[0], "stripe-vat");
			return finalize(chosen, [chosen], base, `Stripe VAT ${buyer.vatId} → ${chosen.name}`, deps);
		}
		if (byVat.length > 1) {
			// One VAT shared by several entities = a VAT group. Pick the registrikood whose
			// name matches what the buyer entered; otherwise a human must choose (the INF row
			// is keyed by registrikood, so the wrong sibling would misreport).
			const cands = sortCandidates(byVat.map((c) => toCandidate(c, "stripe-vat")));
			const want = buyer.companyName ? compactName(buyer.companyName) : "";
			const match = want ? cands.find((c) => compactName(c.name) === want) : undefined;
			if (match) return finalize(match, cands, base, `Stripe VAT ${buyer.vatId} + name → ${match.name}`, deps);
			return review(
				base,
				cands,
				`Stripe VAT ${buyer.vatId} is shared by ${byVat.length} entities (VAT group) — pick the registrikood`,
			);
		}
		// VAT the buyer gave isn't in äriregister (foreign / deregistered): verify via VIES,
		// but we lack a registrikood, so a human must complete it.
		const vies = deps.vies ? await deps.vies(buyer.vatId) : undefined;
		return review(
			base,
			[],
			`Stripe VAT ${buyer.vatId} not found in äriregister — verify (foreign or deregistered?)`,
			vies,
		);
	}

	// 3. Stripe company name.
	if (buyer.companyName) {
		const exact = deps.arireg.findByExactName(buyer.companyName);
		if (exact.length === 1) {
			const chosen = toCandidate(exact[0], "stripe-name");
			// Guard against a personal name coincidentally matching a FIE / person-named
			// entity: only auto-confirm when the buyer name or the matched entity reads as a
			// company (legal form), or the name ties to the email domain. A bare personal name
			// matching a FIE goes to review — it may well be a private purchase.
			const companyLike =
				hasLegalFormWord(buyer.companyName) ||
				hasLegalFormWord(chosen.name) ||
				sharesDomainToken(buyer.companyName, domain);
			if (companyLike) {
				return finalize(chosen, [chosen], base, `Stripe customer "${buyer.companyName}" → ${chosen.name}`, deps);
			}
			// A bare personal name that only coincides with a FIE / person-named entity: the
			// buyer entered their own name with no company or VAT, so per policy this is a
			// private purchase (anonymous summary), not a business sale. The matched FIE is
			// noted in case it should be overridden to a business sale.
			return privateBuyer(
				base,
				`personal name "${buyer.companyName}" (coincides with FIE/person-named entity ${chosen.name} ${chosen.regNo}; override if this was a business purchase)`,
			);
		}
		if (exact.length > 1) {
			const cands = sortCandidates(exact.map((c) => toCandidate(c, "stripe-name")));
			return review(base, cands, `Stripe customer "${buyer.companyName}" matches ${exact.length} entities — pick one`);
		}
		// Name not found verbatim in äriregister.
		const looksCompany = hasLegalFormWord(buyer.companyName) || sharesDomainToken(buyer.companyName, domain);
		if (looksCompany) {
			// A declared company we couldn't pin (e.g. "Acme Digital töötaja", or a slight
			// spelling difference) — offer domain-token candidates for the human to choose / research.
			const tokenCands = domain ? deps.arireg.searchByToken(domainToken(domain)) : [];
			return review(
				base,
				sortCandidates(tokenCands),
				`Stripe customer "${buyer.companyName}" not found verbatim in äriregister — verify`,
			);
		}
		// A personal name the buyer entered, unrelated to the domain → a private purchase.
		return privateBuyer(base, `Stripe customer is a personal name ("${buyer.companyName}")`);
	}

	// 4. Fallback: no Stripe identity. Use the billing name + email-domain token.
	const nameMatches: CompanyCandidate[] = buyer.name
		? deps.arireg.findByExactName(buyer.name).map((c) => toCandidate(c, "buyer-name-exact"))
		: [];

	if (!domain) {
		if (nameMatches.length === 1)
			return finalize(nameMatches[0], nameMatches, base, `buyer name → ${nameMatches[0].name}`, deps);
		if (nameMatches.length > 1)
			return review(base, nameMatches, "buyer name matches multiple companies; no email to disambiguate");
		return privateBuyer(base, "no email and no company identity");
	}
	if (base.freeMail) {
		if (nameMatches.length === 1)
			return finalize(nameMatches[0], nameMatches, base, `buyer name → ${nameMatches[0].name}`, deps);
		if (nameMatches.length > 1) return review(base, nameMatches, "free-mail buyer; name matches multiple companies");
		return privateBuyer(base, "free-mail / consumer email domain, no company identity");
	}

	const token = domainToken(domain);
	const merged = dedupeByRegNo(sortCandidates([...nameMatches, ...deps.arireg.searchByToken(token)]));
	if (merged.length === 0) return review(base, [], `no äriregister match for domain "${domain}" (token "${token}")`);
	const top = topTier(merged);
	if (top.length === 1) return finalize(top[0], merged, base, `domain "${domain}" → ${top[0].name}`, deps);
	return review(base, merged, `${top.length} equally-ranked candidates for domain "${domain}" — pick one`);
}

/** True if the company name shares its compact form with the email domain token. */
function sharesDomainToken(name: string, domain: string | null): boolean {
	if (!domain) return false;
	const token = domainToken(domain);
	return token.length >= 3 && compactName(name).includes(token);
}

/**
 * Apply the precision gate + VIES check to a chosen candidate and return confirmed/review.
 * Token-based matches (name-exact/startswith/contains) auto-confirm only when the entity is
 * VAT-registered; Stripe/override/buyer-name matches are independently strong and skip that.
 */
async function finalize(
	chosen: CompanyCandidate,
	allCands: CompanyCandidate[],
	base: Base,
	reason: string,
	deps: ResolveDeps,
): Promise<Resolution> {
	const candidates = allCands.slice(0, MAX_CANDIDATES);
	const tokenBased =
		chosen.matchReason === "name-exact" ||
		chosen.matchReason === "name-startswith" ||
		chosen.matchReason === "name-contains";
	if (tokenBased && !chosen.vat) {
		return review(
			base,
			candidates,
			`matched ${chosen.name} (${chosen.regNo}) by domain but it is not VAT-registered in äriregister — verify before invoicing`,
		);
	}

	const vies = await viesFor(chosen, deps);
	if (vies && vies.valid === false) {
		return review(base, candidates, `matched ${chosen.name} (${chosen.regNo}) but VIES rejects its VAT — verify`, vies);
	}
	const siblings = allCands.length - 1;
	const note = siblings > 0 ? ` (chosen over ${siblings} sibling${siblings > 1 ? "s" : ""})` : "";
	return confirmed(chosen, candidates, base, `${reason}${note}`, vies);
}
