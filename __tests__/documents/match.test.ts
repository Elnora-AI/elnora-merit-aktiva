import { describe, expect, it } from "vitest";
import { quarterWindows } from "../../src/documents/audit.js";
import { extractAmounts, matchAll, parseAmount, scoreCandidate, tokenizeParty } from "../../src/documents/match.js";
import type { Candidate, DocsyncConfig, MissingDoc } from "../../src/documents/types.js";

const CONFIG: DocsyncConfig = {
	sources: [],
	acceptThreshold: 0.9,
	reviewThreshold: 0.6,
	amountTolerance: 0.02,
	dateWindowDays: 5,
};

function doc(over: Partial<MissingDoc> = {}): MissingDoc {
	return {
		kind: "purchase-invoice",
		id: "id-1",
		billNo: "BOLT-020726",
		partyName: "Bolt Operations OÜ",
		partyRegNo: null,
		docDate: "2026-07-02",
		grossTotal: 17.9,
		currency: "EUR",
		paid: true,
		...over,
	};
}

function cand(over: Partial<Candidate> = {}): Candidate {
	return {
		path: "/tmp/x.pdf",
		fileName: "x.pdf",
		contentType: "application/pdf",
		source: "dir:/tmp",
		...over,
	};
}

describe("parseAmount", () => {
	it("parses European and US decimal styles", () => {
		expect(parseAmount("1 347,01")).toBe(1347.01);
		expect(parseAmount("1,347.01")).toBe(1347.01);
		expect(parseAmount("89.03")).toBe(89.03);
		expect(parseAmount("17,90")).toBe(17.9);
	});
});

describe("extractAmounts", () => {
	it("pulls amounts from hints and text", () => {
		const c = cand({ fileName: "receipt-17.90.pdf", hints: { amounts: [17.9], text: "Bolt 2026-07-02" } });
		expect(extractAmounts(c)).toContain(17.9);
	});
});

describe("tokenizeParty", () => {
	it("drops legal-form noise and short tokens", () => {
		expect(tokenizeParty("Bolt Operations OÜ")).toEqual(["bolt", "operations"]);
		expect(tokenizeParty("Elnora AI, Inc.")).toEqual(["elnora", "ai"]);
	});
});

describe("scoreCandidate", () => {
	it("scores an amount+date+party match near 1.0", () => {
		const c = cand({
			fileName: "Bolt-2026-07-02.pdf",
			hints: { amounts: [17.9], dates: ["2026-07-02"], text: "Bolt Operations" },
		});
		const s = scoreCandidate(doc(), c, CONFIG);
		expect(s).not.toBeNull();
		expect((s as { score: number }).score).toBeGreaterThanOrEqual(0.9);
	});

	it("does not clear accept threshold on party name alone", () => {
		const c = cand({
			fileName: "bolt-something-else.pdf",
			hints: { amounts: [999], dates: ["2020-01-01"], text: "Bolt" },
		});
		const s = scoreCandidate(doc(), c, CONFIG);
		// party 0.2 only → below both thresholds
		expect(s?.score ?? 0).toBeLessThan(CONFIG.reviewThreshold);
	});

	it("respects the amount tolerance", () => {
		const near = scoreCandidate(doc(), cand({ hints: { amounts: [17.91] } }), CONFIG);
		const far = scoreCandidate(doc(), cand({ hints: { amounts: [18.5] } }), { ...CONFIG, amountTolerance: 0.02 });
		expect(near?.reasons.some((r) => r.includes("amount"))).toBe(true);
		expect(far?.reasons.some((r) => r.includes("amount")) ?? false).toBe(false);
	});
});

describe("matchAll", () => {
	it("routes a confident match to best, and nothing to unresolved", () => {
		const candidates = [
			cand({
				path: "/a.pdf",
				fileName: "Bolt 17.90 2026-07-02.pdf",
				hints: { amounts: [17.9], dates: ["2026-07-02"], text: "Bolt Operations" },
			}),
			cand({ path: "/b.pdf", fileName: "unrelated.pdf" }),
		];
		const [result] = matchAll([doc()], candidates, CONFIG);
		expect(result.best?.candidate.path).toBe("/a.pdf");
	});

	it("returns best=null when nothing clears the accept threshold", () => {
		const [result] = matchAll([doc()], [cand({ fileName: "noise.pdf" })], CONFIG);
		expect(result.best).toBeNull();
	});
});

describe("quarterWindows", () => {
	it("splits a year into ≤3-month windows covering the range", () => {
		const wins = quarterWindows(new Date("2026-01-01T00:00:00Z"), new Date("2026-07-31T00:00:00Z"));
		expect(wins.length).toBeGreaterThanOrEqual(3);
		expect(wins[0].from).toBe("20260101");
		expect(wins[wins.length - 1].to).toBe("20260731");
	});
});
