import { describe, expect, test } from "bun:test";
import {
	OxaPay,
	OxaPayAbortError,
	OxaPayApiError,
	OxaPayConfigurationError,
	OxaPayRateLimitError,
	routes,
} from "../src/index.js";

const envelope = (data: unknown, init?: ResponseInit) =>
	Response.json({ data, message: "ok", error: null, status: init?.status ?? 200, version: "1" }, init);

describe("OxaPay transport", () => {
	test("serializes public camelCase input, attaches the correct key, and decodes the response", async () => {
		let observed: Request | undefined;
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			fetch: async (request) => {
				observed = request as Request;
				return envelope({ track_id: "track_1", payment_url: "https://pay.example/1", expired_at: 42, date: 1 });
			},
		});

		const result = await api.payment.createInvoice({
			amount: 12.5,
			callbackUrl: "https://merchant.example/oxapay",
			mixedPayment: true,
			orderId: "order_1",
		});

		expect(observed?.url).toBe("https://example.test/v1/payment/invoice");
		expect(observed?.redirect).toBe("error");
		expect(observed?.headers.get("merchant_api_key")).toBe("merchant-secret");
		expect(await observed?.json()).toEqual({
			amount: 12.5,
			callback_url: "https://merchant.example/oxapay",
			mixed_payment: true,
			order_id: "order_1",
		});
		expect(result.data).toEqual({ trackId: "track_1", paymentUrl: "https://pay.example/1", expiredAt: 42, date: 1 });
	});

	test("runs request middleware before credentials are attached", async () => {
		let middlewareSawKey: string | null = "not-run";
		let fetchSawKey: string | null = "not-run";
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			onRequest: (request) => {
				middlewareSawKey = request.headers.get("merchant_api_key");
				request.headers.set("x-request-id", "request_1");
			},
			fetch: async (request) => {
				fetchSawKey = (request as Request).headers.get("merchant_api_key");
				expect((request as Request).headers.get("x-request-id")).toBe("request_1");
				return envelope({ list: [] });
			},
		});

		await api.payment.acceptedCurrencies();
		expect(middlewareSawKey).toBeNull();
		expect(fetchSawKey).toBe("merchant-secret");
	});

	test("keeps API keys and query values out of response hooks and serialized errors", async () => {
		let transportRequest: Request | undefined;
		let hookRequest: Request | undefined;
		let hookBody: string | undefined;
		const email = "buyer@example.test";
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			onRequest(request) {
				request.headers.set("x-request-id", "request_1");
			},
			async onResponse(response, request) {
				hookRequest = request;
				hookBody = await response.text();
			},
			fetch: async (request) => {
				transportRequest = request as Request;
				return envelope({}, { status: 400 });
			},
		});

		let error: unknown;
		try {
			await api.payment.list({ email });
		} catch (cause) {
			error = cause;
		}

		expect(error).toBeInstanceOf(OxaPayApiError);
		expect(transportRequest?.headers.get("merchant_api_key")).toBe("merchant-secret");
		expect(hookRequest?.headers.get("merchant_api_key")).toBeNull();
		expect(hookRequest?.headers.get("payout_api_key")).toBeNull();
		expect(hookRequest?.headers.get("general_api_key")).toBeNull();
		expect(hookRequest?.headers.get("x-request-id")).toBe("request_1");
		expect(hookRequest?.url).toBe("https://example.test/v1/payment");
		expect(hookRequest?.body).toBeNull();
		expect(hookBody).toContain('"status":400');
		expect(JSON.stringify(error)).not.toContain(email);
	});

	test("maps query keys and only retries safe reads by default", async () => {
		let calls = 0;
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			retry: { maxAttempts: 2, initialDelayMs: 0 },
			fetch: async (request) => {
				calls += 1;
				if (calls === 1) return envelope({}, { status: 503 });
				expect((request as Request).url).toBe("https://example.test/v1/payment?from_date=100&page=2");
				return envelope({ list: [], meta: { page: 2, last_page: 2, total: 0 } });
			},
		});

		const result = await api.payment.list({ fromDate: 100, page: 2 });
		expect(calls).toBe(2);
		expect(result.data.meta).toEqual({ page: 2, lastPage: 2, total: 0 });
	});

	test("honors Retry-After even when it exceeds the exponential-backoff cap", async () => {
		let calls = 0;
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 },
			fetch: async () => {
				calls += 1;
				if (calls === 1) return new Response(JSON.stringify({ data: {}, message: "retry", error: null, status: 429, version: "1" }), {
					status: 429,
					headers: { "content-type": "application/json", "retry-after": "0.05" },
				});
				return envelope({ status: true });
			},
		});

		const startedAt = performance.now();
		await api.common.monitor();
		expect(calls).toBe(2);
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(25);
	});

	test("cancels retry backoff without starting another request", async () => {
		let calls = 0;
		const controller = new AbortController();
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			retry: { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 500 },
			fetch: async () => {
				calls += 1;
				return envelope({}, { status: 503 });
			},
		});

		setTimeout(() => controller.abort("cancelled"), 10);
		const startedAt = performance.now();
		await expect(api.common.monitor({ signal: controller.signal })).rejects.toBeInstanceOf(OxaPayAbortError);
		expect(calls).toBe(1);
		expect(performance.now() - startedAt).toBeLessThan(150);
	});

	test("rejects invalid retry configuration before sending a request", async () => {
		const invalidPolicies = [
			{ maxAttempts: Number.NaN },
			{ maxAttempts: Number.POSITIVE_INFINITY },
			{ initialDelayMs: Number.NaN },
			{ maxDelayMs: Number.POSITIVE_INFINITY },
		];
		let calls = 0;
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			fetch: async () => {
				calls += 1;
				return envelope({ status: true });
			},
		});

		for (const retry of invalidPolicies) {
			await expect(api.common.monitor({ retry })).rejects.toBeInstanceOf(OxaPayConfigurationError);
		}
		expect(calls).toBe(0);
	});

	test("rejects invalid timeouts and non-finite request numbers before sending a request", async () => {
		for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, -1, 2_147_483_648]) {
			expect(() => new OxaPay({ timeoutMs })).toThrow(OxaPayConfigurationError);
		}

		let calls = 0;
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			fetch: async () => {
				calls += 1;
				return envelope({ list: [] });
			},
		});

		await expect(api.payment.createInvoice({ amount: Number.NaN })).rejects.toBeInstanceOf(OxaPayConfigurationError);
		await expect(api.payment.createInvoice({ amount: Number.POSITIVE_INFINITY })).rejects.toBeInstanceOf(OxaPayConfigurationError);
		await expect(api.payment.list({ page: Number.NEGATIVE_INFINITY })).rejects.toBeInstanceOf(OxaPayConfigurationError);
		await expect(api.common.monitor({ timeoutMs: Number.NaN })).rejects.toBeInstanceOf(OxaPayConfigurationError);
		await expect(api.common.monitor({ timeoutMs: 0 })).resolves.toMatchObject({ data: { list: [] } });
		expect(calls).toBe(1);
	});

	test("rejects request values that JSON would silently change before sending", async () => {
		let calls = 0;
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			fetch: async () => {
				calls += 1;
				return envelope({ status: true });
			},
		});
		const operation = { method: "POST", path: "/custom", auth: "none" } as const;

		await expect(api.client.request(operation, { body: { ignored: () => undefined } as never })).rejects.toBeInstanceOf(
			OxaPayConfigurationError,
		);
		await expect(api.client.request(operation, { body: { items: [undefined] } as never })).rejects.toBeInstanceOf(
			OxaPayConfigurationError,
		);
		expect(calls).toBe(0);
	});

	test("rejects unsafe base URLs before creating a client", () => {
		for (const baseUrl of [
			"ftp://example.test/v1",
			"https://user@example.test/v1",
			"https://example.test/v1?account=buyer",
			"https://example.test/v1#fragment",
		]) {
			expect(() => new OxaPay({ baseUrl })).toThrow(OxaPayConfigurationError);
		}
	});

	test("does not retry a create operation without explicit unsafe-retry opt-in", async () => {
		let calls = 0;
		const api = new OxaPay({
			merchantApiKey: "merchant-secret",
			baseUrl: "https://example.test/v1",
			retry: { maxAttempts: 3, initialDelayMs: 0 },
			fetch: async () => {
				calls += 1;
				return envelope({}, { status: 503 });
			},
		});

		await expect(api.payment.createInvoice({ amount: 1 })).rejects.toBeInstanceOf(OxaPayApiError);
		expect(calls).toBe(1);
	});

	test("fails locally when a route's required API key is absent", async () => {
		const api = new OxaPay({ baseUrl: "https://example.test/v1", fetch: async () => envelope({}) });
		await expect(api.payment.createInvoice({ amount: 1 })).rejects.toBeInstanceOf(OxaPayConfigurationError);
	});

	test("replaces credentials when creating a tenant-specific view", async () => {
		const api = new OxaPay({
			merchantApiKey: "root-merchant",
			payoutApiKey: "root-payout",
			baseUrl: "https://example.test/v1",
			fetch: async () => envelope({ list: [] }),
		});
		const tenant = api.withCredentials({ merchantApiKey: "tenant-merchant" });

		await tenant.payment.acceptedCurrencies();
		await expect(tenant.payout.list()).rejects.toBeInstanceOf(OxaPayConfigurationError);
	});

	test("preserves structured OxaPay errors, including retry-after", async () => {
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			retry: false,
			fetch: async () =>
				new Response(JSON.stringify({ data: {}, message: "slow down", error: { key: "rate", message: "Too many requests" }, status: 429, version: "1" }), {
					status: 429,
					headers: { "content-type": "application/json", "retry-after": "1" },
				}),
		});

		await expect(api.common.monitor()).rejects.toMatchObject({
			name: "OxaPayRateLimitError",
			status: 429,
			apiError: { key: "rate", message: "Too many requests" },
			retryAfterMs: 1_000,
		} satisfies Partial<OxaPayRateLimitError>);
	});

	test("makes the route registry available for custom, newly released operations", async () => {
		const api = new OxaPay({
			baseUrl: "https://example.test/v1",
			fetch: async (request) => {
				expect((request as Request).url).toBe("https://example.test/v1/common/monitor");
				return envelope({ status: true });
			},
		});

		await expect(api.client.request<{ status: boolean }>(routes.common.monitor)).resolves.toMatchObject({ data: { status: true } });
	});

	test("covers every documented v1 operation and credential scope", async () => {
		const seen: Array<{ method: string; path: string; auth: string | null }> = [];
		const api = new OxaPay({
			merchantApiKey: "merchant",
			payoutApiKey: "payout",
			generalApiKey: "general",
			baseUrl: "https://example.test/v1",
			fetch: async (input) => {
				const request = input as Request;
				seen.push({
					method: request.method,
					path: new URL(request.url).pathname,
					auth: request.headers.get("merchant_api_key") ?? request.headers.get("payout_api_key") ?? request.headers.get("general_api_key"),
				});
				return envelope({ list: [], meta: { page: 1, last_page: 1, total: 0 } });
			},
		});

		await api.payment.createInvoice({ amount: 1 });
		await api.payment.createWhiteLabel({ amount: 1, payCurrency: "USDT" });
		await api.payment.createStaticAddress({ network: "TRON" });
		await api.payment.revokeStaticAddress({ address: "T-address" });
		await api.payment.listStaticAddresses();
		await api.payment.get("payment 1");
		await api.payment.list();
		await api.payment.statistics();
		await api.payment.acceptedCurrencies();
		await api.payout.create({ address: "T-address", currency: "USDT", amount: 1 });
		await api.payout.get("payout 1");
		await api.payout.list();
		await api.swap.create({ fromCurrency: "USDT", toCurrency: "BTC", amount: 1 });
		await api.swap.list();
		await api.swap.pairs();
		await api.swap.calculate({ fromCurrency: "USDT", toCurrency: "BTC", amount: 1 });
		await api.swap.rate({ fromCurrency: "USDT", toCurrency: "BTC" });
		await api.account.balance();
		await api.common.prices();
		await api.common.currencies();
		await api.common.fiats();
		await api.common.networks();
		await api.common.monitor();

		expect(seen).toEqual([
			{ method: "POST", path: "/v1/payment/invoice", auth: "merchant" },
			{ method: "POST", path: "/v1/payment/white-label", auth: "merchant" },
			{ method: "POST", path: "/v1/payment/static-address", auth: "merchant" },
			{ method: "POST", path: "/v1/payment/static-address/revoke", auth: "merchant" },
			{ method: "GET", path: "/v1/payment/static-address", auth: "merchant" },
			{ method: "GET", path: "/v1/payment/payment%201", auth: "merchant" },
			{ method: "GET", path: "/v1/payment", auth: "merchant" },
			{ method: "GET", path: "/v1/payment/stats", auth: "merchant" },
			{ method: "GET", path: "/v1/payment/accepted-currencies", auth: "merchant" },
			{ method: "POST", path: "/v1/payout", auth: "payout" },
			{ method: "GET", path: "/v1/payout/payout%201", auth: "payout" },
			{ method: "GET", path: "/v1/payout", auth: "payout" },
			{ method: "POST", path: "/v1/general/swap", auth: "general" },
			{ method: "GET", path: "/v1/general/swap", auth: "general" },
			{ method: "GET", path: "/v1/general/swap/pairs", auth: "general" },
			{ method: "POST", path: "/v1/general/swap/calculate", auth: "general" },
			{ method: "POST", path: "/v1/general/swap/rate", auth: "general" },
			{ method: "GET", path: "/v1/general/account/balance", auth: "general" },
			{ method: "GET", path: "/v1/common/prices", auth: null },
			{ method: "GET", path: "/v1/common/currencies", auth: null },
			{ method: "GET", path: "/v1/common/fiats", auth: null },
			{ method: "GET", path: "/v1/common/networks", auth: null },
			{ method: "GET", path: "/v1/common/monitor", auth: null },
		]);
	});
});
