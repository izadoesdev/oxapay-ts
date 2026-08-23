import type { OxaPayAuthScope, OxaPayErrorBody, OxaPayHttpMethod, OxaPayResponse } from "./types.js";

export interface OxaPayRequestMetadata {
	method: OxaPayHttpMethod;
	url: string;
	auth: OxaPayAuthScope;
}

export class OxaPayError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = new.target.name;
		this.cause = options?.cause;
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
		};
	}
}

export class OxaPayConfigurationError extends OxaPayError {}

export class OxaPayNetworkError extends OxaPayError {
	readonly request: OxaPayRequestMetadata;

	constructor(message: string, request: OxaPayRequestMetadata, options?: { cause?: unknown }) {
		super(message, options);
		this.request = request;
	}

	override toJSON(): Record<string, unknown> {
		return { ...super.toJSON(), request: this.request };
	}
}

/** The caller aborted the request before it completed. */
export class OxaPayAbortError extends OxaPayNetworkError {
	readonly reason: unknown;

	constructor(request: OxaPayRequestMetadata, reason: unknown) {
		super("OxaPay request was aborted", request, { cause: reason });
		this.reason = reason;
	}
}

export class OxaPayTimeoutError extends OxaPayNetworkError {
	readonly timeoutMs: number;

	constructor(timeoutMs: number, request: OxaPayRequestMetadata, options?: { cause?: unknown }) {
		super(`OxaPay request timed out after ${timeoutMs}ms`, request, options);
		this.timeoutMs = timeoutMs;
	}

	override toJSON(): Record<string, unknown> {
		return { ...super.toJSON(), timeoutMs: this.timeoutMs };
	}
}

export class OxaPayResponseParseError extends OxaPayError {
	readonly request: OxaPayRequestMetadata;
	readonly status: number;

	constructor(message: string, request: OxaPayRequestMetadata, status: number, options?: { cause?: unknown }) {
		super(message, options);
		this.request = request;
		this.status = status;
	}

	override toJSON(): Record<string, unknown> {
		return { ...super.toJSON(), request: this.request, status: this.status };
	}
}

export interface OxaPayApiErrorOptions {
	status: number;
	request: OxaPayRequestMetadata;
	response: OxaPayResponse<unknown> | null;
	retryAfterMs?: number;
}

export class OxaPayApiError extends OxaPayError {
	readonly status: number;
	readonly request: OxaPayRequestMetadata;
	readonly response: OxaPayResponse<unknown> | null;
	readonly apiError: OxaPayErrorBody | null;
	readonly retryAfterMs?: number;

	constructor(message: string, options: OxaPayApiErrorOptions) {
		super(message);
		this.status = options.status;
		this.request = options.request;
		this.response = options.response;
		this.apiError = options.response?.error ?? null;
		if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
	}

	override toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			status: this.status,
			request: this.request,
			apiError: this.apiError,
			retryAfterMs: this.retryAfterMs,
		};
	}
}

export class OxaPayAuthenticationError extends OxaPayApiError {}
export class OxaPayValidationError extends OxaPayApiError {}
export class OxaPayNotFoundError extends OxaPayApiError {}
export class OxaPayRateLimitError extends OxaPayApiError {}
export class OxaPayServerError extends OxaPayApiError {}
export class OxaPayWebhookSignatureError extends OxaPayError {}
export class OxaPayWebhookParseError extends OxaPayError {}

export class OxaPayWebhookPayloadTooLargeError extends OxaPayError {
	readonly bodyLimit: number;

	constructor(bodyLimit: number, options?: { cause?: unknown }) {
		super(`OxaPay webhook payload exceeds the ${bodyLimit}-byte limit`, options);
		this.bodyLimit = bodyLimit;
	}

	override toJSON(): Record<string, unknown> {
		return { ...super.toJSON(), bodyLimit: this.bodyLimit };
	}
}
