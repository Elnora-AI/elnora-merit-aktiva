// Split a gross (VAT-inclusive) charge into net revenue + output VAT.
//
// VAT derives from the REAL transaction (design decision): Luma applies 24% VAT on
// EE tickets (prices are stored ex-VAT, VAT added at checkout), so the Stripe gross
// includes VAT. When the Stripe account records a tax line (Stripe Tax), that line
// is authoritative ("per-invoice from Stripe"); otherwise we split at the configured
// rate. Either way we never assume €0. A present Stripe tax line that disagrees with
// the configured rate is flagged so the operator notices a drift.

/** Tolerance (minor units) for treating a Stripe tax line as matching the rate. */
const VAT_TOLERANCE_MINOR = 1;

export interface VatSplit {
	netMinor: number;
	vatMinor: number;
	source: "stripe-tax" | "rate";
	/** Set when a Stripe tax line was present but disagreed with the configured rate. */
	mismatch?: { ratedVatMinor: number; stripeVatMinor: number };
}

/**
 * @param grossMinor      VAT-inclusive amount the buyer paid, in minor units.
 * @param rate            Configured VAT rate, e.g. 0.24.
 * @param stripeTaxMinor  VAT recorded by Stripe Tax for this charge, or null.
 */
export function splitVat(grossMinor: number, rate: number, stripeTaxMinor: number | null = null): VatSplit {
	// VAT implied by the configured rate on a VAT-inclusive gross.
	const ratedNet = Math.round(grossMinor / (1 + rate));
	const ratedVatMinor = grossMinor - ratedNet;

	if (stripeTaxMinor !== null && stripeTaxMinor !== undefined) {
		const split: VatSplit = {
			vatMinor: stripeTaxMinor,
			netMinor: grossMinor - stripeTaxMinor,
			source: "stripe-tax",
		};
		if (Math.abs(stripeTaxMinor - ratedVatMinor) > VAT_TOLERANCE_MINOR) {
			split.mismatch = { ratedVatMinor, stripeVatMinor: stripeTaxMinor };
		}
		return split;
	}

	return { netMinor: grossMinor - ratedVatMinor, vatMinor: ratedVatMinor, source: "rate" };
}
