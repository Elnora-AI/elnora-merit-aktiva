import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { stageForUpload } from "../../src/documents/attach.js";
import { collectDir } from "../../src/documents/sources.js";
import type { MissingDoc } from "../../src/documents/types.js";

function fixtureDir(files: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "merit-docsrc-"));
	for (const f of files) writeFileSync(join(dir, f), "x");
	return dir;
}

describe("collectDir", () => {
	it("collects PDFs and image receipts, skips other files and dotfiles", () => {
		const dir = fixtureDir([
			"receipt.pdf",
			"2026-07-09-khanittha-49.70-eur.jpg",
			"ticket.JPEG",
			"scan.png",
			"photo.heic",
			"invoice.webp",
			"notes.txt",
			"archive.zip",
			".hidden.pdf",
		]);
		const names = collectDir(dir)
			.map((c) => c.fileName)
			.sort();
		expect(names).toEqual(
			[
				"2026-07-09-khanittha-49.70-eur.jpg",
				"invoice.webp",
				"photo.heic",
				"receipt.pdf",
				"scan.png",
				"ticket.JPEG",
			].sort(),
		);
	});

	it("sets a content type per extension and strips it from the text hint", () => {
		const dir = fixtureDir(["2026-07-09-khanittha-49.70-eur.jpg"]);
		const [c] = collectDir(dir);
		expect(c.contentType).toBe("image/jpeg");
		expect(c.hints?.text).toBe("2026-07-09-khanittha-49.70-eur");
	});
});

describe("stageForUpload", () => {
	const missing: MissingDoc = {
		kind: "purchase-invoice",
		id: "cadffa07-fbdb-4915-9e94-08dee11e1ab2",
		billNo: "KHAN-090726",
		partyName: "KHANITTHA München",
		partyRegNo: null,
		docDate: "2026-07-09",
		grossTotal: 49.7,
		currency: "EUR",
		paid: true,
	};

	it("keeps the source extension for an image receipt", () => {
		const src = join(fixtureDir(["r.jpg"]), "r.jpg");
		const out = mkdtempSync(join(tmpdir(), "merit-stage-"));
		expect(basename(stageForUpload(missing, src, out))).toBe("KHAN-090726__cadffa07.jpg");
	});

	it("keeps .pdf for a PDF receipt", () => {
		const src = join(fixtureDir(["r.pdf"]), "r.pdf");
		const out = mkdtempSync(join(tmpdir(), "merit-stage-"));
		expect(basename(stageForUpload(missing, src, out))).toBe("KHAN-090726__cadffa07.pdf");
	});
});
