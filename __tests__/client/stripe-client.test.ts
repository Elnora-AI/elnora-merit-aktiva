import { afterEach, describe, expect, it, vi } from "vitest";
import { getStripeClient, StripeClient, StripeError } from "../../src/client/stripe-client.js";

// Make 429 backoff instant.
vi.mock("../../src/utils/sleep.js", () => ({ sleep: () => Promise.resolve() }));

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function makeClient() {
	return new StripeClient("sk_test_123", "http://stripe.test/v1");
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("StripeClient.get", () => {
	it("sends a bearer token and parses the JSON body", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "acct_1" }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await makeClient().get<{ id: string }>("account");
		expect(res).toEqual({ id: "acct_1" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://stripe.test/v1/account");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_123");
	});

	it("form-encodes query params including bracketed keys", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { object: "list", data: [], has_more: false }));
		vi.stubGlobal("fetch", fetchMock);
		await makeClient().get("balance_transactions", { payout: "po_1", "expand[]": "data.source" });
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("payout=po_1");
		expect(url).toContain("expand%5B%5D=data.source");
	});

	it("maps 401 to a StripeError with the auth exit code", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, "Invalid API Key")));
		await expect(makeClient().get("account")).rejects.toMatchObject({ name: "StripeError", status: 401, exitCode: 3 });
	});

	it("retries on 429 then succeeds", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(429, "", { "retry-after": "1" }))
			.mockResolvedValueOnce(jsonResponse(200, { id: "acct_1" }));
		vi.stubGlobal("fetch", fetchMock);
		const res = await makeClient().get<{ id: string }>("account");
		expect(res).toEqual({ id: "acct_1" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("StripeClient.listAll", () => {
	it("follows has_more via starting_after and concatenates pages", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { object: "list", data: [{ id: "a" }, { id: "b" }], has_more: true }))
			.mockResolvedValueOnce(jsonResponse(200, { object: "list", data: [{ id: "c" }], has_more: false }));
		vi.stubGlobal("fetch", fetchMock);

		const all = await makeClient().listAll<{ id: string }>("payouts");
		expect(all.map((x) => x.id)).toEqual(["a", "b", "c"]);
		const secondUrl = fetchMock.mock.calls[1][0] as string;
		expect(secondUrl).toContain("starting_after=b");
	});
});

describe("getStripeClient", () => {
	it("throws an auth error when STRIPE_API_KEY is missing", () => {
		expect(() => getStripeClient({})).toThrow(/Stripe API key/);
	});
	it("builds a client from the env key", () => {
		expect(getStripeClient({ STRIPE_API_KEY: "sk_live_x" })).toBeInstanceOf(StripeClient);
	});
});

describe("StripeError", () => {
	it("uses the API exit code for non-auth statuses", () => {
		const err = new StripeError(500, "boom");
		expect(err.exitCode).toBe(6);
	});
});
