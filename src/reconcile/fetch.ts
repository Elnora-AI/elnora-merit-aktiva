// Pull payouts from Stripe and classify each one's balance transactions into the
// booking buckets the rest of the pipeline consumes.
//
// We anchor on payouts (one payout = one bank deposit) per the design decision:
// the LHV bank feed already imports the deposit, so booking per payout lets the
// real bank line clear against the Stripe clearing account with no double posting.

import type { StripeClient } from "../client/stripe-client.js";
import type { ChargeItem, PayoutBatch, StripeBalanceTransaction, StripeCharge, StripePayout } from "./types.js";

/** Unix-seconds timestamp for the start of a YYYY-MM-DD date (UTC). */
export function cutoffToUnix(cutoffDate: string): number {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cutoffDate.trim());
	if (!m) throw new Error(`Invalid cutoffDate "${cutoffDate}". Use YYYY-MM-DD.`);
	return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000);
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
					stripeTaxMinor: src?.tax ?? null,
					invoiceNoHint: src?.metadata?.invoice_no ?? null,
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
