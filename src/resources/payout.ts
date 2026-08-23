import { OxaPayClient } from "../client.js";
import { routes } from "../routes.js";
import { withOxaPayBody, withOxaPayQuery } from "./options.js";
import type {
	CreatePayoutInput,
	OxaPayPage,
	OxaPayRequestOptions,
	OxaPayResponse,
	OxaPayTrackId,
	Payout,
	PayoutCreated,
	PayoutHistoryQuery,
} from "../types.js";

/** Typed payout operations. */
export class PayoutResource {
	constructor(private readonly client: OxaPayClient) {}

	create(input: CreatePayoutInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<PayoutCreated>> {
		return this.client.request(routes.payout.create, withOxaPayBody(input, options));
	}

	get(trackId: OxaPayTrackId, options?: OxaPayRequestOptions): Promise<OxaPayResponse<Payout>> {
		return this.client.request(routes.payout.get, { ...options, path: { trackId } });
	}

	list(query: PayoutHistoryQuery = {}, options?: OxaPayRequestOptions): Promise<OxaPayResponse<OxaPayPage<Payout>>> {
		return this.client.request(routes.payout.list, withOxaPayQuery(query, options));
	}

	async *iterateHistory(query: PayoutHistoryQuery = {}, options?: OxaPayRequestOptions): AsyncGenerator<Payout> {
		let page = query.page ?? 1;
		while (true) {
			const response = await this.list({ ...query, page }, options);
			yield* response.data.list;
			if (page >= response.data.meta.lastPage) return;
			page += 1;
		}
	}
}
