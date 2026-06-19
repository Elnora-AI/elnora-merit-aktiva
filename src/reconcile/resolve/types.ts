// Types for the buyer-identity resolver (Stripe charge → Estonian legal entity).
//
// The resolver decides, for each card charge, whether it is an identifiable Estonian
// business (→ becomes a real sales invoice that reaches KMD INF lisa A), a private
// individual / free-mail buyer (→ stays in the anonymous summary, the correct VAT
// treatment), or something ambiguous a human must classify.

/** What we know about a buyer from a Stripe charge. */
export interface BuyerInput {
	name: string | null;
	email: string | null;
	/** Billing country (ISO-2) from Stripe; usually "" for Luma checkouts. */
	country: string | null;
	/** Company name the buyer entered on the Stripe Customer/Invoice — the strongest signal. */
	companyName?: string | null;
	/** EU VAT id from the Stripe Customer/Invoice tax ids, when present. */
	vatId?: string | null;
}

/** One Estonian business-register entity. */
export interface AriregCompany {
	name: string;
	regNo: string; // ariregistri_kood (registrikood) — the KMD INF lisa A key field
	legalForm: string;
	vat: string | null; // kmkr_nr (KMKR / EU VAT id), null if not VAT-registered
	active: boolean; // status "R" (registrisse kantud)
}

/** Why a candidate matched and how strongly. */
export type MatchReason =
	| "override" // user-confirmed domain/email → company mapping
	| "stripe-vat" // VAT id the buyer entered on the Stripe Customer/Invoice
	| "stripe-name" // company name the buyer entered on the Stripe Customer/Invoice
	| "buyer-name-exact" // the Stripe buyer name equals a company name
	| "name-exact" // compact(name) === domain token
	| "name-startswith" // compact(name) starts with the domain token
	| "name-contains"; // compact(name) contains the domain token

export interface CompanyCandidate extends AriregCompany {
	matchReason: MatchReason;
}

/** Outcome of a VIES VAT check. */
export interface ViesResult {
	checked: boolean;
	/** true/false from VIES; null when the member state was unavailable (NOT a real "invalid"). */
	valid: boolean | null;
	name: string | null;
	note?: string;
}

/** Resolution tier — drives whether the charge is invoiced or summarized. */
export type ResolutionTier =
	| "confirmed" // identifiable EE business → create a müügiarve
	| "review" // company-like but ambiguous/unconfirmed → summary for now + review list
	| "private"; // free-mail or no usable identity → anonymous summary (correct treatment)

export interface Resolution {
	tier: ResolutionTier;
	reason: string;
	emailDomain: string | null;
	freeMail: boolean;
	/** The chosen entity when tier === "confirmed"; otherwise null. */
	company: CompanyCandidate | null;
	/** All candidates considered (top-ranked first) — shown in the review list. */
	candidates: CompanyCandidate[];
	vies?: ViesResult;
}
