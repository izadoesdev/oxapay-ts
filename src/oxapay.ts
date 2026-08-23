import { OxaPayClient } from "./client.js";
import { AccountResource } from "./resources/account.js";
import { CommonResource } from "./resources/common.js";
import { PaymentResource } from "./resources/payment.js";
import { PayoutResource } from "./resources/payout.js";
import { SwapResource } from "./resources/swap.js";
import type { OxaPayCredentials, OxaPayOptions } from "./types.js";
import { OxaPayWebhooks } from "./webhooks.js";

/**
 * The cohesive OxaPay SDK facade. It owns no global state: create one per
 * credential set, or use {@link withCredentials} for a tenant-specific view.
 */
export class OxaPay {
	readonly client: OxaPayClient;
	readonly payment: PaymentResource;
	readonly payout: PayoutResource;
	readonly swap: SwapResource;
	readonly account: AccountResource;
	readonly common: CommonResource;
	readonly webhooks: OxaPayWebhooks;

	constructor(options: OxaPayOptions | OxaPayClient = {}) {
		this.client = options instanceof OxaPayClient ? options : new OxaPayClient(options);
		this.payment = new PaymentResource(this.client);
		this.payout = new PayoutResource(this.client);
		this.swap = new SwapResource(this.client);
		this.account = new AccountResource(this.client);
		this.common = new CommonResource(this.client);
		this.webhooks = new OxaPayWebhooks(this.client);
	}

	/** Creates a client view with replacement credentials and shared transport, hooks, timeout, and retry configuration. */
	withCredentials(credentials: OxaPayCredentials): OxaPay {
		return new OxaPay(this.client.withCredentials(credentials));
	}
}
