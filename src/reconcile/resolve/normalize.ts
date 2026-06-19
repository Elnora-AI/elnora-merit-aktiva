// Name/token normalization shared by the äriregister index and the resolver.
//
// The matching problem: a Stripe charge carries an email (and rarely a name), and
// we must tie it to an Estonian legal entity in the business register, whose legal
// name almost never equals the email domain ("bondora.com" → "Bondora AS"). We match
// on a normalized COMPACT form: lowercase, diacritics folded to ASCII (so an ASCII
// domain token matches a name with õäöü), legal-form words dropped ("OÜ", "AS", …),
// and every non-alphanumeric character removed. "1Office Estonia OÜ" → "1officeestonia",
// "Nanordica Medical OÜ" → "nanordicamedical", "Õun AS" → "oun".

// Estonian (and a few PL) legal-form words to drop from a company name before compacting.
// Stored DIACRITICS-FOLDED ("oü" → "ou") because compactName folds the name first and
// then compares word-by-word against this set — keeping the raw diacritic forms here
// would leave every "OÜ"/"MTÜ" suffix in the compact key and break exact matching.
const LEGAL_FORM_WORDS = new Set(
	[
		"oü",
		"osaühing",
		"as",
		"aktsiaselts",
		"mtü",
		"mittetulundusühing",
		"sa",
		"sihtasutus",
		"tü",
		"tulundusühistu",
		"fie",
		"ühistu",
		"usaldusühing",
		"uü",
		// Polish forms (Merit also serves PL); harmless for EE.
		"sp",
		"zoo",
		"spzoo",
	].map((w) => foldDiacritics(w)),
);

/** Fold Latin diacritics (incl. Estonian õäöüšž) to ASCII. Keeps alphanumerics. */
export function foldDiacritics(s: string): string {
	// Decompose to base char + combining marks, then strip the combining-mark range (U+0300–U+036F).
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

/**
 * Compact a company name to its match key: lowercase, diacritics folded, legal-form
 * words removed, all non-alphanumerics stripped. Returns "" for a name that is only
 * a legal form. Example: "Reverse Resources OÜ" → "reverseresources".
 */
export function compactName(name: string): string {
	const folded = foldDiacritics(name.toLowerCase());
	const words = folded.split(/[^a-z0-9]+/).filter((w) => w.length > 0 && !LEGAL_FORM_WORDS.has(w));
	return words.join("");
}

/** True if the name contains an Estonian legal-form word (OÜ, AS, MTÜ, …) — i.e. it reads
 *  as a company, not a person. Diacritics are folded so "OÜ" / "MTÜ" are caught. */
export function hasLegalFormWord(name: string): boolean {
	return foldDiacritics(name.toLowerCase())
		.split(/[^a-z0-9]+/)
		.some((w) => w.length > 0 && LEGAL_FORM_WORDS.has(w));
}

/**
 * The match token for an email domain: the registrable label (the part before the
 * public suffix), diacritics folded, non-alphanumerics stripped. "ragnar@1office.co"
 * → "1office"; "h@oixio.eu" → "oixio"; "x@mail.sub.acme.ee" → "acme". Heuristic: the
 * second-to-last dot-separated label (good enough for the flat TLDs we see; multi-part
 * suffixes like co.uk are rare for EE buyers and fall through to review anyway).
 */
export function domainToken(domain: string): string {
	const labels = domain
		.toLowerCase()
		.trim()
		.split(".")
		.filter((l) => l.length > 0);
	if (labels.length === 0) return "";
	const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
	return foldDiacritics(label).replace(/[^a-z0-9]/g, "");
}

/** The domain part of an email, lowercased; null if the address has no "@domain". */
export function emailDomain(email: string | null): string | null {
	if (!email) return null;
	const at = email.lastIndexOf("@");
	if (at < 0 || at === email.length - 1) return null;
	return (
		email
			.slice(at + 1)
			.toLowerCase()
			.trim() || null
	);
}
