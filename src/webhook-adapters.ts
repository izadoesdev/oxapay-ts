import {
	OxaPayConfigurationError,
	OxaPayWebhookParseError,
	OxaPayWebhookPayloadTooLargeError,
	OxaPayWebhookSignatureError,
} from "./errors.js";
import { parseAndVerifyKnownWebhook } from "./webhooks.js";
import type {
	KnownOxaPayWebhookEvent,
	OxaPayRawBody,
	OxaPayWebhookCredentials,
	VerifiedWebhook,
} from "./types.js";

const webhookTextHeaders = { "content-type": "text/plain; charset=utf-8" };
const defaultWebhookBodyLimit = 1_048_576;

type WebhookCredentials = () => Promise<OxaPayWebhookCredentials>;

/**
 * Receives a verified event in Fetch-compatible runtimes such as Next.js route handlers.
 * The original request body has already been consumed to verify its signature; use
 * `event.rawBody` when application code needs those exact bytes.
 */
export type OxaPayWebhookHandler = (
	event: VerifiedWebhook<KnownOxaPayWebhookEvent>,
	request: Request,
) => Response | void | Promise<Response | void>;

/** A standard Fetch request handler for Next.js route handlers and edge runtimes. */
export type OxaPayFetchWebhookHandler = (request: Request) => Promise<Response>;

/** Controls the maximum raw payload retained by Fetch-compatible webhook handlers. */
export interface OxaPayFetchWebhookOptions {
	/** Maximum payload size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
}

function isRejectedWebhook(error: unknown): error is OxaPayWebhookSignatureError | OxaPayWebhookParseError {
	return error instanceof OxaPayWebhookSignatureError || error instanceof OxaPayWebhookParseError;
}

function invalidWebhookResponse(): Response {
	return new Response("Invalid OxaPay webhook", { status: 400, headers: webhookTextHeaders });
}

function payloadTooLargeResponse(): Response {
	return new Response("OxaPay webhook payload is too large", { status: 413, headers: webhookTextHeaders });
}

function webhookFailureResponse(error: unknown): Response | undefined {
	if (isRejectedWebhook(error)) return invalidWebhookResponse();
	if (error instanceof OxaPayWebhookPayloadTooLargeError) return payloadTooLargeResponse();
	return undefined;
}

function normalizedBodyLimit(value: number | undefined, name: string): number {
	const bodyLimit = value ?? defaultWebhookBodyLimit;
	if (!Number.isSafeInteger(bodyLimit) || bodyLimit < 1) {
		throw new OxaPayConfigurationError(`${name} must be a positive, finite integer`);
	}
	return bodyLimit;
}

async function parseKnownWebhook(
	getCredentials: WebhookCredentials,
	rawBody: OxaPayRawBody,
	signature: string | null | undefined,
): Promise<VerifiedWebhook<KnownOxaPayWebhookEvent>> {
	return parseAndVerifyKnownWebhook(rawBody, { ...(await getCredentials()), signature });
}

function declaredContentLength(request: Request): number | undefined {
	const value = request.headers.get("content-length");
	if (!value) return undefined;
	const length = Number(value);
	return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

async function rawBodyFromFetchRequest(request: Request, bodyLimit: number): Promise<ArrayBuffer> {
	if (request.bodyUsed) {
		throw new OxaPayConfigurationError(
			"OxaPay webhook handling needs an unread Request body. Do not call request.json(), request.text(), or request.arrayBuffer() before the webhook handler.",
		);
	}
	if ((declaredContentLength(request) ?? 0) > bodyLimit) throw new OxaPayWebhookPayloadTooLargeError(bodyLimit);
	if (!request.body) return new ArrayBuffer(0);

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > bodyLimit) {
				await reader.cancel().catch(() => undefined);
				throw new OxaPayWebhookPayloadTooLargeError(bodyLimit);
			}
			chunks.push(value);
		}

		const bytes = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return bytes.buffer;
	} catch (cause) {
		if (cause instanceof OxaPayWebhookPayloadTooLargeError || cause instanceof OxaPayConfigurationError) throw cause;
		throw new OxaPayConfigurationError(
			"OxaPay webhook handling needs an unread Request body. Do not call request.json(), request.text(), or request.arrayBuffer() before the webhook handler.",
			{ cause },
		);
	} finally {
		reader.releaseLock();
	}
}

async function parseFetchWebhookRequest(
	getCredentials: WebhookCredentials,
	request: Request,
	bodyLimit: number,
): Promise<VerifiedWebhook<KnownOxaPayWebhookEvent>> {
	const signature = request.headers.get("hmac");
	if (!signature) throw new OxaPayWebhookSignatureError("OxaPay webhook HMAC signature is missing");
	return parseKnownWebhook(getCredentials, await rawBodyFromFetchRequest(request, bodyLimit), signature);
}

async function handleOxaPayFetchWebhook(
	getCredentials: WebhookCredentials,
	request: Request,
	onEvent: OxaPayWebhookHandler,
	bodyLimit: number,
): Promise<Response> {
	let event: VerifiedWebhook<KnownOxaPayWebhookEvent>;
	try {
		event = await parseFetchWebhookRequest(getCredentials, request, bodyLimit);
	} catch (error) {
		const failureResponse = webhookFailureResponse(error);
		if (failureResponse) return failureResponse;
		throw error;
	}

	return (await onEvent(event, request)) ?? new Response("ok", { status: 200, headers: webhookTextHeaders });
}

/** Creates the zero-plumbing Fetch/Next.js webhook handler. */
export function createOxaPayFetchWebhookHandler(
	getCredentials: WebhookCredentials,
	onEvent: OxaPayWebhookHandler,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayFetchWebhookHandler {
	const bodyLimit = normalizedBodyLimit(options.bodyLimit, "Fetch webhook bodyLimit");
	return (request) => handleOxaPayFetchWebhook(getCredentials, request, onEvent, bodyLimit);
}

type OxaPayNodeHeaders = Record<string, string | readonly string[] | undefined>;

function headerFromHeaders(headers: OxaPayNodeHeaders | undefined, expectedName: string): string | null {
	if (!headers) return null;
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() !== expectedName) continue;
		if (typeof value === "string") return value;
		if (Array.isArray(value) && value.length === 1) return value[0] ?? null;
		return null;
	}
	return null;
}

