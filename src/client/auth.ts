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

import { closeSync, fchmodSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
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
	const out: Record<string, string> = {};
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw err;
	}
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

// Keys never honored from the cwd `.env`: a cloned repository could ship a `.env`
// that redirects fully signed requests to an attacker-controlled host (the HMAC key
// itself never leaves the machine, but a signed request can be replayed against the
// real API within the timestamp window). Base-URL overrides are only honored from
// the real environment or the home env file.
const CWD_DENYLIST = new Set(["MERIT_BASE_URL", "MERIT_PALK_BASE_URL"]);

/**
 * Hydrate process.env from the home and cwd env files without overwriting any
 * variable that is already set. Home file wins over the cwd file, and untrusted
 * paths (by default the cwd `.env`) may not set base-URL overrides (see
 * CWD_DENYLIST). Safe to call multiple times. Call once at CLI startup.
 */
export function loadEnvFile(
	paths: string[] = [HOME_ENV_FILE, CWD_ENV_FILE],
	untrustedPaths: string[] = [CWD_ENV_FILE],
): void {
	const untrusted = new Set(untrustedPaths);
	for (const path of paths) {
		const entries = parseEnvFile(path);
		for (const [key, value] of Object.entries(entries)) {
			if (untrusted.has(path) && CWD_DENYLIST.has(key)) continue;
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

/**
 * Persist credential key/value pairs into the env file WITHOUT touching anything
 * else in it: existing lines for the given keys are replaced in place, missing keys
 * are appended, and all other lines (other credentials, comments, base-URL
 * overrides) are preserved verbatim. A plain rewrite would destroy e.g. a stored
 * STRIPE_API_KEY when the Aktiva prompt saves.
 */
function saveCredentialsToEnvFile(values: Record<string, string>, path: string = HOME_ENV_FILE): void {
	mkdirSync(dirname(path), { recursive: true });
	let existing = "";
	try {
		existing = readFileSync(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
	const lines = existing === "" ? [] : existing.split("\n");
	// Drop a single trailing empty line so we don't accumulate blank lines on resave.
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const remaining = { ...values };
	const updated = lines.map((line) => {
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (match && match[1] in remaining) {
			const key = match[1];
			const value = remaining[key];
			delete remaining[key];
			return `${key}=${value}`;
		}
		return line;
	});
	for (const [key, value] of Object.entries(remaining)) {
		updated.push(`${key}=${value}`);
	}
	// Write and tighten permissions through a single fd so the 0600 bits always land
	// on the file we just wrote, never on one swapped in between write and chmod.
	const fd = openSync(path, "w", 0o600);
	try {
		writeFileSync(fd, `${updated.join("\n")}\n`);
		fchmodSync(fd, 0o600);
	} finally {
		closeSync(fd);
	}
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
			saveCredentialsToEnvFile({ MERIT_API_ID: apiId, MERIT_API_KEY: apiKey }, target);
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
// keyed on MERIT_PALK_API_ID / MERIT_PALK_API_KEY, and the interactive prompt
// persists them the same way (saveCredentialsToEnvFile merges — it never touches
// other keys in the file).

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
			"Merit Palk API credentials not found.\nGenerate them in Merit Palk: Settings → API Settings → New API key (requires a Palk PRO license).\n",
		);
		if (!apiId) apiId = cleanValue(await promptHidden("Paste your Palk API ID: "));
		if (!apiKey) apiKey = cleanValue(await promptHidden("Paste your Palk API key: "));
		if (apiId && apiKey) {
			const target = opts.envFilePath ?? HOME_ENV_FILE;
			saveCredentialsToEnvFile({ MERIT_PALK_API_ID: apiId, MERIT_PALK_API_KEY: apiKey }, target);
			process.stdout.write(`Saved to ${target} (mode 0600).\n`);
		}
	}

	if (!apiId || !apiKey) {
		throw new AuthError("No Merit Palk API credentials found.", PALK_AUTH_SUGGESTION);
	}

	return { apiId, apiKey };
}

// Exported for testing.
export const _internal = { parseEnvFile, cleanValue, saveCredentialsToEnvFile, HOME_ENV_FILE, CWD_ENV_FILE };
