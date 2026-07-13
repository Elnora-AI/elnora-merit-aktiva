import { describe, expect, it } from "vitest";
import { compactName, domainToken, emailDomain, foldDiacritics } from "../../../src/reconcile/resolve/normalize.js";

describe("foldDiacritics", () => {
	it("folds Estonian diacritics to ASCII", () => {
		// õ→o ä→a ö→o ü→u š→s ž→z
		expect(foldDiacritics("õäöüšž")).toBe("oaousz");
	});
	it("maps each Estonian vowel correctly", () => {
		expect(foldDiacritics("Õun")).toBe("Oun");
		expect(foldDiacritics("Müür")).toBe("Muur");
		expect(foldDiacritics("Tölner")).toBe("Tolner");
	});
});

describe("compactName", () => {
	it("strips the OÜ legal form even after diacritic folding", () => {
		// The bug this guards: 'OÜ' folds to 'ou' and must still be removed.
		expect(compactName("Globex Resources OÜ")).toBe("globexresources");
		expect(compactName("Acme Medical OÜ")).toBe("acmemedical");
	});
	it("strips AS and a leading legal form", () => {
		expect(compactName("Acme AS")).toBe("acme");
		expect(compactName("AS Umbrella Eesti")).toBe("umbrellaeesti");
	});
	it("folds diacritics in the body of the name", () => {
		expect(compactName("Õunake OÜ")).toBe("ounake");
	});
	it("returns empty for a name that is only a legal form", () => {
		expect(compactName("OÜ")).toBe("");
	});
	it("keeps digits and removes punctuation", () => {
		expect(compactName("1Acme Estonia OÜ")).toBe("1acmeestonia");
	});
});

describe("domainToken", () => {
	it("takes the registrable label", () => {
		expect(domainToken("acme.com")).toBe("acme");
		expect(domainToken("1acme.co")).toBe("1acme");
		expect(domainToken("globex.eu")).toBe("globex");
	});
	it("handles a subdomain by taking the second-to-last label", () => {
		expect(domainToken("mail.sub.acme.ee")).toBe("acme");
	});
	it("strips punctuation and folds diacritics", () => {
		expect(domainToken("õun.ee")).toBe("oun");
	});
});

describe("emailDomain", () => {
	it("extracts and lowercases the domain", () => {
		expect(emailDomain("User@Globex.EU")).toBe("globex.eu");
	});
	it("returns null for malformed addresses", () => {
		expect(emailDomain(null)).toBeNull();
		expect(emailDomain("no-at-sign")).toBeNull();
		expect(emailDomain("trailing@")).toBeNull();
	});
});