function rawBodyFromValue(value: unknown, framework: string): OxaPayRawBody {
	if (value instanceof ArrayBuffer || value instanceof Uint8Array) return value;
	throw new OxaPayConfigurationError(`${framework} must provide the untouched webhook bytes, not a parsed JSON object.`);
}

/** Structural subset of Express's request object; no Express runtime dependency is required. */
export interface OxaPayExpressRequest {
	body?: unknown;
	rawBody?: unknown;
	headers?: OxaPayNodeHeaders;
	get?: (name: string) => string | undefined;
}

/** Structural subset of Express's response object; no Express runtime dependency is required. */
export interface OxaPayExpressResponse {
	headersSent?: boolean;
	writableEnded?: boolean;
	status?: (statusCode: number) => OxaPayExpressResponse;
	type?: (contentType: string) => OxaPayExpressResponse;
	send?: (body?: unknown) => unknown;
	statusCode?: number;
	setHeader?: (name: string, value: string) => unknown;
	end?: (body?: unknown) => unknown;
}

export type OxaPayExpressNext = (error?: unknown) => void;

/** A request handler that is structurally compatible with Express and Connect middleware. */
export type OxaPayExpressWebhookHandler = (
	request: OxaPayExpressRequest,
	response: OxaPayExpressResponse,
	next: OxaPayExpressNext,
) => void | Promise<void>;

export type OxaPayExpressWebhookEventHandler = (
	event: VerifiedWebhook<KnownOxaPayWebhookEvent>,
	request: OxaPayExpressRequest,
	response: OxaPayExpressResponse,
) => unknown | Promise<unknown>;

function headerFromExpressRequest(request: OxaPayExpressRequest): string | null {
	const fromGetter = request.get?.("hmac");
	return fromGetter === undefined ? headerFromHeaders(request.headers, "hmac") : fromGetter;
}

function rawBodyFromExpressRequest(request: OxaPayExpressRequest): OxaPayRawBody {
	try {
		return rawBodyFromValue(request.rawBody ?? request.body, "OxaPay Express webhook middleware");
	} catch (cause) {
		throw new OxaPayConfigurationError(
			'OxaPay Express webhook middleware needs express.raw({ type: "application/json", inflate: false }) on this route before express.json().',
			{ cause },
		);
	}
}

function isExpressResponseFinished(response: OxaPayExpressResponse): boolean {
	return Boolean(response.headersSent || response.writableEnded);
}

function sendExpressText(response: OxaPayExpressResponse, statusCode: number, body: string): void {
	if (isExpressResponseFinished(response)) return;
	const target = response.status?.(statusCode) ?? response;
	target.type?.("text/plain");
	if (target.send) {
		target.send(body);
		return;
	}

	response.statusCode = statusCode;
	response.setHeader?.("content-type", "text/plain; charset=utf-8");
	if (response.end) {
		response.end(body);
		return;
	}

	throw new OxaPayConfigurationError("Express webhook middleware needs a response with status().send() or end().");
}

/**
 * Creates an Express/Connect handler. Mount `express.raw()` for this route before
 * `express.json()` so the adapter receives the exact signed bytes.
 */
