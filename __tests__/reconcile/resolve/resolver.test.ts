import { describe, expect, it } from "vitest";
import { AriregIndex } from "../../../src/reconcile/resolve/arireg.js";
import type { OverrideMap } from "../../../src/reconcile/resolve/overrides.js";
import { resolveBuyer } from "../../../src/reconcile/resolve/resolver.js";
import type { AriregCompany, ViesResult } from "../../../src/reconcile/resolve/types.js";

// All fixtures are fictional: invented company names, made-up registry codes and VAT ids.
const COMPANIES: AriregCompany[] = [
	{ name: "Acme AS", regNo: "10000001", legalForm: "AS", vat: "EE100000001", active: true },
	{ name: "Acme Group AS", regNo: "10000002", legalForm: "AS", vat: "EE100000002", active: true },
	{ name: "Globex OÜ", regNo: "10000003", legalForm: "OÜ", vat: "EE100000003", active: true },
	{ name: "Globex Consulting OÜ", regNo: "10000004", legalForm: "OÜ", vat: null, active: true },
	{ name: "OÜ Initech", regNo: "10000005", legalForm: "OÜ", vat: null, active: true },
	{ name: "Umbrella Digital AS", regNo: "10000006", legalForm: "AS", vat: "EE100000006", active: true },
	{ name: "Umbrella Eesti AS", regNo: "10000007", legalForm: "AS", vat: "EE100000007", active: true },
	{ name: "Hooli Holdings OÜ", regNo: "10000008", legalForm: "OÜ", vat: "EE100000008", active: true },
	{ name: "Stark Industries OÜ", regNo: "10000009", legalForm: "OÜ", vat: "EE100000009", active: true },
];

const arireg = AriregIndex.fromCompanies(COMPANIES);
const viesValid = async (): Promise<ViesResult> => ({ checked: true, valid: true, name: "VIES Name" });

describe("resolveBuyer", () => {
	it("confirms a unique exact domain-token match with a VAT and VIES-validates it", async () => {
		const r = await resolveBuyer({ name: null, email: "a@acme.com", country: "" }, { arireg, vies: viesValid });
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000001"); // Acme AS (exact), not Acme Group
		expect(r.vies?.valid).toBe(true);
	});

	it("confirms the exact OÜ match over a startswith sibling", async () => {
		const r = await resolveBuyer({ name: null, email: "x@globex.net", country: "" }, { arireg, vies: viesValid });
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000003"); // the VAT-registered "Globex OÜ"
	});

	it("sends a token match with NO VAT registration to review (precision gate)", async () => {
		const r = await resolveBuyer({ name: null, email: "x@initech.tech", country: "" }, { arireg, vies: viesValid });
		expect(r.tier).toBe("review");
		expect(r.candidates.some((c) => c.regNo === "10000005")).toBe(true);
	});

	it("sends multiple equally-ranked candidates to review", async () => {
		const r = await resolveBuyer({ name: null, email: "x@umbrella.eu", country: "" }, { arireg, vies: viesValid });
		expect(r.tier).toBe("review");
		expect(r.candidates.length).toBeGreaterThanOrEqual(2);
	});

	it("confirms an exact buyer-name match even without a VAT or VIES", async () => {
		const r = await resolveBuyer(
			{ name: "Hooli Holdings OÜ", email: "billing@hooli.eu", country: "" },
			{ arireg, vies: viesValid },
		);
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000008");
	});

	it("treats free-mail as private", async () => {
		const r = await resolveBuyer({ name: null, email: "someone@gmail.com", country: "" }, { arireg });
		expect(r.tier).toBe("private");
		expect(r.freeMail).toBe(true);
	});

	it("confirms a free-mail buyer whose NAME exactly matches a company", async () => {
		const r = await resolveBuyer({ name: "Stark Industries OÜ", email: "ceo@gmail.com", country: "" }, { arireg });
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000009");
	});

	it("is private when there is no email and no name match", async () => {
		const r = await resolveBuyer({ name: null, email: null, country: "" }, { arireg });
		expect(r.tier).toBe("private");
	});

	it("reviews a company-like domain with no register match", async () => {
		const r = await resolveBuyer({ name: null, email: "x@nomatch.ee", country: "" }, { arireg });
		expect(r.tier).toBe("review");
		expect(r.candidates).toHaveLength(0);
	});

	it("downgrades a confirmed match to review when VIES hard-rejects the VAT", async () => {
		const viesInvalid = async (): Promise<ViesResult> => ({ checked: true, valid: false, name: null, note: "INVALID" });
		const r = await resolveBuyer({ name: null, email: "a@acme.com", country: "" }, { arireg, vies: viesInvalid });
		expect(r.tier).toBe("review");
		expect(r.vies?.valid).toBe(false);
	});

	it("keeps a confirmed match when VIES is merely unavailable (valid: null)", async () => {
		const viesDown = async (): Promise<ViesResult> => ({
			checked: true,
			valid: null,
			name: null,
			note: "MS_UNAVAILABLE",
		});
		const r = await resolveBuyer({ name: null, email: "a@acme.com", country: "" }, { arireg, vies: viesDown });
		expect(r.tier).toBe("confirmed");
	});

	it("applies a domain override with full confidence", async () => {
		const overrides: OverrideMap = {
			byEmail: {},
			byDomain: { "umbrella.eu": { regNo: "10000006", name: "Umbrella Digital AS", vat: "EE100000006" } },
		};
		const r = await resolveBuyer(
			{ name: null, email: "x@umbrella.eu", country: "" },
			{ arireg, overrides, vies: viesValid },
		);
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000006");
		expect(r.company?.matchReason).toBe("override");
	});

	it("honors a private override", async () => {
		const overrides: OverrideMap = { byEmail: { "owner@acme.com": { private: true } }, byDomain: {} };
		const r = await resolveBuyer({ name: null, email: "owner@acme.com", country: "" }, { arireg, overrides });
		expect(r.tier).toBe("private");
	});
});

