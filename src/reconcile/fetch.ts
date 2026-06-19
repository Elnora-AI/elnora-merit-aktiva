// Pull payouts from Stripe and classify each one's balance transactions into the
// booking buckets the rest of the pipeline consumes.
//
// We anchor on payouts (one payout = one bank deposit) per the design decision:
// the bank feed already imports the deposit, so booking per payout lets the
// real bank line clear against the Stripe clearing account with no double posting.

import type { StripeClient } from "../client/stripe-client.js";
import type { ChargeItem, PayoutBatch, StripeBalanceTransaction, StripeCharge, StripePayout } from "./types.js";

/** Unix-seconds timestamp for the start of a YYYY-MM-DD date (UTC). */
export function cutoffToUnix(cutoffDate: string): number {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cutoffDate.trim());
	if (!m) throw new Error(`Invalid cutoffDate "${cutoffDate}". Use YYYY-MM-DD.`);
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	// Date.UTC silently rolls invalid components over (2026-13-45 → 2027-02-14); a
	// rolled-over cutoff would quietly book the wrong period. Reject non-calendar dates.
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
		throw new Error(`Invalid cutoffDate "${cutoffDate}". Not a real calendar date.`);
	}
	return Math.floor(date.getTime() / 1000);
}

/** List paid payouts created on or after the cutoff, newest first. */
export async function fetchPayouts(client: StripeClient, cutoffDate: string): Promise<StripePayout[]> {
	const payouts = await client.listAll<StripePayout>("payouts", {
		"created[gte]": cutoffToUnix(cutoffDate),
		status: "paid",
	});
	return payouts;
}

function isChargeSource(source: unknown): source is StripeCharge {
	return typeof source === "object" && source !== null && "amount" in (source as Record<string, unknown>);
}

/** Pull and classify one payout's balance transactions into a PayoutBatch. */
export async function fetchPayoutBatch(client: StripeClient, payout: StripePayout): Promise<PayoutBatch> {
	const txns = await client.listAll<StripeBalanceTransaction>("balance_transactions", {
		payout: payout.id,
		"expand[]": "data.source",
	});

	const charges: ChargeItem[] = [];
	let applicationFeesMinor = 0;
	let refundsMinor = 0;
	let otherFeesMinor = 0;

	for (const t of txns) {
		switch (t.type) {
			case "charge":
			case "payment": {
				const src = isChargeSource(t.source) ? t.source : undefined;
				const addr = src?.billing_details?.address ?? undefined;
				const line = [addr?.line1, addr?.line2].filter(Boolean).join(", ");
				charges.push({
					chargeId: typeof t.source === "string" ? t.source : (src?.id ?? t.id),
					grossMinor: t.amount,
					stripeFeeMinor: t.fee,
					netMinor: t.net,
					created: t.created,
					currency: t.currency,
					buyerName: src?.billing_details?.name ?? null,
					buyerEmail: src?.billing_details?.email ?? src?.receipt_email ?? null,
					billing: {
						address: line,
						city: addr?.city ?? "",
						county: addr?.state ?? "",
						postalCode: addr?.postal_code ?? "",
						phone: src?.billing_details?.phone ?? "",
						country: addr?.country ?? "",
					},
					description: src?.description ?? null,
					// Always null today: the Stripe Charge object carries no tax amount.
					// Reading Stripe Tax authoritatively requires the Tax Transactions API
					// (future work); until then the configured rate does the VAT split.
					stripeTaxMinor: null,
					invoiceNoHint: src?.metadata?.invoice_no ?? null,
					customerId: src?.customer ?? null,
					invoiceId: src?.invoice ?? null,
					// Filled by enrichChargeIdentity (a separate, opt-in pass).
					companyName: null,
					vatId: null,
				});
				break;
			}
			case "refund":
			case "payment_refund":
				refundsMinor += Math.abs(t.amount);
				break;
			case "application_fee":
				applicationFeesMinor += Math.abs(t.amount);
				break;
			case "payout":
				// The payout's own balance transaction — ignore; payout.amount is authoritative.
				break;
			default:
				// stripe_fee, adjustment, etc. — fold the net effect into "other fees".
				// Positive amounts (money in) would distort the batch, so only count outflows.
				if (t.amount < 0) otherFeesMinor += Math.abs(t.amount);
				break;
		}
	}

	return {
		payout,
		charges,
		applicationFeesMinor,
		refundsMinor,
		otherFeesMinor,
		currency: payout.currency,
	};
}

