import { describe, expect, it, vi } from "vitest";
import type { MeritClient } from "../../src/client/merit-client.js";
import type { PayoutPlan } from "../../src/reconcile/plan.js";
import { buildPayoutGl, executePlan, unixToYmd } from "../../src/reconcile/post.js";
import type { StripeMap } from "../../src/reconcile/types.js";

const MAP: StripeMap = {
	currency: "EUR",
	cutoffDate: "2026-06-01",
	accounts: {
		revenue: "4000",
		vatPayable: "2310",
		stripeFees: "5290",
		platformFees: "5291",
		refunds: "4001",
		clearing: "1080",
	},
	vat: { rate: 0.24, code: "tax-guid" },
};

// gross 449.00 = net 362.10 + VAT 86.90; fees 15.00 stripe + 24.00 platform; net payout 410.00
const PLAN: PayoutPlan = {
	payoutId: "po_1",
	currency: "eur",
	arrivalDate: Date.UTC(2026, 5, 14) / 1000,
	bookingDate: Date.UTC(2026, 5, 14) / 1000, // charges in the arrival month → arrival date
	payoutNetMinor: 41000,
	charges: [
		{
			chargeId: "ch_1",
			grossMinor: 44900,
			netMinor: 36210,
			vatMinor: 8690,
			vatSource: "rate",
			created: Date.UTC(2026, 5, 12, 9, 30, 0) / 1000,
			description: "Workshop — Day Pass",
		},
	],
	grossMinor: 44900,
	netMinor: 36210,
	vatMinor: 8690,
	fees: { stripeFeeMinor: 1500, platformFeeMinor: 2400, refundMinor: 0, otherFeeMinor: 0 },
	imbalanceMinor: 0,
	warnings: [],
	bookable: true,
};

type Row = { AccountCode: string; Debit: number; Credit: number; TaxId?: string; VatAmount?: number };
const rowsOf = (body: Record<string, unknown>) => body.EntryRow as Row[];
const clearingNet = (rows: Row[]) =>
	rows.filter((r) => r.AccountCode === "1080").reduce((s, r) => s + r.Debit - r.Credit, 0);

describe("unixToYmd", () => {
	it("formats unix → YYYYMMDD in the given timezone", () => {
		expect(unixToYmd(Date.UTC(2026, 5, 12, 9, 30, 5) / 1000, "UTC")).toBe("20260612");
	});
	it("respects the jurisdiction timezone at a day boundary", () => {
		// 2026-05-31 23:00 UTC → 2026-06-01 in Tallinn (UTC+3).
		const instant = Date.UTC(2026, 4, 31, 23, 0, 0) / 1000;
		expect(unixToYmd(instant, "UTC")).toBe("20260531");
		expect(unixToYmd(instant, "Europe/Tallinn")).toBe("20260601");
	});
});

