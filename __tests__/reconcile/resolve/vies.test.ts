import { afterEach, describe, expect, it, vi } from "vitest";
import { splitVatId, validateVat } from "../../../src/reconcile/resolve/vies.js";

describe("splitVatId", () => {
	it("splits a prefixed EE VAT id", () => {
		expect(splitVatId("EE100000001")).toEqual({ countryCode: "EE", vatNumber: "100000001" });
	});
	it("defaults the country to EE for a bare number", () => {
		expect(splitVatId("100000001")).toEqual({ countryCode: "EE", vatNumber: "100000001" });
	});
	it("ignores surrounding whitespace and case", () => {
		expect(splitVatId("  ee 100000001 ")).toEqual({ countryCode: "EE", vatNumber: "100000001" });
	});
	it("returns null for an unparseable id", () => {
		expect(splitVatId("not-a-vat")).toBeNull();
	});
});

describe("validateVat", () => {
	afterEach(() => vi.restoreAllMocks());

	it("returns valid:true with the registered name", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ valid: true, name: "Acme AS" }), { status: 200 }));
		const r = await validateVat("EE100000001");
		expect(r).toMatchObject({ checked: true, valid: true, name: "Acme AS" });
	});

	it("maps a member-state outage to valid:null (not a false negative)", async () => {
		vi.stubGlobal(
			"fetch",
			async () => new Response(JSON.stringify({ errorWrappers: [{ error: "MS_UNAVAILABLE" }] }), { status: 200 }),
		);
		const r = await validateVat("EE100000001");
		expect(r.valid).toBeNull();
		expect(r.note).toContain("MS_UNAVAILABLE");
	});

	it("returns valid:false for a genuine invalid number", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ valid: false }), { status: 200 }));
		const r = await validateVat("EE000000000");
		expect(r.valid).toBe(false);
	});

	it("maps an HTTP error to valid:null", async () => {
		vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
		const r = await validateVat("EE100000001");
		expect(r.valid).toBeNull();
	});
});
