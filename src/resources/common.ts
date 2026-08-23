import { OxaPayClient } from "../client.js";
import { routes } from "../routes.js";
import type {
	CurrencyPrices,
	FiatCurrencies,
	OxaPayRequestOptions,
	OxaPayResponse,
	SupportedCurrencies,
	SystemStatus,
} from "../types.js";

/** Public OxaPay metadata and monitoring operations; no API key is required. */
export class CommonResource {
	constructor(private readonly client: OxaPayClient) {}

	prices(options?: OxaPayRequestOptions): Promise<OxaPayResponse<CurrencyPrices>> {
		return this.client.request(routes.common.prices, options);
	}

	currencies(options?: OxaPayRequestOptions): Promise<OxaPayResponse<SupportedCurrencies>> {
		return this.client.request(routes.common.currencies, options);
	}

	fiats(options?: OxaPayRequestOptions): Promise<OxaPayResponse<FiatCurrencies>> {
		return this.client.request(routes.common.fiats, options);
	}

	networks(options?: OxaPayRequestOptions): Promise<OxaPayResponse<{ list: string[] }>> {
		return this.client.request(routes.common.networks, options);
	}

	monitor(options?: OxaPayRequestOptions): Promise<OxaPayResponse<SystemStatus>> {
		return this.client.request(routes.common.monitor, options);
	}
}
