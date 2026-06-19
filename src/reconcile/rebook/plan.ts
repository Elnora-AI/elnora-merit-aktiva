// Plan the customer-invoice rebooking of one payout — READ-ONLY, pure (no Merit calls).
//
// Replaces the anonymous summary GL with: one müügiarve per CONFIRMED Estonian-business
// charge (so it reaches KMD INF) + one GL batch that books the residual private remainder,
// all Stripe fees, and (when no clearing payment method is configured) clears the invoices'
// A/R into the Stripe clearing account. The clearing account still nets to the payout, so
// the LHV deposit re-matches exactly as before.
//
// Accounting (per payout), with C = confirmed, R = residual private, F = all fees:
//   müügiarve (each C):   Dr AR gross_c / Cr Revenue net_c (+VAT tag → Cr VATpayable vat_c)
//   payment (each C, only if a clearing payment method exists):  Dr Clearing gross_c / Cr AR gross_c
//   GL batch (once):      Dr Clearing (gross_R [+ gross_C when no payment method])
//                         Cr AR gross_C            (only when no payment method — clears the invoices)
//                         Cr Revenue net_R (+VAT tag)   (residual private revenue, if any)
//                         Dr Fees F / Cr Clearing F
//   ⇒ Clearing nets to Σgross − F = payout net = the LHV deposit.

import { batchImbalanceMinor } from "../fetch.js";
import { DEFAULT_VAT_TIMEZONE, resolvePeriod } from "../period.js";
import type { Resolution } from "../resolve/types.js";
import type { ChargeItem, PayoutBatch, StripeMap } from "../types.js";
import { splitVat } from "../vat.js";

export interface RebookInvoice {
	chargeId: string;
	docDate: number; // unix seconds — the charge date (VAT/INF period anchor)
	customer: { name: string; regNo: string; vat: string | null; country: string; email: string | null };
	grossMinor: number;
	netMinor: number;
	vatMinor: number;
	description: string;
}

export interface RebookPlan {
	payoutId: string;
	currency: string;
	bookingDate: number; // unix — GL BatchDate anchor (charge month)
	payoutNetMinor: number;
	invoices: RebookInvoice[];
	residual: { grossMinor: number; netMinor: number; vatMinor: number; count: number };
	feesMinor: number; // all Stripe + platform + other fees
	imbalanceMinor: number;
	warnings: string[];
	bookable: boolean;
}

const DEFAULT_TICKET_DESC = "Event ticket";

/** Build the rebooking plan for one payout. `resolutions` maps chargeId → its Resolution. */
export function planRebook(batch: PayoutBatch, resolutions: Map<string, Resolution>, map: StripeMap): RebookPlan {
	const warnings: string[] = [];
	const invoices: RebookInvoice[] = [];
	let resGross = 0;
	let resNet = 0;
	let resVat = 0;
	let resCount = 0;

	const currencyMismatch = batch.currency.toUpperCase() !== map.currency.toUpperCase();
	if (currencyMismatch) {
		warnings.push(
			`Payout ${batch.payout.id} is in ${batch.currency.toUpperCase()} but the map is ${map.currency.toUpperCase()} — refusing to book.`,
		);
	}

	for (const c of batch.charges) {
		const { netMinor, vatMinor } = splitVat(c.grossMinor, map.vat.rate, c.stripeTaxMinor);
		const res = resolutions.get(c.chargeId);
		const company = res?.tier === "confirmed" ? res.company : null;
		if (company) {
			if (!company.regNo) {
				warnings.push(
					`Charge ${c.chargeId}: confirmed company "${company.name}" has no registrikood — sending to residual.`,
				);
			} else {
				invoices.push({
					chargeId: c.chargeId,
					docDate: c.created,
					customer: {
						name: company.name,
						regNo: company.regNo,
						vat: company.vat,
						country: c.billing.country || "EE",
						email: c.buyerEmail,
					},
					grossMinor: c.grossMinor,
					netMinor,
					vatMinor,
					description: invoiceDescription(c),
				});
				continue;
			}
		}
		// Residual: private / unconfirmed → anonymous summary.
		resGross += c.grossMinor;
		resNet += netMinor;
		resVat += vatMinor;
		resCount += 1;
	}

	const feesMinor =
		batch.charges.reduce((s, c) => s + c.stripeFeeMinor, 0) + batch.applicationFeesMinor + batch.otherFeesMinor;

	if (batch.refundsMinor > 0) {
		warnings.push(
			`Payout ${batch.payout.id} contains ${batch.refundsMinor} minor units of refunds — rebooking does not handle refunds yet; book this payout by hand.`,
		);
	}

	const imbalanceMinor = batchImbalanceMinor(batch);
	if (imbalanceMinor !== 0) {
		warnings.push(
			`Payout ${batch.payout.id} does not balance (Σnet−fees−refunds differs from payout by ${imbalanceMinor} minor units) — refusing to book.`,
		);
	}

	const period = resolvePeriod(
		batch.charges.map((c) => c.created),
		batch.payout.arrival_date,
		map.vatTimezone ?? DEFAULT_VAT_TIMEZONE,
	);
	if (period.warning) warnings.push(`Payout ${batch.payout.id}: ${period.warning}`);

	return {
		payoutId: batch.payout.id,
		currency: batch.currency,
		bookingDate: period.batchDate,
		payoutNetMinor: batch.payout.amount,
		invoices,
		residual: { grossMinor: resGross, netMinor: resNet, vatMinor: resVat, count: resCount },
		feesMinor,
		imbalanceMinor,
		warnings,
		bookable: imbalanceMinor === 0 && batch.refundsMinor === 0 && !period.blocking && !currencyMismatch,
	};
}

function invoiceDescription(c: ChargeItem): string {
	const d = (c.description ?? "").trim();
	// "Payment for Invoice" is a generic Stripe label, not a useful line description.
	if (!d || /payment for invoice/i.test(d)) return DEFAULT_TICKET_DESC;
	return d;
}
