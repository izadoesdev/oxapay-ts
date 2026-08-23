import { describe, expect, test } from "bun:test";
import { OxaPay } from "../src/index.js";

const envelope = (data: unknown) => Response.json({ data, message: "ok", error: null, status: 200, version: "1" });

describe("documented v1 route coverage", () => {
	test("exposes every documented payment, payout, swap, account, and common operation", async () => {
		const seen: Array<{ method: string; path: string; auth: string | null }> = [];
		const api = new OxaPay({
			merchantApiKey: "merchant",
			payoutApiKey: "payout",
			generalApiKey: "general",
			baseUrl: "https://example.test/v1",
			fetch: async (input) => {
				const request = input as Request;
				const url = new URL(request.url);
				seen.push({
					method: request.method,
					path: url.pathname,
					auth:
						request.headers.get("merchant_api_key") ?? request.headers.get("payout_api_key") ?? request.headers.get("general_api_key"),
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
