// Build a booking plan for one payout — READ-ONLY, no Merit calls.
//
// Booking model (best-practice Stripe clearing-account method): each payout is
// booked as ONE summary GL batch — gross card sales recognised as revenue + 24%
// output VAT, Stripe fees as an expense, all through a clearing account that the
// real LHV bank-import row then clears in the Merit UI. Card sales are aggregated
// (no per-buyer customer/invoice — the canonical treatment for high-volume B2C card
// payments; genuine company invoices that need a Merit A/R record are booked
// separately). Preview renders this plan; post executes the single GL batch.

import { batchImbalanceMinor } from "./fetch.js";
import { formatMinor } from "./money.js";
import { DEFAULT_VAT_TIMEZONE, resolvePeriod } from "./period.js";
import type { PayoutBatch, StripeMap } from "./types.js";
import { splitVat } from "./vat.js";

/** A single card charge after VAT split — kept for preview detail, not booked individually. */
export interface ChargePlan {
	chargeId: string;
	grossMinor: number;
	netMinor: number;
	vatMinor: number;
	vatSource: "stripe-tax" | "rate";
	created: number;
	description: string | null;
}

export interface PayoutPlan {
	payoutId: string;
	currency: string;
	arrivalDate: number;
	/** Unix seconds to date the GL batch on: the §11 VAT-period anchor (charge month),
	 *  which equals arrivalDate except for a month-end straddle. See period.ts. */
	bookingDate: number;
	payoutNetMinor: number;
	charges: ChargePlan[];
	/** Aggregates across all charges — what the summary GL books. */
	grossMinor: number;
	netMinor: number;
	vatMinor: number;
	fees: {
		stripeFeeMinor: number;
		platformFeeMinor: number;
		refundMinor: number;
		otherFeeMinor: number;
	};
	imbalanceMinor: number;
	warnings: string[];
	/** True only when the batch balances and there are no blocking warnings. */
	bookable: boolean;
}

/** Build the summary plan for one payout. Pure — no Merit/Stripe calls. */
export function planPayout(batch: PayoutBatch, map: StripeMap): PayoutPlan {
	const warnings: string[] = [];
	const charges: ChargePlan[] = [];

	for (const c of batch.charges) {
		const { netMinor, vatMinor, source, mismatch } = splitVat(c.grossMinor, map.vat.rate, c.stripeTaxMinor);
		if (mismatch) {
			warnings.push(
				`Charge ${c.chargeId}: Stripe tax ${formatMinor(mismatch.stripeVatMinor)} ≠ ${(map.vat.rate * 100).toFixed(0)}% rate (${formatMinor(mismatch.ratedVatMinor)}); using the Stripe tax line.`,
			);
		}
		charges.push({
			chargeId: c.chargeId,
			grossMinor: c.grossMinor,
			netMinor,
			vatMinor,
			vatSource: source,
			created: c.created,
			description: c.description,
		});
	}

	const grossMinor = charges.reduce((s, c) => s + c.grossMinor, 0);
	const netMinor = charges.reduce((s, c) => s + c.netMinor, 0);
	const vatMinor = charges.reduce((s, c) => s + c.vatMinor, 0);

	const imbalanceMinor = batchImbalanceMinor(batch);
	if (imbalanceMinor !== 0) {
		warnings.push(
			`Payout ${batch.payout.id} does not balance: Σcharges−fees−refunds differs from the payout by ${formatMinor(imbalanceMinor)}. Refusing to book.`,
		);
	}
	if (batch.refundsMinor > 0) {
		warnings.push(
			`Payout ${batch.payout.id} contains ${formatMinor(batch.refundsMinor)} in refunds — booked as a gross contra to the refunds account WITHOUT output-VAT reversal. Adjust the output VAT on refunds manually. Review.`,
		);
	}

	// stripeFeeMinor already folds in otherFeesMinor (see fetch.ts); keep both for reporting.
	const stripeFeeMinor = batch.charges.reduce((s, c) => s + c.stripeFeeMinor, 0) + batch.otherFeesMinor;

	// VAT period: §11 tax point is the charge date, not the payout arrival. Equals
	// arrival except for a month-end straddle, which is dated to the charge month. A payout
	// whose charges span two+ months cannot be periodised to one VAT month, so period.blocking
	// is set and the payout is not bookable (book each charge month by hand). See period.ts.
	const period = resolvePeriod(
		charges.map((c) => c.created),
		batch.payout.arrival_date,
		map.vatTimezone ?? DEFAULT_VAT_TIMEZONE,
	);
	if (period.warning) warnings.push(`Payout ${batch.payout.id}: ${period.warning}`);

	return {
		payoutId: batch.payout.id,
		currency: batch.currency,
		arrivalDate: batch.payout.arrival_date,
		bookingDate: period.batchDate,
		payoutNetMinor: batch.payout.amount,
		charges,
		grossMinor,
		netMinor,
		vatMinor,
		fees: {
			stripeFeeMinor,
			platformFeeMinor: batch.applicationFeesMinor,
			refundMinor: batch.refundsMinor,
			otherFeeMinor: batch.otherFeesMinor,
		},
		imbalanceMinor,
		warnings,
		bookable: imbalanceMinor === 0 && !period.blocking,
	};
}