// Stripe-identity paths: the buyer-entered company name / VAT id from the Customer object.
const STRIPE_COMPANIES: AriregCompany[] = [
	// A VAT group: three entities sharing one KMKR number.
	{ name: "Acme AS", regNo: "10000001", legalForm: "AS", vat: "EE100000001", active: true },
	{ name: "Acme Group AS", regNo: "10000002", legalForm: "AS", vat: "EE100000001", active: true },
	{ name: "Acme Solutions OÜ", regNo: "10000010", legalForm: "OÜ", vat: "EE100000001", active: true },
	{ name: "Globex Consulting OÜ", regNo: "10000004", legalForm: "OÜ", vat: null, active: true },
	{ name: "Massive Dynamic OÜ", regNo: "10000011", legalForm: "OÜ", vat: "EE100000011", active: true },
	// A FIE registered under a personal (fictional) name, with a VAT.
	{ name: "JOHN SMITH", regNo: "10000012", legalForm: "FIE", vat: "EE100000012", active: true },
];
const sx = AriregIndex.fromCompanies(STRIPE_COMPANIES);

describe("resolveBuyer — Stripe identity", () => {
	it("confirms via Stripe VAT id (unique)", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "a@massivedynamic.ee", country: "", vatId: "EE100000011" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000011");
		expect(r.company?.matchReason).toBe("stripe-vat");
	});

	it("disambiguates a VAT group by the Stripe-entered company name", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "x@acme.com", country: "", companyName: "Acme Group AS", vatId: "EE100000001" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000002"); // Group, not the alphabetically-first AS
	});

	it("sends a VAT group to review when the name does not disambiguate", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "x@acme.com", country: "", vatId: "EE100000001" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("review");
		expect(r.candidates.length).toBe(3);
	});

	it("confirms a Stripe company name with a legal form", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "ops@globex.ee", country: "", companyName: "Globex Consulting OÜ" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("confirmed");
		expect(r.company?.regNo).toBe("10000004");
		expect(r.company?.matchReason).toBe("stripe-name");
	});

	it("treats a personal name that only matches a FIE as private (policy: leave private)", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "j@example.io", country: "", companyName: "John Smith" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("private");
		expect(r.reason).toContain("10000012"); // the matched FIE is noted for an override
	});

	it("treats a personal Stripe name with no register match as private", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "someone@noreg.ee", country: "", companyName: "Jane Doe" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("private");
	});

	it("reviews a Stripe VAT id absent from äriregister", async () => {
		const r = await resolveBuyer(
			{ name: null, email: "x@foreign.de", country: "", vatId: "DE999999999" },
			{ arireg: sx, vies: viesValid },
		);
		expect(r.tier).toBe("review");
	});
});
