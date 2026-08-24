import type { OxaPay } from "./oxapay.js";
import { createOxaPayFetchWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayFetchWebhookHandler,
	OxaPayFetchWebhookOptions,
	OxaPayWebhookHandler,
} from "./webhook-adapters.js";

/**
 * Creates a verified webhook handler for Fetch-compatible runtimes.
 *
 * Use this directly in Remix, SvelteKit, and standard Fetch endpoints. For
 * Next.js App Router, import the same helper from `oxapay-ts/nextjs`.
 */
export function createWebhookHandler(
	oxapay: OxaPay,
	onEvent: OxaPayWebhookHandler,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayFetchWebhookHandler {
	return createOxaPayFetchWebhookHandler(
		() => oxapay.client.getWebhookCredentials(),
		onEvent,
		options,
	);
}

export type {
	OxaPayFetchWebhookHandler as FetchWebhookHandler,
	OxaPayFetchWebhookOptions as FetchWebhookOptions,
	OxaPayWebhookHandler as FetchWebhookEventHandler,
} from "./webhook-adapters.js";
