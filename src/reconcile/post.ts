// Turn a PayoutPlan into a single Merit GL batch and (optionally) execute it.
//
// Booking model per payout (clearing-account summary — the canonical Stripe
// treatment, and the only route that needs no Merit-UI bank setup):
//   Dr Clearing   gross           (all card sales, VAT-inclusive)
//   Cr Revenue    net             (gross ÷ 1.24) — carries TaxId + VatAmount
//   [Cr VAT payable vat]          (24% output VAT — IMPLICIT, posted by Merit)
//   Dr Stripe fees feeTotal       (processing + platform fees, an expense)
//   Cr Clearing   feeTotal
//   Dr Refunds    refund / Cr Clearing   (only when the payout contains refunds)
// The clearing account is left holding exactly the payout NET, which the real LHV
// bank-import row clears against (one match in the Merit UI). Revenue is booked
// GROSS with fees as a separate expense (ASC 606 / IFRS 15 — merchant is principal).
//
// VAT: the output VAT is NOT an explicit GlRow. Merit auto-posts it to the VAT
// account from the revenue line's TaxId + VatAmount, and that tag is also what
// makes the amount flow onto the KMD (käibedeklaratsioon) return. Adding an explicit
// VAT-account line in ADDITION to the tag double-posts the VAT — Merit then rejects
// the batch ("PR kanne ei ole tasakaalus") — and an UNtagged VAT line lands in the GL
// account but never reaches the KMD. So the entry's explicit rows are intentionally
// short by `vat`; Merit's implicit VAT credit balances it. (Verified live, 2026-06-06.)
// No sales invoices, customers, or receipts: high-volume B2C card sales are a
// periodic summary; genuine company invoices are booked outside this tool.
//
// Refunds: booked as a GROSS contra to the refunds account with NO output-VAT reversal.
// The output VAT on a refund must be adjusted manually (the plan emits a warning to that
// effect). Automatic VAT-tagged reversal is deferred until the debit-line VAT behaviour
// is confirmed against a live Merit account, so the connector never posts an unverified
// VAT entry.

import type { MeritClient } from "../client/merit-client.js";
import { minorToDecimal } from "./money.js";
import { DEFAULT_VAT_TIMEZONE, ymdInTz } from "./period.js";
import type { PayoutPlan } from "./plan.js";
import type { StripeMap } from "./types.js";

/** Default memo for the revenue GL line when the map does not set `revenueMemo`. */
const DEFAULT_REVENUE_MEMO = "Card sales (net of VAT)";

/** Unix seconds → "YYYYMMDD" in the VAT-period timezone (default Europe/Tallinn). */
export function unixToYmd(unix: number, timeZone: string = DEFAULT_VAT_TIMEZONE): string {
	const { year, month, day } = ymdInTz(unix, timeZone);
	const p = (n: number, w: number) => n.toString().padStart(w, "0");
	return `${p(year, 4)}${p(month, 2)}${p(day, 2)}`;
}

interface GlRow {
	AccountCode: string;
	Debit: number;
	Credit: number;
	Memo: string;
	// VAT tagging for the KMD: when a line carries TaxId + VatAmount, Merit BOTH
	// auto-posts the VAT to the configured VAT account AND flows it onto the KMD return.
	// It is the single source of the VAT posting — there must be no separate explicit
	// VAT-account row (that would double-post and unbalance the batch).
	TaxId?: string;
	VatAmount?: number;
}

/**
 * Build the sendglbatch (v1) body for one payout: a single summary entry.
 * Returns null only if the payout has no charges and no fees (nothing to book).
 * The explicit rows are short by exactly `vat` (Σ debit − Σ credit == vat); Merit
 * supplies that VAT credit implicitly from the revenue line's VatAmount tag, so the
 * posted batch balances. See the VAT note in the module header.
 */
export function buildPayoutGl(plan: PayoutPlan, map: StripeMap): Record<string, unknown> | null {
	const feeTotalMinor = plan.fees.stripeFeeMinor + plan.fees.platformFeeMinor;
	const refundMinor = plan.fees.refundMinor;
	if (plan.grossMinor === 0 && feeTotalMinor === 0 && refundMinor === 0) return null;

	const rows: GlRow[] = [
		{
			AccountCode: map.accounts.clearing,
			Debit: minorToDecimal(plan.grossMinor),
			Credit: 0,
			Memo: `Stripe payout ${plan.payoutId} — card sales (gross)`,
		},
		{
			AccountCode: map.accounts.revenue,
			Debit: 0,
			Credit: minorToDecimal(plan.netMinor),
			// Output VAT (plan.vatMinor) is posted by Merit from this tag — no separate
			// VAT-account row (see module header). This is also what populates the KMD.
			Memo: map.revenueMemo ?? DEFAULT_REVENUE_MEMO,
			TaxId: map.vat.code,
			VatAmount: minorToDecimal(plan.vatMinor),
		},
	];
	if (plan.fees.stripeFeeMinor > 0) {
		rows.push({
			AccountCode: map.accounts.stripeFees,
			Debit: minorToDecimal(plan.fees.stripeFeeMinor),
			Credit: 0,
			Memo: "Stripe processing fees",
		});
	}
	if (plan.fees.platformFeeMinor > 0) {
		rows.push({
			AccountCode: map.accounts.platformFees,
			Debit: minorToDecimal(plan.fees.platformFeeMinor),
			Credit: 0,
			Memo: "Platform / application fees",
		});
	}
	if (feeTotalMinor > 0) {
		rows.push({
			AccountCode: map.accounts.clearing,
			Debit: 0,
			Credit: minorToDecimal(feeTotalMinor),
			Memo: "Fees offset",
		});
	}
	if (refundMinor > 0) {
		rows.push({
			AccountCode: map.accounts.refunds,
			Debit: minorToDecimal(refundMinor),
			Credit: 0,
			Memo: "Refunds (contra-revenue)",
		});
		rows.push({
			AccountCode: map.accounts.clearing,
			Debit: 0,
			Credit: minorToDecimal(refundMinor),
			Memo: "Refunds offset",
		});
	}

	return {
		DocNo: plan.payoutId,
		// VAT period anchor = the charge month (§11 tax point), which equals the payout
		// arrival except for a month-end straddle. Resolved in plan.ts (see period.ts).
		// Dated in the VAT-period timezone so a month-end charge lands in the right KMD.
		BatchDate: unixToYmd(plan.bookingDate, map.vatTimezone ?? DEFAULT_VAT_TIMEZONE),
		CurrencyCode: map.currency,
		EntryRow: rows,
	};
}

export interface ExecuteResult {
	payoutId: string;
	glPosted: boolean;
	glResult?: unknown;
}

/**
 * Execute a bookable plan against Merit: post the single summary GL batch. The caller
 * records the payout in the idempotency ledger only on success. Throws on failure.
 */
export async function executePlan(client: MeritClient, plan: PayoutPlan, map: StripeMap): Promise<ExecuteResult> {
	if (!plan.bookable) {
		throw new Error(`Plan for payout ${plan.payoutId} is not bookable (imbalance ${plan.imbalanceMinor} minor units).`);
	}
	const body = buildPayoutGl(plan, map);
	if (!body) return { payoutId: plan.payoutId, glPosted: false };
	const glResult = await client.call("sendglbatch", { version: "v1", body });
	return { payoutId: plan.payoutId, glPosted: true, glResult };
}