export function createOxaPayExpressWebhookHandler(
	getCredentials: WebhookCredentials,
	onEvent: OxaPayExpressWebhookEventHandler,
): OxaPayExpressWebhookHandler {
	return async (request, response, next) => {
		let event: VerifiedWebhook<KnownOxaPayWebhookEvent>;
		try {
			event = await parseKnownWebhook(
				getCredentials,
				rawBodyFromExpressRequest(request),
				headerFromExpressRequest(request),
			);
		} catch (error) {
			if (isRejectedWebhook(error)) {
				sendExpressText(response, 400, "Invalid OxaPay webhook");
				return;
			}
			next(error);
			return;
		}

		try {
			await onEvent(event, request, response);
		} catch (error) {
			next(error);
			return;
		}

		if (!isExpressResponseFinished(response)) sendExpressText(response, 200, "ok");
	};
}

/** Structural subset of Fastify's request object; no Fastify runtime dependency is required. */
export interface OxaPayFastifyRequest {
	headers: OxaPayNodeHeaders;
	body?: unknown;
}

/** Structural subset of Fastify's reply object; no Fastify runtime dependency is required. */
export interface OxaPayFastifyReply {
	sent?: boolean;
	code(statusCode: number): OxaPayFastifyReply;
	type(contentType: string): OxaPayFastifyReply;
	send(body?: unknown): unknown;
}

type OxaPayFastifyContentTypeParser = (
	request: OxaPayFastifyRequest,
	body: Uint8Array,
	done: (error: Error | null, body?: unknown) => void,
) => void;

/** Structural Fastify instance required by the scoped raw-body plugin. */
export interface OxaPayFastifyInstance {
	addContentTypeParser(
		contentType: string,
		options: { parseAs: "buffer"; bodyLimit: number },
		parser: OxaPayFastifyContentTypeParser,
	): unknown;
	post(
		path: string,
		handler: (request: OxaPayFastifyRequest, reply: OxaPayFastifyReply) => unknown,
	): unknown;
}

export type OxaPayFastifyWebhookEventHandler = (
	event: VerifiedWebhook<KnownOxaPayWebhookEvent>,
	request: OxaPayFastifyRequest,
	reply: OxaPayFastifyReply,
) => unknown | Promise<unknown>;

export interface OxaPayFastifyWebhookOptions {
	path: string;
	handler: OxaPayFastifyWebhookEventHandler;
	bodyLimit?: number;
}

/** A Fastify plugin that scopes raw JSON parsing to its webhook route only. */
export type OxaPayFastifyWebhookPlugin = (fastify: OxaPayFastifyInstance) => void;

function sendFastifyText(reply: OxaPayFastifyReply, statusCode: number, body: string): unknown {
	return reply.code(statusCode).type("text/plain").send(body);
}

/**
 * Creates an encapsulated Fastify plugin. It changes JSON parsing only for this
 * route, leaving the application's normal JSON parser untouched.
 */
export function createOxaPayFastifyWebhookPlugin(
	getCredentials: WebhookCredentials,
	options: OxaPayFastifyWebhookOptions,
): OxaPayFastifyWebhookPlugin {
	const bodyLimit = normalizedBodyLimit(options.bodyLimit, "Fastify webhook bodyLimit");

	return (fastify) => {
		fastify.addContentTypeParser(
			"application/json",
			{ parseAs: "buffer", bodyLimit },
			(_request, body, done) => done(null, body),
		);
		fastify.post(options.path, async (request, reply) => {
			let event: VerifiedWebhook<KnownOxaPayWebhookEvent>;
			try {
				event = await parseKnownWebhook(
					getCredentials,
					rawBodyFromValue(request.body, "OxaPay Fastify webhook plugin"),
					headerFromHeaders(request.headers, "hmac"),
				);
			} catch (error) {
				if (isRejectedWebhook(error)) return sendFastifyText(reply, 400, "Invalid OxaPay webhook");
				throw error;
			}

			const result = await options.handler(event, request, reply);
			if (reply.sent) return result;
			if (result !== undefined) return result;
			return sendFastifyText(reply, 200, "ok");
		});
	};
}

/** Structural subset of a Hono context; no Hono runtime dependency is required. */
export interface OxaPayHonoContext {
	readonly req: { readonly raw: Request };
}

export type OxaPayHonoWebhookEventHandler<Context extends OxaPayHonoContext = OxaPayHonoContext> = (
	event: VerifiedWebhook<KnownOxaPayWebhookEvent>,
	context: Context,
) => Response | void | Promise<Response | void>;

export type OxaPayHonoWebhookHandler<Context extends OxaPayHonoContext = OxaPayHonoContext> = (
	context: Context,
) => Promise<Response>;

/** Creates a Hono handler backed by the same Fetch-native verification flow. */
export function createOxaPayHonoWebhookHandler<Context extends OxaPayHonoContext = OxaPayHonoContext>(
	getCredentials: WebhookCredentials,
	onEvent: OxaPayHonoWebhookEventHandler<Context>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayHonoWebhookHandler<Context> {
	const bodyLimit = normalizedBodyLimit(options.bodyLimit, "Hono webhook bodyLimit");
	return async (context) => handleOxaPayFetchWebhook(
		getCredentials,
		context.req.raw,
		(event) => onEvent(event, context),
		bodyLimit,
	);
}
