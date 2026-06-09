// Resolve the VAT-period date for a Stripe payout from its charge dates.
//
// Estonian VAT tax point (KMS §11) is the CHARGE date — when the buyer's payment is
// received — NOT the Stripe payout arrival date. Stripe settles 1–4 days after the
// charge, so month-end charges straddle: captured in month N, paid out in N+1. Dating
// the GL batch on the payout arrival would push that output VAT into the wrong KMD
// month (the bug that previously needed a manual month-end accrual + reversal).
//
// Month boundaries are computed in the VAT jurisdiction's timezone (see vatTimezone /
// DEFAULT_VAT_TIMEZONE), not UTC, so a charge captured just before local midnight on the
// last day of a month is not bucketed into the next month by a UTC offset.
//
// Rules:
//   - no charges (fees/refunds only)            → arrival date (nothing to periodise).
//   - all charges in the arrival month          → arrival date (the common case, unchanged).
//   - all charges in a single EARLIER month     → the latest charge date, so output VAT
//     (a month-end straddle)                       lands in the charge month's KMD.
//   - charges spanning two or more months       → NOT bookable: one payout cannot be
//                                                  periodised to a single VAT month. The
//                                                  caller skips it; book each charge month
//                                                  by hand (the connector does not auto-split).

// Default VAT-period timezone when a map does not set `vatTimezone`. Estonia
// (Europe/Tallinn) is the primary Merit Aktiva jurisdiction; Polish users should set
// "Europe/Warsaw". Overridable, never assumed silently — see StripeMap.vatTimezone.
export const DEFAULT_VAT_TIMEZONE = "Europe/Tallinn";

/** Calendar Y/M/D of a unix-seconds instant, evaluated in an IANA timezone. */
export function ymdInTz(unixSeconds: number, timeZone: string): { year: number; month: number; day: number } {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date(unixSeconds * 1000));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return { year: get("year"), month: get("month"), day: get("day") };
}

/** Unix seconds → "YYYY-MM" in the given timezone (default DEFAULT_VAT_TIMEZONE). */
export function monthKey(unixSeconds: number, timeZone: string = DEFAULT_VAT_TIMEZONE): string {
	const { year, month } = ymdInTz(unixSeconds, timeZone);
	return `${year}-${month.toString().padStart(2, "0")}`;
}

export interface PeriodResolution {
	/** Unix seconds to date the GL batch on (the VAT-period anchor). */
	batchDate: number;
	/** A message to surface in the plan's warnings, or null when nothing notable. */
	warning: string | null;
	/** True when the payout cannot be periodised to one VAT month and must not be booked. */
	blocking: boolean;
}

/**
 * Resolve the batch date for a payout from its charge `created` timestamps and the
 * payout arrival date. Pure — no I/O. See the module header for the rules. Month
 * boundaries are computed in `timeZone` (the VAT jurisdiction), default Europe/Tallinn.
 */
export function resolvePeriod(
	chargeCreatedSeconds: number[],
	arrivalDate: number,
	timeZone: string = DEFAULT_VAT_TIMEZONE,
): PeriodResolution {
	if (chargeCreatedSeconds.length === 0) return { batchDate: arrivalDate, warning: null, blocking: false };

	const months = [...new Set(chargeCreatedSeconds.map((s) => monthKey(s, timeZone)))].sort();
	const arrivalMonth = monthKey(arrivalDate, timeZone);

	if (months.length > 1) {
		return {
			batchDate: arrivalDate,
			warning: `charges span ${months.join(" + ")}; a payout cannot be periodised to one VAT month and is NOT booked — book each charge month's output VAT separately (the connector does not auto-split per charge).`,
			blocking: true,
		};
	}
	if (months[0] === arrivalMonth) return { batchDate: arrivalDate, warning: null, blocking: false };

	return {
		batchDate: Math.max(...chargeCreatedSeconds),
		warning: `charges captured in ${months[0]} but paid out in ${arrivalMonth}; dated to the charge month (§11 tax point) so output VAT lands in the correct KMD period.`,
		blocking: false,
	};
}