describe("buildPayoutGl", () => {
	it("books a summary: gross→clearing, net→revenue (VAT-tagged), fees→expense; VAT is implicit", () => {
		const body = buildPayoutGl(PLAN, MAP) as Record<string, unknown>;
		expect(body.DocNo).toBe("po_1");
		expect(body.BatchDate).toBe("20260614");
		const rows = rowsOf(body);

		const revenue = rows.find((r) => r.AccountCode === "4000");
		expect(revenue?.Credit).toBeCloseTo(362.1, 5); // revenue net
		// Output VAT is carried on the revenue line's tag — Merit auto-posts it AND
		// flows it onto the KMD. There must be NO explicit VAT-account row (that would
		// double-post and unbalance the batch, and only the tag reaches the return).
		expect(revenue?.TaxId).toBe("tax-guid");
		expect(revenue?.VatAmount).toBeCloseTo(86.9, 5);
		expect(rows.some((r) => r.AccountCode === "2310")).toBe(false); // no explicit VAT line

		expect(rows.find((r) => r.AccountCode === "5290")?.Debit).toBeCloseTo(15.0, 5); // stripe fee
		expect(rows.find((r) => r.AccountCode === "5291")?.Debit).toBeCloseTo(24.0, 5); // platform fee

		// Explicit rows are short by exactly the VAT; Merit's implicit VAT credit balances it.
		const totalDebit = rows.reduce((s, r) => s + r.Debit, 0);
		const totalCredit = rows.reduce((s, r) => s + r.Credit, 0);
		expect(totalDebit - totalCredit).toBeCloseTo(86.9, 5); // == vat
		expect(totalDebit).toBeCloseTo(totalCredit + (revenue?.VatAmount ?? 0), 5); // balanced w/ implicit VAT

		// Clearing is left holding exactly the payout net (gross − fees).
		expect(clearingNet(rows)).toBeCloseTo(410.0, 5);
	});

	it("adds a refund contra line; rows stay short by exactly the VAT", () => {
		const withRefund: PayoutPlan = { ...PLAN, fees: { ...PLAN.fees, refundMinor: 1000 } };
		const rows = rowsOf(buildPayoutGl(withRefund, MAP) as Record<string, unknown>);
		expect(rows.find((r) => r.AccountCode === "4001")?.Debit).toBeCloseTo(10.0, 5);
		const totalDebit = rows.reduce((s, r) => s + r.Debit, 0);
		const totalCredit = rows.reduce((s, r) => s + r.Credit, 0);
		expect(totalDebit - totalCredit).toBeCloseTo(86.9, 5); // implicit VAT balances it
		// Clearing now holds gross − fees − refund = 449 − 39 − 10 = 400.
		expect(clearingNet(rows)).toBeCloseTo(400.0, 5);
	});

	it("dates the batch on bookingDate (the §11 charge month), not the payout arrival", () => {
		// Month-end straddle: charges captured 31 May, paid out 2 June → book to May.
		const straddle: PayoutPlan = {
			...PLAN,
			arrivalDate: Date.UTC(2026, 5, 2) / 1000, // 2 Jun (arrival)
			bookingDate: Date.UTC(2026, 4, 31) / 1000, // 31 May (charge month)
		};
		const body = buildPayoutGl(straddle, MAP) as Record<string, unknown>;
		expect(body.BatchDate).toBe("20260531");
	});

	it("uses a generic revenue memo by default and a configurable one when set", () => {
		const rowsDefault = rowsOf(buildPayoutGl(PLAN, MAP) as Record<string, unknown>) as (Row & { Memo: string })[];
		expect(rowsDefault.find((r) => r.AccountCode === "4000")?.Memo).toBe("Card sales (net of VAT)");

		const withMemo = buildPayoutGl(PLAN, { ...MAP, revenueMemo: "Online ticket sales" }) as Record<string, unknown>;
		const rows = rowsOf(withMemo) as (Row & { Memo: string })[];
		expect(rows.find((r) => r.AccountCode === "4000")?.Memo).toBe("Online ticket sales");
	});

	it("labels the platform-fee line generically (no brand name)", () => {
		const withPlatform: PayoutPlan = { ...PLAN, fees: { ...PLAN.fees, platformFeeMinor: 500 } };
		const rows = rowsOf(buildPayoutGl(withPlatform, MAP) as Record<string, unknown>) as (Row & { Memo: string })[];
		expect(rows.find((r) => r.AccountCode === "5291")?.Memo).toBe("Platform / application fees");
	});

	it("returns null when there is nothing to book", () => {
		const empty: PayoutPlan = {
			...PLAN,
			charges: [],
			grossMinor: 0,
			netMinor: 0,
			vatMinor: 0,
			fees: { stripeFeeMinor: 0, platformFeeMinor: 0, refundMinor: 0, otherFeeMinor: 0 },
		};
		expect(buildPayoutGl(empty, MAP)).toBeNull();
	});

	it("emits no zero-amount sales rows for a fees-only payout", () => {
		// e.g. a payout that only collects fees: no gross, no VAT-tagged zero revenue row
		// (Merit may reject zero lines, and a zero VAT tag would put an empty entry on the KMD).
		const feesOnly: PayoutPlan = {
			...PLAN,
			charges: [],
			grossMinor: 0,
			netMinor: 0,
			vatMinor: 0,
			fees: { stripeFeeMinor: 1500, platformFeeMinor: 0, refundMinor: 0, otherFeeMinor: 0 },
		};
		const rows = rowsOf(buildPayoutGl(feesOnly, MAP) as Record<string, unknown>);
		expect(rows.some((r) => r.AccountCode === "4000")).toBe(false); // no revenue row
		expect(rows.every((r) => r.Debit > 0 || r.Credit > 0)).toBe(true); // no zero rows
		// Fee debit fully offset by the clearing credit.
		expect(rows.reduce((s, r) => s + r.Debit - r.Credit, 0)).toBeCloseTo(0, 5);
	});

	it("emits no zero-amount sales rows for a refunds-only payout", () => {
		const refundsOnly: PayoutPlan = {
			...PLAN,
			charges: [],
			grossMinor: 0,
			netMinor: 0,
			vatMinor: 0,
			fees: { stripeFeeMinor: 0, platformFeeMinor: 0, refundMinor: 1000, otherFeeMinor: 0 },
		};
		const rows = rowsOf(buildPayoutGl(refundsOnly, MAP) as Record<string, unknown>);
		expect(rows.some((r) => r.AccountCode === "4000")).toBe(false);
		expect(rows.every((r) => r.Debit > 0 || r.Credit > 0)).toBe(true);
		expect(rows.find((r) => r.AccountCode === "4001")?.Debit).toBeCloseTo(10.0, 5);
	});
});

describe("executePlan", () => {
	const fakeClient = (glResult: unknown) => ({ call: vi.fn().mockResolvedValue(glResult) }) as unknown as MeritClient;

	it("treats a textual Merit response as a rejection — the payout must NOT be ledgered", async () => {
		// Merit signals some business rejections as 200 + plain text; recording that as
		// booked would silently drop revenue from the books.
		const client = fakeClient("PR kanne ei ole tasakaalus");
		await expect(executePlan(client, PLAN, MAP)).rejects.toMatchObject({ name: "ApiError" });
	});

	it("reports glPosted on a JSON success response", async () => {
		const client = fakeClient({ BatchId: "guid-1" });
		await expect(executePlan(client, PLAN, MAP)).resolves.toMatchObject({
			payoutId: "po_1",
			glPosted: true,
			glResult: { BatchId: "guid-1" },
		});
	});

	it("reports glPosted on an empty (null) success response", async () => {
		const client = fakeClient(null);
		await expect(executePlan(client, PLAN, MAP)).resolves.toMatchObject({ glPosted: true });
	});
});
