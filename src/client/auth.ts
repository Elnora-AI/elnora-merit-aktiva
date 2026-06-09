// Merit Aktiva credential resolution.
//
// Resolution precedence (highest first):
//   1. process.env (MERIT_API_ID / MERIT_API_KEY / MERIT_LOCALIZATION / MERIT_API_VERSION)
//   2. ~/.config/elnora-merit/.env
//   3. ./.env in the current working directory (dev convenience)
//   4. interactive prompt (only if allowPrompt: true and stdin is a TTY)
//
// loadEnvFile() hydrates process.env from the env files WITHOUT overwriting any
// variable that is already set, so a real env var always wins.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { Writable } from "node:stream";
import { type ApiVersion, type Localization, resolveDefaultVersion, resolveLocalization } from "../config/index.js";
import { AuthError } from "../utils/errors.js";
import { stripWrappingQuotes } from "../utils/parse.js";

const HOME_ENV_FILE = join(homedir(), ".config", "elnora-merit", ".env");
const CWD_ENV_FILE = join(process.cwd(), ".env");

// Credential-setup hint for Merit Palk (payroll) — a separate product from Aktiva, with
// its own keys and host. Used in every Palk AuthError so the suggestion names the right
// env vars and the Palk key-generation path (not the Aktiva one).
const PALK_AUTH_SUGGESTION =
	"Set MERIT_PALK_API_ID and MERIT_PALK_API_KEY in your environment or in ~/.config/elnora-merit/.env. Generate them in Merit Palk: Settings → API Settings (requires a Palk PRO license).";

export interface MeritCredentials {
	apiId: string;
	apiKey: string;
	localization: Localization;
	version: ApiVersion;
}

// Parse a `KEY=value` env file. Skips blank lines and `#` comments. Strips
// surrounding single/double quotes. Does NOT mutate process.env.
function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const out: Record<string, string> = {};
	const content = readFileSync(path, "utf8");
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		out[key] = stripWrappingQuotes(rawValue.trim());
	}
	return out;
}

/**
 * Hydrate process.env from the home and cwd env files without overwriting any
 * variable that is already set. Home file wins over the cwd file. Safe to call
 * multiple times. Call once at CLI startup.
 */
export function loadEnvFile(paths: string[] = [HOME_ENV_FILE, CWD_ENV_FILE]): void {
	for (const path of paths) {
		const entries = parseEnvFile(path);
		for (const [key, value] of Object.entries(entries)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}
}

function cleanValue(raw: string | undefined): string | undefined {
	const trimmed = raw?.trim();
	if (!trimmed) return undefined;
	const v = stripWrappingQuotes(trimmed);
	return v ? v : undefined;
}

export interface GetCredentialsOptions {
	/** If true and credentials aren't found, prompt interactively (requires TTY). */
	allowPrompt?: boolean;
	/** Override env-file path for the interactive-save target. */
	envFilePath?: string;
}

function saveCredentialsToEnvFile(apiId: string, apiKey: string, path: string = HOME_ENV_FILE): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `MERIT_API_ID=${apiId}\nMERIT_API_KEY=${apiKey}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
}

async function promptHidden(label: string): Promise<string> {
	process.stdout.write(label);
	const muted = new Writable({
		write(_chunk, _enc, cb) {
			cb();
		},
	});
	const rl: Interface = createInterface({ input: process.stdin, output: muted, terminal: true });
	try {
		return (await rl.question("")).trim();
	} finally {
		rl.close();
		process.stdout.write("\n");
	}
}

/**
 * Resolve Merit credentials + endpoint config. Throws AuthError if the API ID
 * or key cannot be found (and prompting is disabled or stdin is not a TTY).
 */
export async function getCredentials(opts: GetCredentialsOptions = {}): Promise<MeritCredentials> {
	let apiId = cleanValue(process.env.MERIT_API_ID);
	let apiKey = cleanValue(process.env.MERIT_API_KEY);

	if ((!apiId || !apiKey) && opts.allowPrompt) {
		if (!process.stdin.isTTY) {
			throw new AuthError("Merit API credentials not found and stdin is not a TTY; cannot prompt.");
		}
		process.stdout.write(
			"Merit Aktiva API credentials not found.\nGenerate them in Merit Aktiva: Settings → Company data → API settings.\n",
		);
		if (!apiId) apiId = cleanValue(await promptHidden("Paste your API ID: "));
		if (!apiKey) apiKey = cleanValue(await promptHidden("Paste your API key: "));
		if (apiId && apiKey) {
			const target = opts.envFilePath ?? HOME_ENV_FILE;
			saveCredentialsToEnvFile(apiId, apiKey, target);
			process.stdout.write(`Saved to ${target} (mode 0600).\n`);
		}
	}

	if (!apiId || !apiKey) {
		throw new AuthError();
	}

	return {
		apiId,
		apiKey,
		localization: resolveLocalization(),
		version: resolveDefaultVersion(),
	};
}

// --- Merit Palk credentials ---------------------------------------------------
//
// Palk is a separate Merit product (payroll) with its own API ID/key, distinct
// from the Aktiva accounting credentials above. Same resolution sources, but
// keyed on MERIT_PALK_API_ID / MERIT_PALK_API_KEY. Unlike the Aktiva flow, the
// interactive prompt does NOT persist to the env file — the shared
// saveCredentialsToEnvFile() rewrites the whole file and would clobber any
// MERIT_API_* values, so we prompt without saving and let the user store them.

export interface PalkCredentials {
	apiId: string;
	apiKey: string;
}

/**
 * Resolve Merit Palk credentials. Throws AuthError if the API ID or key cannot
 * be found (and prompting is disabled or stdin is not a TTY).
 */
export async function getPalkCredentials(opts: GetCredentialsOptions = {}): Promise<PalkCredentials> {
	let apiId = cleanValue(process.env.MERIT_PALK_API_ID);
	let apiKey = cleanValue(process.env.MERIT_PALK_API_KEY);

	if ((!apiId || !apiKey) && opts.allowPrompt) {
		if (!process.stdin.isTTY) {
			throw new AuthError(
				"Merit Palk API credentials not found and stdin is not a TTY; cannot prompt.",
				PALK_AUTH_SUGGESTION,
			);
		}
		process.stdout.write(
			"Merit Palk API credentials not found.\nGenerate them in Merit Palk: Settings → API Settings → New API key (requires a Palk PRO license).\nThen add MERIT_PALK_API_ID and MERIT_PALK_API_KEY to your env file.\n",
		);
		if (!apiId) apiId = cleanValue(await promptHidden("Paste your Palk API ID: "));
		if (!apiKey) apiKey = cleanValue(await promptHidden("Paste your Palk API key: "));
	}

	if (!apiId || !apiKey) {
		throw new AuthError("No Merit Palk API credentials found.", PALK_AUTH_SUGGESTION);
	}

	return { apiId, apiKey };
}

// Exported for testing.
export const _internal = { parseEnvFile, cleanValue, saveCredentialsToEnvFile, HOME_ENV_FILE, CWD_ENV_FILE };
