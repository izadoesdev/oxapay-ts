/** Next.js App Router's webhook adapter. */
export { createWebhookHandler } from "./fetch.js";
export type {
	FetchWebhookEventHandler as NextjsWebhookEventHandler,
	FetchWebhookHandler as NextjsWebhookHandler,
	FetchWebhookOptions as NextjsWebhookOptions,
} from "./fetch.js";
