// Shared types for the Stripe → Merit reconcile pipeline.
//
// Money is carried in integer MINOR units (cents) everywhere inside the pipeline
// to avoid floating-point drift; it is only converted to a decimal string when a
// Merit payload is built (see post.ts). All Stripe amounts are already minor units.

/** A Stripe payout (one bank deposit). */
export interface StripePayout {
	id: string;
	amount: number; // minor units, net amount deposited to the bank
	currency: string;
	created: number; // unix seconds
	arrival_date: number; // unix seconds
	status: string;
}

/** A Stripe charge object (the `source` of a charge balance transaction, expanded). */
export interface StripeCharge {
	id: string;
	amount: number;
	currency: string;
	description: string | null;
	receipt_email: string | null;
	billing_details?: {
		name: string | null;
		email: string | null;
		phone?: string | null;
		address?: {
			line1?: string | null;
			line2?: string | null;
			city?: string | null;
			state?: string | null;
			postal_code?: string | null;
			country?: string | null;
		} | null;
	};
	customer?: string | null;
	metadata?: Record<string, string>;
	// Stripe Tax breakdown, present only when the account uses Stripe Tax.
	// Used to detect a real tax line and flag mismatches against the configured rate.
	tax?: number | null;
}

/** A Stripe balance transaction. `source` is expanded to the underlying object. */
export interface StripeBalanceTransaction {
	id: string;
	type: string; // "charge" | "payment" | "refund" | "application_fee" | "stripe_fee" | "payout" | ...
	amount: number; // minor units (signed)
	fee: number; // Stripe processing fee on this txn (minor units)
	net: number; // amount - fee (minor units)
	currency: string;
	created: number;
	source: StripeCharge | { id: string } | string | null;
}

/** One ticket charge, normalized for booking. */
export interface ChargeItem {
	chargeId: string;
	grossMinor: number; // what the buyer paid (incl. VAT)
	stripeFeeMinor: number; // Stripe processing fee attributed to this charge
	netMinor: number; // grossMinor - stripeFeeMinor
	created: number;
	currency: string;
	buyerName: string | null;
	buyerEmail: string | null;
	// Billing address from Stripe (often empty for Luma checkouts); Merit's customer
	// creation expects these keys present, so we carry them through.
	billing: { address: string; city: string; county: string; postalCode: string; phone: string; country: string };
	description: string | null;
	stripeTaxMinor: number | null; // VAT from Stripe Tax, if the account records it
	// An existing Merit/Stripe invoice number to match against, taken from the
	// charge metadata key `invoice_no` when present (lets the connector reconcile
	// to a human-entered invoice instead of creating a new one).
	invoiceNoHint: string | null;
}

/** A payout's transactions classified into booking buckets. All amounts minor units. */
export interface PayoutBatch {
	payout: StripePayout;
	charges: ChargeItem[];
	applicationFeesMinor: number; // Luma 5% (and any other platform fee), as a positive total
	refundsMinor: number; // refunds in this payout, positive total
	otherFeesMinor: number; // any stripe_fee/other negative txns not attached to a charge
	currency: string;
}

/** The account/VAT mapping loaded from stripe-map.json. */
export interface StripeMap {
	currency: string;
	stripeAccount?: string; // optional guard: refuse if the key's account differs
	cutoffDate: string; // YYYY-MM-DD; forward-only start
	accounts: {
		revenue: string;
		vatPayable: string;
		stripeFees: string;
		platformFees: string;
		refunds: string;
		// GL code of the Stripe clearing account. The GL batch debits the gross into
		// this account, the fee GL credits it, and the real LHV bank-import row clears
		// it to zero in the Merit UI.
		clearing: string;
	};
	vat: {
		rate: number; // e.g. 0.24
		code: string; // Merit TaxId (Guid) for that rate
	};
	// IANA timezone the VAT periods are kept in (the company's tax jurisdiction), e.g.
	// "Europe/Tallinn" (EE) or "Europe/Warsaw" (PL). Month boundaries and the GL BatchDate
	// are computed in this zone so a charge captured just before local midnight on the last
	// day of a month is not pushed into the next VAT period by a UTC offset. Default
	// DEFAULT_VAT_TIMEZONE (Europe/Tallinn) — override for a different jurisdiction.
	vatTimezone?: string;
	// Memo written onto the revenue GL line of every booked payout. Defaults to a generic
	// label; set it to describe your own sales (e.g. "Online card sales (net of VAT)").
	revenueMemo?: string;
}
