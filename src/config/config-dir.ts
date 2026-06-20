// Single source of truth for where elnora-merit keeps its per-machine config and
// reference files (the Stripe map, the idempotency ledger, resolver overrides, the
// äriregister cache, and the synced company profile).
//
// Historically every one of those paths hardcoded `~/.config/elnora-merit/…`
// independently. This resolver lets one env var — MERIT_REFERENCES_DIR — relocate
// the whole set to a shared "references" home, so the CLI and an agent can point at
// the same directory (parity with how the sibling Linear tool uses
// LINEAR_REFERENCES_DIR). Unset, it resolves to the historical default, so existing
// installs are unaffected.
//
// Resolution reads process.env ONLY (never an .env file), because the credential
// `.env` itself lives inside this directory — the directory must be known before any
// env file is loaded.
//
// Note: the credential `.env` is deliberately NOT forced into this directory. Secrets
// stay anchored at the home default (see auth.ts) and MERIT_REFERENCES_DIR only adds
// an extra, opt-in, trusted env-file location. Non-secret reference files relocate.

import { homedir } from "node:os";
import { join } from "node:path";

/** Historical default config directory: ~/.config/elnora-merit */
export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "elnora-merit");

/**
 * The base directory for elnora-merit's reference/config files. Honors
 * MERIT_REFERENCES_DIR (trimmed) when set and non-empty; otherwise the historical
 * default. Per-file flags (e.g. `--map`) and per-file env vars (e.g.
 * MERIT_STRIPE_MAP) still override the path of an individual file at a higher
 * precedence than this base.
 */
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
	return env.MERIT_REFERENCES_DIR?.trim() || DEFAULT_CONFIG_DIR;
}

/** Join a filename onto the resolved config directory. */
export function configPath(filename: string, env: NodeJS.ProcessEnv = process.env): string {
	return join(resolveConfigDir(env), filename);
}
