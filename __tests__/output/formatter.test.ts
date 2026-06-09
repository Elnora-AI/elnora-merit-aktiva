import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/output/formatter.js";

describe("redactSecrets", () => {
	it("redacts env-assignment forms (Merit + Stripe)", () => {
		expect(redactSecrets("MERIT_API_KEY=abc123")).toBe("MERIT_API_KEY=[REDACTED]");
		expect(redactSecrets("MERIT_API_ID=guid-xyz")).toBe("MERIT_API_ID=[REDACTED]");
		expect(redactSecrets("STRIPE_API_KEY=sk_live_abc")).toBe("STRIPE_API_KEY=[REDACTED]");
		expect(redactSecrets("MERIT_PALK_API_KEY=zzz")).toBe("MERIT_PALK_API_KEY=[REDACTED]");
	});
	it("redacts query-string credential params", () => {
		expect(redactSecrets("https://x/api?apiId=AAA&signature=BBB&timestamp=1")).toBe(
			"https://x/api?apiId=[REDACTED]&signature=[REDACTED]&timestamp=1",
		);
	});
	it("redacts JSON-body credential forms", () => {
		expect(redactSecrets('{"apiKey":"SECRET123"}')).toBe('{"apiKey":"[REDACTED]"}');
		expect(redactSecrets('{"api_key":"SECRET"}')).toBe('{"api_key":"[REDACTED]"}');
		expect(redactSecrets('{"signature":"sig=="}')).toBe('{"signature":"[REDACTED]"}');
	});
	it("redacts an Authorization Bearer header (Stripe key)", () => {
		expect(redactSecrets("Authorization: Bearer sk_live_supersecret")).toBe("Authorization: Bearer [REDACTED]");
	});
	it("leaves non-secret text unchanged", () => {
		expect(redactSecrets("Merit API error 401 on getinvoices.")).toBe("Merit API error 401 on getinvoices.");
	});
});
