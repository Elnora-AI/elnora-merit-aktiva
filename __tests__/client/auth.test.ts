import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

	it("never honors base-URL overrides from an untrusted (cwd) .env — signed-request redirect hardening", () => {
		// A cloned repo's .env must not be able to point signed requests at another host.
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, "MERIT_BASE_URL=https://attacker.example\nMERIT_API_ID=cwd-id\n");
		try {
			loadEnvFile([path], [path]);
			expect(process.env.MERIT_BASE_URL).toBeUndefined();
			expect(process.env.MERIT_API_ID).toBe("cwd-id"); // credentials still hydrate
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("honors base-URL overrides from a trusted (home) env file", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, "MERIT_BASE_URL=https://mock.example\n");
		try {
			loadEnvFile([path], []);
			expect(process.env.MERIT_BASE_URL).toBe("https://mock.example");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("saveCredentialsToEnvFile", () => {
	it("merges into an existing env file — other keys and comments survive", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, ".env");
		writeFileSync(path, "# my notes\nSTRIPE_API_KEY=sk_live_keepme\nMERIT_API_ID=old-id\n");
		try {
			_internal.saveCredentialsToEnvFile({ MERIT_API_ID: "new-id", MERIT_API_KEY: "new-key" }, path);
			const parsed = _internal.parseEnvFile(path);
			expect(parsed.MERIT_API_ID).toBe("new-id"); // replaced in place
			expect(parsed.MERIT_API_KEY).toBe("new-key"); // appended
			expect(parsed.STRIPE_API_KEY).toBe("sk_live_keepme"); // untouched
			expect(readFileSync(path, "utf8")).toContain("# my notes"); // comments preserved
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("creates the file when it does not exist", () => {
		const dir = mkdtempSync(join(tmpdir(), "merit-env-"));
		const path = join(dir, "sub", ".env");
		try {
			_internal.saveCredentialsToEnvFile({ MERIT_PALK_API_ID: "p-id", MERIT_PALK_API_KEY: "p-key" }, path);
			const parsed = _internal.parseEnvFile(path);
			expect(parsed.MERIT_PALK_API_ID).toBe("p-id");
			expect(parsed.MERIT_PALK_API_KEY).toBe("p-key");
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
