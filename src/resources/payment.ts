import { OxaPayClient } from "../client.js";
import { routes } from "../routes.js";
import { withOxaPayBody, withOxaPayQuery } from "./options.js";
import type {
	CreateInvoiceInput,
	CreateStaticAddressInput,
	CreateWhiteLabelInput,
	Invoice,
	OxaPayPage,
	OxaPayRequestOptions,
	OxaPayResponse,
	OxaPayTrackId,
	Payment,
	PaymentHistoryQuery,
	PaymentStatistic,
	PaymentStatisticsQuery,
	RevokeStaticAddressInput,
	StaticAddress,
	StaticAddressListQuery,
	WhiteLabelPayment,
} from "../types.js";

/** Typed payment and merchant operations. */
export class PaymentResource {
	constructor(private readonly client: OxaPayClient) {}

	createInvoice(input: CreateInvoiceInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<Invoice>> {
		return this.client.request(routes.payment.createInvoice, withOxaPayBody(input, options));
	}

	createWhiteLabel(input: CreateWhiteLabelInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<WhiteLabelPayment>> {
		return this.client.request(routes.payment.createWhiteLabel, withOxaPayBody(input, options));
	}

	createStaticAddress(input: CreateStaticAddressInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<StaticAddress>> {
		return this.client.request(routes.payment.createStaticAddress, withOxaPayBody(input, options));
	}

	revokeStaticAddress(input: RevokeStaticAddressInput, options?: OxaPayRequestOptions): Promise<OxaPayResponse<Record<string, never>>> {
		return this.client.request(routes.payment.revokeStaticAddress, withOxaPayBody(input, options));
	}

	listStaticAddresses(
		query: StaticAddressListQuery = {},
		options?: OxaPayRequestOptions,
	): Promise<OxaPayResponse<OxaPayPage<StaticAddress>>> {
		return this.client.request(routes.payment.listStaticAddresses, withOxaPayQuery(query, options));
	}

	get(trackId: OxaPayTrackId, options?: OxaPayRequestOptions): Promise<OxaPayResponse<Payment>> {
		return this.client.request(routes.payment.get, { ...options, path: { trackId } });
	}

	list(query: PaymentHistoryQuery = {}, options?: OxaPayRequestOptions): Promise<OxaPayResponse<OxaPayPage<Payment>>> {
		return this.client.request(routes.payment.list, withOxaPayQuery(query, options));
	}

	statistics(
		query: PaymentStatisticsQuery = {},
		options?: OxaPayRequestOptions,
	): Promise<OxaPayResponse<OxaPayPage<PaymentStatistic>>> {
		return this.client.request(routes.payment.statistics, withOxaPayQuery(query, options));
	}

	acceptedCurrencies(options?: OxaPayRequestOptions): Promise<OxaPayResponse<{ list: string[] }>> {
		return this.client.request(routes.payment.acceptedCurrencies, options);
	}

	/** Lazily walks all payment-history pages using OxaPay's documented pagination metadata. */
	async *iterateHistory(query: PaymentHistoryQuery = {}, options?: OxaPayRequestOptions): AsyncGenerator<Payment> {
		let page = query.page ?? 1;
		while (true) {
			const response = await this.list({ ...query, page }, options);
			yield* response.data.list;
			if (page >= response.data.meta.lastPage) return;
			page += 1;
		}
	}

	/** Lazily walks all static-address pages using OxaPay's documented pagination metadata. */
	async *iterateStaticAddresses(query: StaticAddressListQuery = {}, options?: OxaPayRequestOptions): AsyncGenerator<StaticAddress> {
		let page = query.page ?? 1;
		while (true) {
			const response = await this.listStaticAddresses({ ...query, page }, options);
			yield* response.data.list;
			if (page >= response.data.meta.lastPage) return;
			page += 1;
		}
	}
}
