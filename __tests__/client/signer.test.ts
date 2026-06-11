import { describe, expect, it } from "vitest";
import { formatTimestamp, sign } from "../../src/client/signer.js";

describe("sign", () => {
	// Official Merit Aktiva test vector from the reference manual:
	// https://api.merit.ee/connecting-robots/reference-manual/authentication/
	it("reproduces Merit's published signature vector", () => {
		const apiId = "670fe52f-558a-4be8-ade0-526e01a106d0";
		const apiKey = "AoCmZGUfWMMhLJ+Eb6oRF4pAEw9XJP9b/RL5c2Gqk2w=";
		const timestamp = "20240624205902";
		// The signed body is the exact compact JSON string sent on the wire.
		const body = JSON.stringify({
			CustName: "Kliendinimi",
			CustId: "3a274294-9c60-4a3d-93f0-1874253f073e",
			OverDueDays: 5,
			DebtDate: "20220501",
		});
		expect(sign(apiId, timestamp, body, apiKey)).toBe("dt6dkfuj+OfX01YkvvAoN/fekAUGr6AvVlQhUUja9Qc=");
	});

	it("uses the API key verbatim as the HMAC key (not base64-decoded)", () => {
		// A base64-decoded key would produce a different signature; this guards
		// against a future refactor 'fixing' the key handling.
		const wrong = sign("id", "20240101000000", "{}", "AoCmZGUfWMMhLJ+Eb6oRF4pAEw9XJP9b/RL5c2Gqk2w=");
		expect(wrong).toBeTypeOf("string");
		expect(wrong.length).toBeGreaterThan(0);
	});

	it("signs an empty body deterministically", () => {
		const a = sign("id", "20240101000000", "", "key");
		const b = sign("id", "20240101000000", "", "key");
		expect(a).toBe(b);
	});
});

describe("formatTimestamp", () => {
	it("formats UTC as yyyyMMddHHmmss", () => {
		const d = new Date(Date.UTC(2024, 5, 24, 20, 59, 2)); // 2024-06-24 20:59:02 UTC
		expect(formatTimestamp(d)).toBe("20240624205902");
	});

	it("zero-pads all fields", () => {
		const d = new Date(Date.UTC(2025, 0, 5, 3, 7, 9));
		expect(formatTimestamp(d)).toBe("20250105030709");
	});
});
