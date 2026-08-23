import { OxaPayConfigurationError } from "./errors.js";
import type { OxaPay } from "./oxapay.js";
import { createOxaPayExpressWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayExpressWebhookOptions,
	OxaPayExpressWebhookEventHandler,
	OxaPayExpressWebhookHandler,
} from "./webhook-adapters.js";
import type { KnownOxaPayWebhookEvent, OxaPayWebhookEvent } from "./types.js";

const defaultBodyLimit = 1_048_576;

type KnownExpressWebhookOptions = OxaPayExpressWebhookOptions & { eventValidation?: "known" };
type PassthroughExpressWebhookOptions = OxaPayExpressWebhookOptions & { eventValidation: "passthrough" };

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
	onEvent: OxaPayExpressWebhookEventHandler<KnownOxaPayWebhookEvent>,
	options?: KnownExpressWebhookOptions,
): OxaPayExpressWebhookHandler<KnownOxaPayWebhookEvent>;
/** Receives a valid signed event without documented-shape validation. Validate custom payloads before trusting them. */
export function createWebhookHandler<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
	oxapay: OxaPay,
	onEvent: OxaPayExpressWebhookEventHandler<T>,
	options: PassthroughExpressWebhookOptions,
): OxaPayExpressWebhookHandler<T>;
export function createWebhookHandler(
	oxapay: OxaPay,
	onEvent: OxaPayExpressWebhookEventHandler<never>,
	options: OxaPayExpressWebhookOptions = {},
): OxaPayExpressWebhookHandler<never> {
	return createOxaPayExpressWebhookHandler(
		oxapay.webhooks,
		onEvent as OxaPayExpressWebhookEventHandler<OxaPayWebhookEvent>,
		options,
	) as OxaPayExpressWebhookHandler<never>;
}

export type {
	OxaPayExpressNext as ExpressNext,
	OxaPayExpressRequest as ExpressRequest,
	OxaPayExpressResponse as ExpressResponse,
	OxaPayExpressWebhookOptions as ExpressWebhookOptions,
	OxaPayExpressWebhookEventHandler as ExpressWebhookEventHandler,
	OxaPayExpressWebhookHandler as ExpressWebhookHandler,
} from "./webhook-adapters.js";
