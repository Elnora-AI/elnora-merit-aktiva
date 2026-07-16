#!/usr/bin/env node
// Guard: real accounting data must never be committed to this public repo.
//
// The sibling guard (check-no-committed-stripe-map.mjs) covers config files by name.
// This one covers the other half: raw Merit API dumps — balance sheets, GL exports,
// invoice/payment/customer lists — which people write while debugging and which carry no
// telltale filename. `scratch/` is gitignored, but a dump saved anywhere else, or force-
// added, is one `git add -A` away from publishing the company's books.
//
// Detection is by SHAPE, not filename, because the filenames are unbounded:
//   1. A Merit API response envelope: a JSON object with both `ErrorMsg` and `Data`.
//   2. Merit record ids (SIHId, PHId, RDid, ...) — these only exist in real API output.
//   3. Estonian VAT numbers / IBANs in JSON.
//
// Fixtures are exempt: anything under __tests__/, any *.example.json, and any file
// carrying an `_example: true` / `_placeholder: true` / `_comment` marker. Mock data is
// how the tests work; it is real data that must not land here.
//
// Run locally:   node scripts/check-no-committed-books.mjs
// Run in CI:     same; non-zero exit surfaces the violators.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Merit record-id keys. These appear only in real API output, never in hand-written config.
const MERIT_ID_KEYS = ["SIHId", "SILId", "PHId", "RDid", "PaymId", "BatchId", "PerSHId"];
// EE VAT number (EE + 9 digits) and Estonian IBAN (EE + 18 digits).
const EE_VAT = /\bEE\d{9}\b/;
const EE_IBAN = /\bEE\d{18}\b/;

function isExempt(path) {
	if (path.startsWith("__tests__/")) return true;
	if (path.endsWith(".example.json")) return true;
	return false;
}

function hasExampleMarker(parsed) {
	if (parsed === null || typeof parsed !== "object") return false;
	return (
		parsed._placeholder === true || parsed._example === true || typeof parsed._comment === "string"
	);
}

// Walk any JSON value looking for Merit id keys at any depth.
function findMeritIdKey(value) {
	if (Array.isArray(value)) {
		for (const v of value) {
			const hit = findMeritIdKey(v);
			if (hit) return hit;
		}
		return null;
	}
	if (value === null || typeof value !== "object") return null;
	for (const key of Object.keys(value)) {
		if (MERIT_ID_KEYS.includes(key)) return key;
		const hit = findMeritIdKey(value[key]);
		if (hit) return hit;
	}
	return null;
}

function trackedFiles() {
	try {
		return execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
	} catch {
		console.error("Could not run `git ls-files` — run this inside a git checkout.");
		process.exit(1);
	}
}

const files = trackedFiles();
const violations = [];

for (const path of files) {
	if (!path.endsWith(".json")) continue;
	if (isExempt(path)) continue;

	const raw = readFileSync(path, "utf8");

	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		continue; // other tooling validates JSON
	}
	if (hasExampleMarker(parsed)) continue;

	if (parsed !== null && typeof parsed === "object" && "ErrorMsg" in parsed && "Data" in parsed) {
		violations.push(`${path}: looks like a raw Merit API response (has "ErrorMsg" + "Data").`);
		continue;
	}
	const idKey = findMeritIdKey(parsed);
	if (idKey) {
		violations.push(`${path}: contains a Merit record id ("${idKey}") — this is real API output.`);
		continue;
	}
	if (EE_VAT.test(raw) || EE_IBAN.test(raw)) {
		violations.push(`${path}: contains a real Estonian VAT number or IBAN.`);
	}
}

if (violations.length > 0) {
	console.error("Real accounting data found in this PUBLIC repo. These must NOT be committed:\n");
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"\nMerit API dumps (balance sheets, GL exports, invoice/payment/customer lists) are the\n" +
			"company's books. Keep them outside the repo, or under scratch/ which is gitignored.\n" +
			"If this is fixture data, put it under __tests__/ or name it *.example.json.",
	);
	process.exit(1);
}

console.log(`Checked ${files.length} tracked files. No real accounting data committed.`);
