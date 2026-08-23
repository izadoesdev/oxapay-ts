import {
	OxaPayConfigurationError,
	OxaPayWebhookParseError,
	OxaPayWebhookPayloadTooLargeError,
	OxaPayWebhookSignatureError,
} from "./errors.js";
import { assertKnownOxaPayWebhookEvent } from "./webhooks.js";
import type {
	KnownOxaPayWebhookEvent,
	OxaPayRawBody,
	OxaPayWebhookSignatureOptions,
	OxaPayWebhookEvent,
	OxaPayWebhookEventValidation,
	VerifiedWebhook,
} from "./types.js";

const webhookTextHeaders = { "content-type": "text/plain; charset=utf-8" };
const defaultWebhookBodyLimit = 1_048_576;

/** The small verification surface framework adapters need from an OxaPay client. */
export interface OxaPayWebhookParser {
	parse<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
		rawBody: OxaPayRawBody,
		options: OxaPayWebhookSignatureOptions,
	): Promise<VerifiedWebhook<T>>;
}

/**
 * Receives a verified event in Fetch-compatible runtimes such as Next.js route handlers.
 * The original request body has already been consumed to verify its signature; use
 * `event.rawBody` when application code needs those exact bytes.
 */
export type OxaPayWebhookHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent> = (
	event: VerifiedWebhook<T>,
	request: Request,
) => Response | void | Promise<Response | void>;

/** A standard Fetch request handler for Next.js route handlers and edge runtimes. */
export type OxaPayFetchWebhookHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent> = (
	request: Request,
) => Promise<Response>;

/** Controls validation of the event payload after its HMAC is verified. */
export interface OxaPayWebhookValidationOptions {
	/**
	 * Defaults to `"known"`, which checks OxaPay's documented merchant and
	 * payout payload shapes. Use `"passthrough"` only when handling a future or
	 * custom event type with your own runtime validation.
	 */
	eventValidation?: OxaPayWebhookEventValidation;
}

/** Controls the maximum raw payload retained by Fetch-compatible webhook handlers. */
export interface OxaPayFetchWebhookOptions extends OxaPayWebhookValidationOptions {
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

function normalizedEventValidation(value: OxaPayWebhookEventValidation | undefined): OxaPayWebhookEventValidation {
	const eventValidation = value ?? "known";
	if (eventValidation !== "known" && eventValidation !== "passthrough") {
		throw new OxaPayConfigurationError('OxaPay webhook eventValidation must be "known" or "passthrough"');
	}
	return eventValidation;
}

async function parseWebhook<T extends OxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	rawBody: OxaPayRawBody,
	options: OxaPayWebhookSignatureOptions,
	eventValidation: OxaPayWebhookEventValidation,
): Promise<VerifiedWebhook<T>> {
	const event = await webhooks.parse<T>(rawBody, options);
	if (eventValidation === "known") {
		assertKnownOxaPayWebhookEvent(event as VerifiedWebhook<OxaPayWebhookEvent>);
	}
	return event;
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

/** Parses a verified standard Fetch request without exposing raw-body or header plumbing. */
export async function parseOxaPayFetchWebhookRequest<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	request: Request,
	options: OxaPayFetchWebhookOptions = {},
): Promise<VerifiedWebhook<T>> {
	const bodyLimit = normalizedBodyLimit(options.bodyLimit, "Fetch webhook bodyLimit");
	const eventValidation = normalizedEventValidation(options.eventValidation);
	const signature = request.headers.get("hmac");
	if (!signature) throw new OxaPayWebhookSignatureError("OxaPay webhook HMAC signature is missing");
	return parseWebhook<T>(
		webhooks,
		await rawBodyFromFetchRequest(request, bodyLimit),
		{ signature },
		eventValidation,
	);
}

async function handleOxaPayFetchWebhook<T extends OxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	request: Request,
	onEvent: OxaPayWebhookHandler<T>,
	options: OxaPayFetchWebhookOptions,
): Promise<Response> {
	let event: VerifiedWebhook<T>;
	try {
		event = await parseOxaPayFetchWebhookRequest<T>(webhooks, request, options);
	} catch (error) {
		const failureResponse = webhookFailureResponse(error);
		if (failureResponse) return failureResponse;
		throw error;
	}

	return (await onEvent(event, request)) ?? new Response("ok", { status: 200, headers: webhookTextHeaders });
}

