import { describe, expect, it } from "vitest";
import {
	endpointUrl,
	resolveBaseUrl,
	resolveDefaultVersion,
	resolveLocalization,
	resolvePalkBaseUrl,
} from "../../src/config/index.js";

describe("resolveLocalization", () => {
	it("defaults to ee", () => {
		expect(resolveLocalization({})).toBe("ee");
	});
	it("accepts pl (case-insensitive)", () => {
		expect(resolveLocalization({ MERIT_LOCALIZATION: "PL" })).toBe("pl");
	});
	it("rejects unknown localizations", () => {
		expect(() => resolveLocalization({ MERIT_LOCALIZATION: "de" })).toThrow(/Invalid MERIT_LOCALIZATION/);
	});
});

describe("resolveDefaultVersion", () => {
	it("defaults to v1", () => {
		expect(resolveDefaultVersion({})).toBe("v1");
	});
	it("accepts v2", () => {
		expect(resolveDefaultVersion({ MERIT_API_VERSION: "v2" })).toBe("v2");
	});
	it("rejects unknown versions", () => {
		expect(() => resolveDefaultVersion({ MERIT_API_VERSION: "v3" })).toThrow(/Invalid MERIT_API_VERSION/);
	});
});

describe("resolveBaseUrl", () => {
	it("maps ee to aktiva.merit.ee", () => {
		expect(resolveBaseUrl({ MERIT_LOCALIZATION: "ee" })).toBe("https://aktiva.merit.ee/api");
	});
	it("maps pl to program.360ksiegowosc.pl", () => {
		expect(resolveBaseUrl({ MERIT_LOCALIZATION: "pl" })).toBe("https://program.360ksiegowosc.pl/api");
	});
	it("honours MERIT_BASE_URL override and trims trailing slashes", () => {
		expect(resolveBaseUrl({ MERIT_BASE_URL: "http://localhost:8080/api/" })).toBe("http://localhost:8080/api");
	});
});

describe("resolvePalkBaseUrl", () => {
	it("defaults to the Estonia Palk host", () => {
		expect(resolvePalkBaseUrl({})).toBe("https://palk.merit.ee/api");
	});
	it("ignores MERIT_LOCALIZATION (Palk is Estonia-only)", () => {
		expect(resolvePalkBaseUrl({ MERIT_LOCALIZATION: "pl" })).toBe("https://palk.merit.ee/api");
	});
	it("honours MERIT_PALK_BASE_URL override and trims trailing slashes", () => {
		expect(resolvePalkBaseUrl({ MERIT_PALK_BASE_URL: "http://localhost:9090/api/" })).toBe("http://localhost:9090/api");
	});
});

describe("endpointUrl", () => {
	it("joins base, version, and path", () => {
		expect(endpointUrl("https://aktiva.merit.ee/api", "v1", "getinvoices")).toBe(
			"https://aktiva.merit.ee/api/v1/getinvoices",
		);
	});
	it("tolerates a leading slash on the path", () => {
		expect(endpointUrl("https://aktiva.merit.ee/api", "v2", "/sendinvoice")).toBe(
			"https://aktiva.merit.ee/api/v2/sendinvoice",
		);
	});
});
