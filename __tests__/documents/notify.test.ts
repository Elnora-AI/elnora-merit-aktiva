import { describe, expect, it } from "vitest";
import { assertWebhookUrl } from "../../src/documents/notify.js";

describe("assertWebhookUrl", () => {
	it("accepts an https webhook", () => {
		expect(assertWebhookUrl("https://hooks.slack.com/services/T/B/x").protocol).toBe("https:");
	});

	it("rejects http, so the digest never leaves in cleartext", () => {
		expect(() => assertWebhookUrl("http://hooks.slack.com/services/T/B/x")).toThrow(/must be https/);
	});

	it("rejects other schemes", () => {
		expect(() => assertWebhookUrl("file:///tmp/exfil")).toThrow(/must be https/);
		expect(() => assertWebhookUrl("ftp://example.com/x")).toThrow(/must be https/);
	});

	it("rejects a malformed URL with a clear message rather than an opaque fetch error", () => {
		expect(() => assertWebhookUrl("hooks.slack.com/no-scheme")).toThrow(/not a valid URL/);
		expect(() => assertWebhookUrl("")).toThrow(/not a valid URL/);
	});
});
