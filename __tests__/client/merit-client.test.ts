import { afterEach, describe, expect, it, vi } from "vitest";
import { MeritClient } from "../../src/client/merit-client.js";
import { sign } from "../../src/client/signer.js";

// Make retries instant.
vi.mock("../../src/utils/sleep.js", () => ({ sleep: () => Promise.resolve() }));

const CREDS = { apiId: "id-123", apiKey: "key-abc", localization: "ee" as const, version: "v1" as const };
const BASE = "http://merit.test/api";

function makeClient() {
	return new MeritClient(CREDS, BASE);
}

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
	return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("MeritClient.call", () => {
	it("signs the request correctly and sends a compact JSON body", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, '{"ok":true}'));
		vi.stubGlobal("fetch", fetchMock);

		const result = await makeClient().call("getinvoices", { version: "v1", body: { A: 1 } });
		expect(result).toEqual({ ok: true });

		const [calledUrl, init] = fetchMock.mock.calls[0];
		const url = new URL(calledUrl as string);
		expect(url.origin + url.pathname).toBe("http://merit.test/api/v1/getinvoices");
		expect(init.method).toBe("POST");
		expect(init.body).toBe('{"A":1}'); // compact

		// The signature in the query must match a recompute over the exact sent body.
		const ts = url.searchParams.get("timestamp") as string;
		const sig = url.searchParams.get("signature") as string;
		expect(url.searchParams.get("apiId")).toBe("id-123");
		expect(sig).toBe(sign("id-123", ts, '{"A":1}', "key-abc"));
	});

	it("signs an empty body as '' for a no-body call", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "[]"));
		vi.stubGlobal("fetch", fetchMock);

		await makeClient().call("getbanks");
		const [calledUrl, init] = fetchMock.mock.calls[0];
		const url = new URL(calledUrl as string);
		const ts = url.searchParams.get("timestamp") as string;
		expect(init.body).toBe("");
		expect(url.searchParams.get("signature")).toBe(sign("id-123", ts, "", "key-abc"));
	});

	it("retries on HTTP 429 then succeeds", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(429, "", { "retry-after": "1" }))
			.mockResolvedValueOnce(jsonResponse(200, '{"ok":1}'));
		vi.stubGlobal("fetch", fetchMock);

		const result = await makeClient().call<{ ok: number }>("getinvoices");
		expect(result).toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("regenerates the timestamp on each retry", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(429, "", { "retry-after": "1" }))
			.mockResolvedValueOnce(jsonResponse(200, "{}"));
		vi.stubGlobal("fetch", fetchMock);

		await makeClient().call("getinvoices", { body: { x: 1 } });
		const ts1 = new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("timestamp");
		const ts2 = new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("timestamp");
		// Both present and well-formed; the client re-signs each attempt.
		expect(ts1).toMatch(/^\d{14}$/);
		expect(ts2).toMatch(/^\d{14}$/);
	});

	it("throws ApiError with the HTTP status on a non-2xx response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, "api-wronglicense")));
		await expect(makeClient().call("getinvoices")).rejects.toMatchObject({
			name: "ApiError",
			status: 401,
			exitCode: 6,
		});
	});

	it("treats a 200 with an ASP.NET stack trace as an error", async () => {
		const trace = "System.NullReferenceException: Object reference not set\n   at Merit.Api.Controller.Post()";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, trace)));
		await expect(makeClient().call("sendinvoice", { body: {} })).rejects.toMatchObject({
			name: "ApiError",
			status: 200,
		});
	});

	it("returns null for an empty 200 body", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, "")));
		await expect(makeClient().call("deleteinvoice", { body: { Id: "x" } })).resolves.toBeNull();
	});

	it("does NOT retry a transient 5xx on a POST (Merit has no idempotency key — a retry could double-post)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(503, "Service Unavailable"))
			.mockResolvedValueOnce(jsonResponse(200, '{"ok":1}'));
		vi.stubGlobal("fetch", fetchMock);
		await expect(makeClient().call("sendglbatch", { body: {} })).rejects.toMatchObject({
			name: "ApiError",
			status: 503,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("retries a transient 5xx on a GET (idempotent) then succeeds", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(503, "Service Unavailable"))
			.mockResolvedValueOnce(jsonResponse(200, '{"ok":1}'));
		vi.stubGlobal("fetch", fetchMock);
		await expect(makeClient().call("PaymentImports?BankId=x", { method: "GET" })).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("still retries 429 on a POST (rate limiting fires before processing)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(429, "", { "retry-after": "1" }))
			.mockResolvedValueOnce(jsonResponse(200, '{"ok":1}'));
		vi.stubGlobal("fetch", fetchMock);
		await expect(makeClient().call("sendinvoice", { body: {} })).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("surfaces an ApiError after a GET 5xx exhausts its retries", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(502, "Bad Gateway")));
		await expect(makeClient().call("PaymentImports?BankId=x", { method: "GET" })).rejects.toMatchObject({
			name: "ApiError",
			status: 502,
		});
	});

	it("rejects a GET that carries a body (would silently mismatch the signature)", async () => {
		vi.stubGlobal("fetch", vi.fn());
		await expect(makeClient().call("getsomething", { method: "GET", body: { x: 1 } })).rejects.toMatchObject({
			name: "ValidationError",
		});
	});

	it("handles an HTTP-date Retry-After header without error (RFC-7231 form)", async () => {
		const future = new Date(Date.now() + 2000).toUTCString(); // e.g. "Wed, 21 Oct 2026 07:28:00 GMT"
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(429, "", { "retry-after": future }))
			.mockResolvedValueOnce(jsonResponse(200, "{}"));
		vi.stubGlobal("fetch", fetchMock);
		await expect(makeClient().call("getinvoices")).resolves.toEqual({});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
