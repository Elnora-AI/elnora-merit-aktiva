import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _internal, getCredentials, getPalkCredentials, loadEnvFile } from "../../src/client/auth.js";

const SAVED = { ...process.env };

beforeEach(() => {
	// Isolate env per test.
	for (const k of Object.keys(process.env)) {
		if (k.startsWith("MERIT_")) delete process.env[k];
	}
});

afterEach(() => {
	process.env = { ...SAVED };
});

describe("parseEnvFile", () => {
	it("parses KEY=value, skips comments/blanks, strips quotes", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, '# comment\nMERIT_API_ID=abc123\n\nMERIT_API_KEY="secret/with=signs"\n');
		try {
			const parsed = _internal.parseEnvFile(path);
			expect(parsed.MERIT_API_ID).toBe("abc123");
			expect(parsed.MERIT_API_KEY).toBe("secret/with=signs");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns {} for a missing file", () => {
		expect(_internal.parseEnvFile(join(tmpdir(), "does-not-exist-merit.env"))).toEqual({});
	});
});

describe("loadEnvFile", () => {
	it("does not overwrite an already-set env var", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, "MERIT_API_ID=from-file\n");
		process.env.MERIT_API_ID = "from-real-env";
		try {
			loadEnvFile([path]);
			expect(process.env.MERIT_API_ID).toBe("from-real-env");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("fills in vars that are not already set", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, "MERIT_API_KEY=filled\n");
		try {
			loadEnvFile([path]);
			expect(process.env.MERIT_API_KEY).toBe("filled");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("getCredentials", () => {
	it("resolves from process.env", async () => {
		process.env.MERIT_API_ID = "id-1";
		process.env.MERIT_API_KEY = "key-1";
		const creds = await getCredentials();
		expect(creds.apiId).toBe("id-1");
		expect(creds.apiKey).toBe("key-1");
		expect(creds.localization).toBe("ee");
		expect(creds.version).toBe("v1");
	});

	it("throws AuthError (exit code 3) when credentials are missing and prompting is off", async () => {
		await expect(getCredentials({ allowPrompt: false })).rejects.toMatchObject({ exitCode: 3 });
	});
});

describe("getPalkCredentials", () => {
	it("resolves from the MERIT_PALK_* env vars (not the Aktiva ones)", async () => {
		process.env.MERIT_API_ID = "aktiva-id";
		process.env.MERIT_API_KEY = "aktiva-key";
		process.env.MERIT_PALK_API_ID = "palk-id";
		process.env.MERIT_PALK_API_KEY = "palk-key";
		const creds = await getPalkCredentials();
		expect(creds.apiId).toBe("palk-id");
		expect(creds.apiKey).toBe("palk-key");
	});

	it("throws AuthError (exit code 3) when Palk credentials are missing and prompting is off", async () => {
		process.env.MERIT_API_ID = "aktiva-id";
		process.env.MERIT_API_KEY = "aktiva-key";
		await expect(getPalkCredentials({ allowPrompt: false })).rejects.toMatchObject({ exitCode: 3 });
	});
});
