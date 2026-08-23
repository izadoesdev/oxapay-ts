import type { OxaPayOperation } from "./types.js";

const operation = (method: OxaPayOperation["method"], path: string, auth: OxaPayOperation["auth"]) =>
	({ method, path, auth }) as const;

/**
 * Every documented OxaPay v1 HTTP operation appears here exactly once. Resources
 * are deliberately thin wrappers around this registry, making coverage auditable.
 */
export const routes = {
	payment: {
		createInvoice: operation("POST", "/payment/invoice", "merchant"),
		createWhiteLabel: operation("POST", "/payment/white-label", "merchant"),
		createStaticAddress: operation("POST", "/payment/static-address", "merchant"),
		revokeStaticAddress: operation("POST", "/payment/static-address/revoke", "merchant"),
		listStaticAddresses: operation("GET", "/payment/static-address", "merchant"),
		get: operation("GET", "/payment/{trackId}", "merchant"),
		list: operation("GET", "/payment", "merchant"),
		statistics: operation("GET", "/payment/stats", "merchant"),
		acceptedCurrencies: operation("GET", "/payment/accepted-currencies", "merchant"),
	},
	payout: {
		create: operation("POST", "/payout", "payout"),
		get: operation("GET", "/payout/{trackId}", "payout"),
		list: operation("GET", "/payout", "payout"),
	},
	swap: {
		create: operation("POST", "/general/swap", "general"),
		list: operation("GET", "/general/swap", "general"),
		pairs: operation("GET", "/general/swap/pairs", "general"),
		calculate: operation("POST", "/general/swap/calculate", "general"),
		rate: operation("POST", "/general/swap/rate", "general"),
	},
	account: {
		balance: operation("GET", "/general/account/balance", "general"),
	},
	common: {
		prices: operation("GET", "/common/prices", "none"),
		currencies: operation("GET", "/common/currencies", "none"),
		fiats: operation("GET", "/common/fiats", "none"),
		networks: operation("GET", "/common/networks", "none"),
		monitor: operation("GET", "/common/monitor", "none"),
	},
} as const satisfies Record<string, Record<string, OxaPayOperation>>;

export type OxaPayRoutes = typeof routes;
