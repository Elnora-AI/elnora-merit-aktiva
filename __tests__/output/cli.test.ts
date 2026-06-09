import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetOutputState, outputSuccess, setFields, setOutputFormat, setPrettyMode } from "../../src/output/cli.js";

function capture(stream: "stdout" | "stderr", fn: () => void): string {
	const chunks: string[] = [];
	const spy = vi.spyOn(process[stream], "write").mockImplementation((chunk: unknown) => {
		chunks.push(String(chunk));
		return true;
	});
	try {
		fn();
	} finally {
		spy.mockRestore();
	}
	return chunks.join("");
}

beforeEach(() => _resetOutputState());
afterEach(() => vi.restoreAllMocks());

describe("outputSuccess JSON", () => {
	it("emits compact JSON by default", () => {
		expect(capture("stdout", () => outputSuccess({ a: 1 }))).toBe('{"a":1}\n');
	});
	it("emits indented JSON in pretty mode", () => {
		setPrettyMode(true);
		expect(capture("stdout", () => outputSuccess({ a: 1 }))).toBe('{\n  "a": 1\n}\n');
	});
});

describe("outputSuccess table/csv", () => {
	it("renders a CSV with a header and rows", () => {
		setOutputFormat("csv");
		const out = capture("stdout", () => outputSuccess({ rows: [{ Code: "1", Name: "Cash" }] }));
		expect(out).toBe("Code,Name\n1,Cash\n");
	});

	it("neutralizes spreadsheet formula injection in CSV (CWE-1236)", () => {
		setOutputFormat("csv");
		const out = capture("stdout", () => outputSuccess({ rows: [{ a: "=2+5", b: "+cmd", c: "@SUM(A1)", d: "-1+1" }] }));
		// Every formula-prefixed cell is escaped with a leading apostrophe.
		expect(out).toBe("a,b,c,d\n'=2+5,'+cmd,'@SUM(A1),'-1+1\n");
	});

	it("neutralizes a formula even when the value also needs RFC-4180 quoting", () => {
		setOutputFormat("csv");
		const out = capture("stdout", () => outputSuccess({ rows: [{ x: "=1+2,3" }] }));
		expect(out).toBe('x\n"\'=1+2,3"\n');
	});

	it("warns and renders only the first list when a response has multiple arrays", () => {
		setOutputFormat("table");
		let stdout = "";
		const stderr = capture("stderr", () => {
			stdout = capture("stdout", () => outputSuccess({ Lines: [{ a: 1 }], Vat: [{ b: 2 }] }));
		});
		expect(stderr).toMatch(/multiple list fields.*Lines.*Vat/);
		expect(stdout).toContain("A"); // the Lines column header
		expect(stdout).not.toContain("B"); // Vat omitted
	});
});

describe("--fields filter", () => {
	it("accepts a field present only in a later row (union of keys, not row[0])", () => {
		setOutputFormat("json");
		setFields("only_in_second");
		// Must NOT throw: the field exists in the second row.
		const out = capture("stdout", () => outputSuccess({ rows: [{ a: 1 }, { only_in_second: 2 }] }));
		expect(out).toContain("only_in_second");
	});
	it("throws when every requested field is absent across all rows", () => {
		setFields("nope");
		expect(() => capture("stdout", () => outputSuccess({ rows: [{ a: 1 }, { b: 2 }] }))).toThrow(/non-existent/);
	});
});
