import { OxaPayClient } from "../client.js";
import { routes } from "../routes.js";
import type { AccountBalances, OxaPayCurrency, OxaPayRequestOptions, OxaPayResponse } from "../types.js";
import { withOxaPayQuery } from "./options.js";

/** Account operations that require the General API key. */
export class AccountResource {
	constructor(private readonly client: OxaPayClient) {}

	balance(options?: OxaPayRequestOptions): Promise<OxaPayResponse<AccountBalances>>;
	balance(currency: OxaPayCurrency, options?: OxaPayRequestOptions): Promise<OxaPayResponse<AccountBalances>>;
	/** @deprecated Pass options as the first argument when no currency is needed. */
	balance(currency: undefined, options?: OxaPayRequestOptions): Promise<OxaPayResponse<AccountBalances>>;
	balance(
		currencyOrOptions?: OxaPayCurrency | OxaPayRequestOptions,
		options?: OxaPayRequestOptions,
	): Promise<OxaPayResponse<AccountBalances>> {
		if (typeof currencyOrOptions !== "string") {
			return this.client.request(routes.account.balance, currencyOrOptions ?? options);
		}
		return this.client.request(routes.account.balance, withOxaPayQuery({ currency: currencyOrOptions }, options));
	}
}
