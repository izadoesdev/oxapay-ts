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
}