/** Creates the zero-plumbing Fetch/Next.js webhook handler. */
export function createOxaPayFetchWebhookHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	onEvent: OxaPayWebhookHandler<T>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayFetchWebhookHandler<T> {
	const resolvedOptions: Required<OxaPayFetchWebhookOptions> = {
		bodyLimit: normalizedBodyLimit(options.bodyLimit, "Fetch webhook bodyLimit"),
		eventValidation: normalizedEventValidation(options.eventValidation),
	};
	return (request) => handleOxaPayFetchWebhook(webhooks, request, onEvent, resolvedOptions);
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
export type OxaPayExpressWebhookHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent> = (
	request: OxaPayExpressRequest,
	response: OxaPayExpressResponse,
	next: OxaPayExpressNext,
) => void | Promise<void>;

export type OxaPayExpressWebhookEventHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent> = (
	event: VerifiedWebhook<T>,
	request: OxaPayExpressRequest,
	response: OxaPayExpressResponse,
) => unknown | Promise<unknown>;

/** Controls runtime event validation for Express webhook middleware. */
export interface OxaPayExpressWebhookOptions extends OxaPayWebhookValidationOptions {}

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
export function createOxaPayExpressWebhookHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	onEvent: OxaPayExpressWebhookEventHandler<T>,
	options: OxaPayExpressWebhookOptions = {},
): OxaPayExpressWebhookHandler<T> {
	const eventValidation = normalizedEventValidation(options.eventValidation);
	return async (request, response, next) => {
		let event: VerifiedWebhook<T>;
		try {
			event = await parseWebhook<T>(
				webhooks,
				rawBodyFromExpressRequest(request),
				{ signature: headerFromExpressRequest(request) },
				eventValidation,
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

export type OxaPayFastifyWebhookEventHandler<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent> = (
	event: VerifiedWebhook<T>,
	request: OxaPayFastifyRequest,
	reply: OxaPayFastifyReply,
) => unknown | Promise<unknown>;

export interface OxaPayFastifyWebhookOptions<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>
	extends OxaPayWebhookValidationOptions {
	path: string;
	handler: OxaPayFastifyWebhookEventHandler<T>;
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
export function createOxaPayFastifyWebhookPlugin<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>(
	webhooks: OxaPayWebhookParser,
	options: OxaPayFastifyWebhookOptions<T>,
): OxaPayFastifyWebhookPlugin {
	const bodyLimit = normalizedBodyLimit(options.bodyLimit, "Fastify webhook bodyLimit");
	const eventValidation = normalizedEventValidation(options.eventValidation);

	return (fastify) => {
		fastify.addContentTypeParser(
			"application/json",
			{ parseAs: "buffer", bodyLimit },
			(_request, body, done) => done(null, body),
		);
		fastify.post(options.path, async (request, reply) => {
			let event: VerifiedWebhook<T>;
			try {
				event = await parseWebhook<T>(
					webhooks,
					rawBodyFromValue(request.body, "OxaPay Fastify webhook plugin"),
					{ signature: headerFromHeaders(request.headers, "hmac") },
					eventValidation,
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

export type OxaPayHonoWebhookEventHandler<
	T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent,
	Context extends OxaPayHonoContext = OxaPayHonoContext,
> = (event: VerifiedWebhook<T>, context: Context) => Response | void | Promise<Response | void>;

export type OxaPayHonoWebhookHandler<Context extends OxaPayHonoContext = OxaPayHonoContext> = (
	context: Context,
) => Promise<Response>;

/** Creates a Hono handler backed by the same Fetch-native verification flow. */
export function createOxaPayHonoWebhookHandler<
	T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent,
	Context extends OxaPayHonoContext = OxaPayHonoContext,
>(
	webhooks: OxaPayWebhookParser,
	onEvent: OxaPayHonoWebhookEventHandler<T, Context>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayHonoWebhookHandler<Context> {
	const resolvedOptions: Required<OxaPayFetchWebhookOptions> = {
		bodyLimit: normalizedBodyLimit(options.bodyLimit, "Hono webhook bodyLimit"),
		eventValidation: normalizedEventValidation(options.eventValidation),
	};
	return async (context) => {
		return handleOxaPayFetchWebhook<T>(webhooks, context.req.raw, (event) => onEvent(event, context), resolvedOptions);
	};
}
