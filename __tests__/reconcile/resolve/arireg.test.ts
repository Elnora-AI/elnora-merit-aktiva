import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AriregIndex, sortCandidates } from "../../../src/reconcile/resolve/arireg.js";
import type { CompanyCandidate } from "../../../src/reconcile/resolve/types.js";

// A minimal CSV mirroring the real columns: nimi;kood;vorm;alaliik;kmkr;staatus;...
// All rows are fictional (invented names, made-up codes and VAT ids).
const CSV = `﻿nimi;ariregistri_kood;ettevotja_oiguslik_vorm;alaliik;kmkr_nr;ettevotja_staatus;rest
Acme AS;10000001;Aktsiaselts;;EE100000001;R;Tallinn, Harju maakond
Globex Resources OÜ;10000003;Osaühing;;EE100000003;R;addr with, commas
Suletud OÜ;99999999;Osaühing;;;K;deleted entity
`;

function loadFixture(): AriregIndex {
	const dir = mkdtempSync(join(tmpdir(), "arireg-"));
	const path = join(dir, "test.csv");
	writeFileSync(path, CSV);
	return AriregIndex.fromCsv(path);
}

describe("AriregIndex.fromCsv", () => {
	it("parses rows, skipping the header, with VAT null when empty and active from status R", () => {
		const idx = loadFixture();
		expect(idx.size).toBe(3);
		const acme = idx.findByExactName("Acme AS");
		expect(acme).toHaveLength(1);
		expect(acme[0].regNo).toBe("10000001");
		expect(acme[0].vat).toBe("EE100000001");
		expect(acme[0].active).toBe(true);
	});

	it("tolerates commas inside fields (semicolon is the only delimiter)", () => {
		const idx = loadFixture();
		expect(idx.searchByToken("globexresources")).toHaveLength(1);
	});

	it("excludes inactive (non-R) entities from findByExactName", () => {
		const idx = loadFixture();
		expect(idx.findByExactName("Suletud OÜ")).toHaveLength(0);
	});
});

describe("sortCandidates", () => {
	it("ranks exact over startswith over contains, VAT-registered first", () => {
		const cands: CompanyCandidate[] = [
			{ name: "C", regNo: "3", legalForm: "", vat: null, active: true, matchReason: "name-contains" },
			{ name: "B", regNo: "2", legalForm: "", vat: null, active: true, matchReason: "name-startswith" },
			{ name: "A", regNo: "1", legalForm: "", vat: "EE1", active: true, matchReason: "name-exact" },
		];
		const sorted = sortCandidates(cands);
		expect(sorted.map((c) => c.regNo)).toEqual(["1", "2", "3"]);
	});
});
