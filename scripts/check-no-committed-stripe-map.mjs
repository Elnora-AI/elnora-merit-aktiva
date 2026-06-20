#!/usr/bin/env node
// Guard: a POPULATED Stripe→Merit map (a user's real account codes + VAT TaxId) must
// never be committed to this public repo. Real config lives in the user's private space
// (~/.config/elnora-merit/stripe-map.json, gitignored). The repo ships only:
//   - stripe-map.example.json  (illustrative; carries a "_comment")
//   - PLACEHOLDER_MAP in code   (written by `reconcile init`; carries "_placeholder")
//
// This fails CI if:
//   1. a tracked file is named stripe-map.json or reconcile-ledger.json (the gitignored
//      populated names — someone force-added one), or
//   2. any tracked map-shaped JSON (has both `accounts` and `vat`) lacks a
//      `_placeholder: true` / `_example: true` / `_comment` marker (i.e. looks populated).
//
// Run locally:   node scripts/check-no-committed-stripe-map.mjs
// Run in CI:     same; non-zero exit surfaces the violators.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FORBIDDEN_NAMES = ["stripe-map.json", "reconcile-ledger.json", "company-profile.json"];

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
	const base = path.split("/").pop();
	if (FORBIDDEN_NAMES.includes(base)) {
		violations.push(`${path}: a populated config file must never be committed (it is gitignored for a reason).`);
		continue;
	}
	if (!path.endsWith(".json")) continue;

	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		continue; // not our concern here; other tooling validates JSON
	}
	if (parsed === null || typeof parsed !== "object") continue;
	const looksLikeMap = "accounts" in parsed && "vat" in parsed;
	if (!looksLikeMap) continue;

	const isPlaceholder = parsed._placeholder === true;
	const isExample = parsed._example === true || typeof parsed._comment === "string";
	if (!isPlaceholder && !isExample) {
		violations.push(`${path}: looks like a populated Stripe map but has no "_placeholder"/"_example"/"_comment" marker.`);
	}
}

if (violations.length > 0) {
	console.error("Populated reconcile config found in the repo. These must NOT be committed:\n");
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"\nKeep real account codes + VAT TaxId in your private space (~/.config/elnora-merit/stripe-map.json, gitignored). " +
			"The repo ships only stripe-map.example.json and the in-code placeholder.",
	);
	process.exit(1);
}

console.log(`Checked ${files.length} tracked files. No populated Stripe map / ledger committed.`);
