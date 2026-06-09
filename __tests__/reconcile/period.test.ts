import { describe, expect, it } from "vitest";
import { monthKey, resolvePeriod } from "../../src/reconcile/period.js";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000; // 1-based month

describe("monthKey", () => {
	it("buckets by calendar month in the VAT timezone (default Europe/Tallinn)", () => {
		expect(monthKey(at(2026, 5, 31))).toBe("2026-05");
		expect(monthKey(at(2026, 6, 1))).toBe("2026-06");
	});

	it("uses the jurisdiction timezone, not UTC, at a month boundary", () => {
		// 2026-05-31 23:00 UTC is 2026-06-01 02:00 in Tallinn (UTC+3 in summer).
		const instant = Date.UTC(2026, 4, 31, 23, 0, 0) / 1000;
		expect(monthKey(instant, "UTC")).toBe("2026-05");
		expect(monthKey(instant, "Europe/Tallinn")).toBe("2026-06");
		expect(monthKey(instant)).toBe("2026-06"); // default = Tallinn
	});
});

describe("resolvePeriod", () => {
	it("no charges (fees/refunds only) → arrival date, no warning, not blocking", () => {
		const arrival = at(2026, 6, 4);
		const r = resolvePeriod([], arrival);
		expect(r.batchDate).toBe(arrival);
		expect(r.warning).toBeNull();
		expect(r.blocking).toBe(false);
	});

	it("all charges in the arrival month → arrival date unchanged, not blocking", () => {
		const arrival = at(2026, 6, 14);
		const r = resolvePeriod([at(2026, 6, 10), at(2026, 6, 12)], arrival);
		expect(r.batchDate).toBe(arrival);
		expect(r.warning).toBeNull();
		expect(r.blocking).toBe(false);
	});

	it("month-end straddle (charges in the prior month) → dated to the latest charge, bookable", () => {
		const arrival = at(2026, 6, 2); // paid out June
		const latest = at(2026, 5, 31);
		const r = resolvePeriod([at(2026, 5, 28), at(2026, 5, 30), latest], arrival);
		expect(r.batchDate).toBe(latest); // → KMD lands in May, the §11 tax point
		expect(r.warning).toMatch(/2026-05.*2026-06|charge month/);
		expect(r.blocking).toBe(false); // a single earlier month is fine
	});

	it("charges spanning two months → blocking (not bookable), with a split warning", () => {
		const arrival = at(2026, 7, 2);
		const r = resolvePeriod([at(2026, 6, 15), at(2026, 7, 15)], arrival);
		expect(r.warning).toMatch(/span 2026-06 \+ 2026-07/);
		expect(r.blocking).toBe(true);
	});
});
