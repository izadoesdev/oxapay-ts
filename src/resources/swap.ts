import { OxaPayClient } from "../client.js";
import { routes } from "../routes.js";
import { withOxaPayBody, withOxaPayQuery } from "./options.js";
import type {
	CreateSwapInput,
	OxaPayPage,
	OxaPayRequestOptions,
	OxaPayResponse,
	Swap,
	SwapHistoryQuery,
	SwapPair,
	SwapQuote,
	SwapRate,
	SwapRateInput,
} from "../types.js";

/** Typed conversion and swap operations. */
export class SwapResource {
	constructor(private readonly client: OxaPayClient) {}

	create(input: CreateSwapInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<Swap>> {
		return this.client.request(routes.swap.create, withOxaPayBody(input, options));
	}

	list(query: SwapHistoryQuery = {}, options?: OxaPayRequestOptions): Promise<OxaPayResponse<OxaPayPage<Swap>>> {
		return this.client.request(routes.swap.list, withOxaPayQuery(query, options));
	}

	pairs(options?: OxaPayRequestOptions): Promise<OxaPayResponse<{ list: SwapPair[] }>> {
		return this.client.request(routes.swap.pairs, options);
	}

	calculate(input: CreateSwapInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<SwapQuote>> {
		return this.client.request(routes.swap.calculate, withOxaPayBody(input, options));
	}

	rate(input: SwapRateInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<SwapRate>> {
		return this.client.request(routes.swap.rate, withOxaPayBody(input, options));
	}
}
