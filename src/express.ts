import { OxaPayConfigurationError } from "./errors.js";
import type { OxaPay } from "./oxapay.js";
import { createOxaPayExpressWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayExpressWebhookEventHandler,
	OxaPayExpressWebhookHandler,
} from "./webhook-adapters.js";

const defaultBodyLimit = 1_048_576;

export interface ExpressRawBodyOptions {
	type: "application/json";
	inflate: false;
	limit: number;
}

export interface ExpressRawBodyOptionsInput {
	/** Maximum raw request size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
}

/**
 * Returns the security-sensitive options for Express's route-local raw parser.
 *
 * ```ts
 * app.post("/webhooks/oxapay", express.raw(rawBodyOptions()), handler);
 * ```
 */
export function rawBodyOptions(options: ExpressRawBodyOptionsInput = {}): ExpressRawBodyOptions {
	const bodyLimit = options.bodyLimit ?? defaultBodyLimit;
	if (!Number.isSafeInteger(bodyLimit) || bodyLimit < 1) {
		throw new OxaPayConfigurationError("Express webhook bodyLimit must be a positive, finite integer");
	}
	return { type: "application/json", inflate: false, limit: bodyLimit };
}

/** Creates Express/Connect middleware for a route configured with {@link rawBodyOptions}. */
export function createWebhookHandler(
	oxapay: OxaPay,
	onEvent: OxaPayExpressWebhookEventHandler,
): OxaPayExpressWebhookHandler {
	return createOxaPayExpressWebhookHandler(
		() => oxapay.client.getWebhookCredentials(),
		onEvent,
	);
}

export type {
	OxaPayExpressNext as ExpressNext,
	OxaPayExpressRequest as ExpressRequest,
	OxaPayExpressResponse as ExpressResponse,
	OxaPayExpressWebhookEventHandler as ExpressWebhookEventHandler,
	OxaPayExpressWebhookHandler as ExpressWebhookHandler,
} from "./webhook-adapters.js";
