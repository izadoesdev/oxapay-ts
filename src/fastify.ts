import type { OxaPay } from "./oxapay.js";
import { createOxaPayFastifyWebhookPlugin } from "./webhook-adapters.js";
import type {
	OxaPayFastifyWebhookEventHandler,
	OxaPayFastifyWebhookPlugin,
} from "./webhook-adapters.js";

export interface FastifyWebhookOptions {
	path: string;
	onEvent: OxaPayFastifyWebhookEventHandler;
	/** Maximum raw request size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
}

/** Creates the scoped Fastify plugin for one OxaPay webhook route. */
export function createWebhookPlugin(
	oxapay: OxaPay,
	options: FastifyWebhookOptions,
): OxaPayFastifyWebhookPlugin {
	const { onEvent, ...pluginOptions } = options;
	return createOxaPayFastifyWebhookPlugin(() => oxapay.client.getWebhookCredentials(), {
		...pluginOptions,
		handler: onEvent,
	});
}

export type {
	OxaPayFastifyInstance as FastifyInstance,
	OxaPayFastifyReply as FastifyReply,
	OxaPayFastifyRequest as FastifyRequest,
	OxaPayFastifyWebhookEventHandler as FastifyWebhookEventHandler,
	OxaPayFastifyWebhookPlugin as FastifyWebhookPlugin,
} from "./webhook-adapters.js";