interface StripeTaxId {
	type?: string;
	value?: string;
}
interface StripeCustomerObj {
	id: string;
	name?: string | null;
	address?: { country?: string | null } | null;
	tax_ids?: { data?: StripeTaxId[] } | null;
}
interface StripeInvoiceObj {
	id: string;
	customer_name?: string | null;
	customer_address?: { country?: string | null } | null;
	customer_tax_ids?: StripeTaxId[] | null;
}

/** Pick the EU VAT id from a Stripe tax_ids list, else the first id with a value. */
function pickEuVat(taxIds: StripeTaxId[] | undefined | null): string | null {
	if (!taxIds || taxIds.length === 0) return null;
	const eu = taxIds.find((t) => t.type === "eu_vat" && t.value) ?? taxIds.find((t) => t.value);
	return eu?.value ?? null;
}

/**
 * Enrich charges in place with the buyer's company name + VAT id from the Stripe Customer
 * and Invoice objects — the authoritative identity the buyer entered, far stronger than the
 * usually-empty billing_details. Opt-in (not run by preview/run, which only summarise):
 * the identity resolver and the invoicing path call it. Fetches are cached per id and
 * failures are swallowed (enrichment is best-effort; a missing customer just stays null).
 */
export async function enrichChargeIdentity(client: StripeClient, charges: ChargeItem[]): Promise<void> {
	const custCache = new Map<string, StripeCustomerObj | null>();
	const invCache = new Map<string, StripeInvoiceObj | null>();
	for (const c of charges) {
		// Prefer the Invoice (an explicit billing document) over the bare Customer.
		if (c.invoiceId) {
			let inv = invCache.get(c.invoiceId);
			if (inv === undefined) {
				try {
					inv = await client.get<StripeInvoiceObj>(`invoices/${encodeURIComponent(c.invoiceId)}`);
				} catch {
					inv = null;
				}
				invCache.set(c.invoiceId, inv);
			}
			if (inv) {
				c.companyName = inv.customer_name ?? c.companyName;
				c.vatId = pickEuVat(inv.customer_tax_ids) ?? c.vatId;
				if (!c.billing.country && inv.customer_address?.country) c.billing.country = inv.customer_address.country;
			}
		}
		if (c.customerId) {
			let cust = custCache.get(c.customerId);
			if (cust === undefined) {
				try {
					cust = await client.get<StripeCustomerObj>(`customers/${encodeURIComponent(c.customerId)}`, {
						"expand[]": "tax_ids",
					});
				} catch {
					cust = null;
				}
				custCache.set(c.customerId, cust);
			}
			if (cust) {
				if (!c.companyName) c.companyName = cust.name ?? null;
				if (!c.vatId) c.vatId = pickEuVat(cust.tax_ids?.data);
				if (!c.billing.country && cust.address?.country) c.billing.country = cust.address.country;
			}
		}
	}
}

/**
 * The Stripe-side identity that must hold for a payout to book cleanly:
 *   payout.net == Σ charge.net − application_fees − refunds − other_fees
 * Returns the difference in minor units (0 = balances). The caller refuses to
 * write when this is non-zero.
 */
export function batchImbalanceMinor(batch: PayoutBatch): number {
	const chargesNet = batch.charges.reduce((s, c) => s + c.netMinor, 0);
	const expected = chargesNet - batch.applicationFeesMinor - batch.refundsMinor - batch.otherFeesMinor;
	return expected - batch.payout.amount;
}
