import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseDateIso,
	parseDecimal,
	parseNonNegativeInt,
	parseYearMonth,
	readRawBody,
	resolveBody,
	stripWrappingQuotes,
} from "../../src/utils/parse.js";

describe("parseDateIso", () => {
	it("returns undefined for an unset value", () => {
		expect(parseDateIso(undefined)).toBeUndefined();
	});
	it("accepts YYYY-MM-DD and returns it unchanged", () => {
		expect(parseDateIso("2026-06-01")).toBe("2026-06-01");
	});
	it("accepts compact YYYYMMDD and normalises to YYYY-MM-DD", () => {
		expect(parseDateIso("20260601")).toBe("2026-06-01");
	});
	it("rejects a malformed value", () => {
		expect(() => parseDateIso("June 1")).toThrow(/Use YYYY-MM-DD/);
	});
	it("rejects a non-calendar date", () => {
		expect(() => parseDateIso("2026-02-30")).toThrow(/Not a real calendar date/);
	});
});

describe("parseYearMonth", () => {
	it("returns undefined for an unset value", () => {
		expect(parseYearMonth(undefined)).toBeUndefined();
	});
	it("accepts YYYYMM", () => {
		expect(parseYearMonth("202401")).toBe("202401");
	});
	it("accepts YYYY-MM and strips the dash", () => {
		expect(parseYearMonth("2024-01")).toBe("202401");
	});
	it("rejects the wrong length", () => {
		expect(() => parseYearMonth("2024")).toThrow(/Use YYYYMM/);
	});
	it("rejects an out-of-range month", () => {
		expect(() => parseYearMonth("202413")).toThrow(/Month must be 01–12/);
	});
});

describe("parseNonNegativeInt", () => {
	it("returns undefined for an unset value", () => {
		expect(parseNonNegativeInt(undefined, "--date-type")).toBeUndefined();
	});
	it("returns the default for an unset value when given", () => {
		expect(parseNonNegativeInt(undefined, "--date-type", 0)).toBe(0);
	});
	it("accepts 0 (the bug parsePositiveInt rejected — e.g. DateType document date)", () => {
		expect(parseNonNegativeInt("0", "--date-type")).toBe(0);
	});
	it("accepts a positive integer", () => {
		expect(parseNonNegativeInt("1", "--date-type")).toBe(1);
	});
	it("rejects a negative integer", () => {
		expect(() => parseNonNegativeInt("-1", "--date-type")).toThrow(/non-negative integer/);
	});
	it("rejects a non-integer", () => {
		expect(() => parseNonNegativeInt("1.5", "--date-type")).toThrow(/non-negative integer/);
	});
});

describe("parseDecimal", () => {
	it("returns undefined for an unset value (a forgotten flag, not zero)", () => {
		expect(parseDecimal(undefined, "--amount")).toBeUndefined();
	});
	it("parses a plain decimal", () => {
		expect(parseDecimal("12.50", "--amount")).toBe(12.5);
		expect(parseDecimal("-1.5", "--amount")).toBe(-1.5);
		expect(parseDecimal("0", "--amount")).toBe(0);
	});
	it("rejects empty/whitespace (an unset shell var must error, not become 0)", () => {
		expect(() => parseDecimal("", "--amount")).toThrow(/decimal number/);
		expect(() => parseDecimal("   ", "--amount")).toThrow(/decimal number/);
	});
	it("rejects hex and exponent forms Number() would silently coerce", () => {
		expect(() => parseDecimal("0x10", "--amount")).toThrow(/decimal number/);
		expect(() => parseDecimal("1e3", "--amount")).toThrow(/decimal number/);
		expect(() => parseDecimal("abc", "--amount")).toThrow(/decimal number/);
	});
});

describe("stripWrappingQuotes", () => {
	it("strips one balanced pair of double or single quotes", () => {
		expect(stripWrappingQuotes('"abc"')).toBe("abc");
		expect(stripWrappingQuotes("'abc'")).toBe("abc");
	});
	it("leaves unquoted, asymmetric, or quote-bearing values intact", () => {
		expect(stripWrappingQuotes("abc")).toBe("abc");
		expect(stripWrappingQuotes('abc"')).toBe('abc"');
		expect(stripWrappingQuotes("it's")).toBe("it's");
		expect(stripWrappingQuotes(`"mismatched'`)).toBe(`"mismatched'`);
	});
});

describe("resolveBody", () => {
	it("returns the JSON body verbatim by default (--data overrides flags)", () => {
		expect(resolveBody({ Email: "x@y.com" }, { Id: "guid" })).toEqual({ Email: "x@y.com" });
	});
	it("with mergeFlags, keeps the positional Id when --data omits it (the body wins on conflicts)", () => {
		expect(resolveBody({ Email: "x@y.com" }, { Id: "guid" }, { mergeFlags: true })).toEqual({
			Id: "guid",
			Email: "x@y.com",
		});
		// An Id in the body overrides the positional.
		expect(resolveBody({ Id: "from-body" }, { Id: "positional" }, { mergeFlags: true })).toEqual({ Id: "from-body" });
	});
	it("assembles a body from flags when no JSON body is given, dropping undefined", () => {
		expect(resolveBody(undefined, { Id: "guid", Skip: undefined })).toEqual({ Id: "guid" });
	});
	it("throws when required and nothing is provided", () => {
		expect(() => resolveBody(undefined, {})).toThrow(/No request body/);
	});
});

describe("readRawBody", () => {
	it("returns --data verbatim — XML must never go through JSON.parse", () => {
		const xml = '<E_Invoice xmlns="..."><Invoice/></E_Invoice>';
		expect(readRawBody({ data: xml }, "e-invoice XML")).toBe(xml);
	});
	it("reads --file verbatim", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-raw-"));
		const path = join(dir, "invoice.xml");
		writeFileSync(path, "<xml>raw</xml>");
		try {
			expect(readRawBody({ file: path })).toBe("<xml>raw</xml>");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
	it("names the expected content when nothing is provided", () => {
		expect(() => readRawBody({}, "camt.053 XML")).toThrow(/camt\.053 XML/);
	});
	it("throws a clear error for an unreadable file", () => {
		expect(() => readRawBody({ file: "/nope/missing.xml" })).toThrow(/Could not read/);
	});
});
