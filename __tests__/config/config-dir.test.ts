import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, DEFAULT_CONFIG_DIR, resolveConfigDir } from "../../src/config/config-dir.js";

describe("resolveConfigDir", () => {
	it("defaults to ~/.config/elnora-merit when MERIT_REFERENCES_DIR is unset", () => {
		expect(resolveConfigDir({})).toBe(DEFAULT_CONFIG_DIR);
		expect(DEFAULT_CONFIG_DIR).toBe(join(homedir(), ".config", "elnora-merit"));
	});

	it("honors MERIT_REFERENCES_DIR when set", () => {
		expect(resolveConfigDir({ MERIT_REFERENCES_DIR: "/srv/refs" })).toBe("/srv/refs");
	});

	it("trims and ignores a blank MERIT_REFERENCES_DIR", () => {
		expect(resolveConfigDir({ MERIT_REFERENCES_DIR: "  /srv/refs  " })).toBe("/srv/refs");
		expect(resolveConfigDir({ MERIT_REFERENCES_DIR: "   " })).toBe(DEFAULT_CONFIG_DIR);
	});
});

describe("configPath", () => {
	it("joins a filename onto the resolved base dir", () => {
		expect(configPath("company-profile.json", { MERIT_REFERENCES_DIR: "/srv/refs" })).toBe(
			"/srv/refs/company-profile.json",
		);
		expect(configPath("stripe-map.json", {})).toBe(join(DEFAULT_CONFIG_DIR, "stripe-map.json"));
	});
});
