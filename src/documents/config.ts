// Load the document-sync config.
//
// Precedence for each field: config file → env → built-in default. The config
// file lives in the shared references dir (honors MERIT_REFERENCES_DIR, default
// ~/.config/elnora-merit/docsync.json) and is gitignored — it may hold a webhook
// URL, so it must never be committed. Everything has a safe default so the tool
// runs with no config at all (scanning ~/Downloads).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configPath } from "../config/config-dir.js";
import { ValidationError } from "../utils/errors.js";
import type { DocsyncConfig, SourceConfig } from "./types.js";

export const DEFAULT_DOCSYNC_PATH = configPath("docsync.json");

const DEFAULTS: DocsyncConfig = {
	sources: [{ type: "dir", path: join(homedir(), "Downloads") }],
	acceptThreshold: 0.9,
	reviewThreshold: 0.6,
	amountTolerance: 0.02,
	dateWindowDays: 5,
};

function validateSources(raw: unknown): SourceConfig[] {
	if (!Array.isArray(raw)) throw new ValidationError("docsync config: `sources` must be an array.");
	return raw.map((s, i) => {
		const o = s as Record<string, unknown>;
		if (o.type === "dir" && typeof o.path === "string") {
			return { type: "dir", path: o.path, recursive: o.recursive === true };
		}
		if (o.type === "command" && typeof o.command === "string") {
			return { type: "command", command: o.command, label: typeof o.label === "string" ? o.label : undefined };
		}
		throw new ValidationError(
			`docsync config: sources[${i}] is invalid — use { "type":"dir","path":"…" } or { "type":"command","command":"…" }.`,
		);
	});
}

/** Load and normalise the docsync config, applying env + defaults. */
export function loadDocsyncConfig(
	path: string = DEFAULT_DOCSYNC_PATH,
	env: NodeJS.ProcessEnv = process.env,
): DocsyncConfig {
	let fromFile: Partial<DocsyncConfig> = {};
	if (existsSync(path)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(path, "utf8"));
		} catch (err) {
			throw new ValidationError(`docsync config at ${path} is not valid JSON: ${(err as Error).message}`);
		}
		const o = parsed as Record<string, unknown>;
		fromFile = {
			sources: o.sources !== undefined ? validateSources(o.sources) : undefined,
			acceptThreshold: typeof o.acceptThreshold === "number" ? o.acceptThreshold : undefined,
			reviewThreshold: typeof o.reviewThreshold === "number" ? o.reviewThreshold : undefined,
			amountTolerance: typeof o.amountTolerance === "number" ? o.amountTolerance : undefined,
			dateWindowDays: typeof o.dateWindowDays === "number" ? o.dateWindowDays : undefined,
			webhookUrl: typeof o.webhookUrl === "string" ? o.webhookUrl : undefined,
			notifyCommand: typeof o.notifyCommand === "string" ? o.notifyCommand : undefined,
		};
	}
	return {
		sources: fromFile.sources ?? DEFAULTS.sources,
		acceptThreshold: fromFile.acceptThreshold ?? DEFAULTS.acceptThreshold,
		reviewThreshold: fromFile.reviewThreshold ?? DEFAULTS.reviewThreshold,
		amountTolerance: fromFile.amountTolerance ?? DEFAULTS.amountTolerance,
		dateWindowDays: fromFile.dateWindowDays ?? DEFAULTS.dateWindowDays,
		// Env wins for the webhook so CI/secret stores can inject it without a config file.
		webhookUrl: env.MERIT_DOCSYNC_WEBHOOK?.trim() || fromFile.webhookUrl,
		notifyCommand: fromFile.notifyCommand,
	};
}
