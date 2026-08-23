import {
	OxaPayAbortError,
	OxaPayApiError,
	OxaPayAuthenticationError,
	OxaPayConfigurationError,
	OxaPayNetworkError,
	OxaPayNotFoundError,
	OxaPayRateLimitError,
	OxaPayResponseParseError,
	OxaPayServerError,
	OxaPayTimeoutError,
	OxaPayValidationError,
	type OxaPayApiErrorOptions,
	type OxaPayRequestMetadata,
} from "./errors.js";
import { appendQuery, assertFiniteNumbers, decodeOxaPayValue, encodeOxaPayValue, fillPath, isRecord } from "./codecs.js";
import type {
	OxaPayApiKey,
	OxaPayAuthScope,
	OxaPayCredentials,
	OxaPayOperation,
	OxaPayOperationRequest,
	OxaPayOptions,
	OxaPayResponse,
	OxaPayRetryOptions,
	OxaPayWebhookCredentials,
} from "./types.js";

export const OXAPAY_DEFAULT_BASE_URL = "https://api.oxapay.com/v1";

const defaultRetry: Required<Pick<OxaPayRetryOptions, "maxAttempts" | "initialDelayMs" | "maxDelayMs">> = {
	maxAttempts: 3,
	initialDelayMs: 250,
	maxDelayMs: 5_000,
};
const maxTimerDelayMs = 2_147_483_647;
const apiKeyHeaderNames = ["merchant_api_key", "payout_api_key", "general_api_key"] as const;

interface ResolvedRetry {
	maxAttempts: number;
	initialDelayMs: number;
	maxDelayMs: number;
}

interface AbortControl {
	signal: AbortSignal | undefined;
	timedOut(): boolean;
	cleanup(): void;
}

function createAbortControl(parent: AbortSignal | undefined, timeoutMs: number | undefined): AbortControl {
	if (timeoutMs === undefined) {
		return { signal: parent, timedOut: () => false, cleanup: () => undefined };
	}

	const controller = new AbortController();
	let timedOut = false;
	const abortFromParent = () => controller.abort(parent?.reason);
	if (parent) {
		if (parent.aborted) abortFromParent();
		else parent.addEventListener("abort", abortFromParent, { once: true });
	}
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	return {
		signal: controller.signal,
		timedOut: () => timedOut,
		cleanup: () => {
			clearTimeout(timer);
			parent?.removeEventListener("abort", abortFromParent);
		},
	};
}

function normalizeBaseUrl(baseUrl: string): string {
	const normalized = baseUrl.replace(/\/+$/, "");
	let parsed: URL;
	try {
		parsed = new URL(normalized);
	} catch (cause) {
		throw new OxaPayConfigurationError("baseUrl must be an absolute URL", { cause });
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new OxaPayConfigurationError("baseUrl must use http or https");
	}
	if (parsed.username || parsed.password) {
		throw new OxaPayConfigurationError("baseUrl must not contain credentials");
	}
	if (parsed.search || parsed.hash) {
		throw new OxaPayConfigurationError("baseUrl must not contain query parameters or a fragment");
	}
	return normalized;
}

function retryPolicy(
	method: OxaPayOperation["method"],
	override: OxaPayOperationRequest["retry"],
	defaults: OxaPayOptions["retry"],
): ResolvedRetry | null {
	const policy = override ?? defaults ?? {};
	if (policy === false) return null;
	const maxAttempts = positiveSafeInteger(policy.maxAttempts ?? defaultRetry.maxAttempts, "retry.maxAttempts");
	const initialDelayMs = nonNegativeFinite(policy.initialDelayMs ?? defaultRetry.initialDelayMs, "retry.initialDelayMs");
	const maxDelayMs = nonNegativeFinite(policy.maxDelayMs ?? defaultRetry.maxDelayMs, "retry.maxDelayMs");
	if (method === "POST" && !policy.retryUnsafeRequests) return null;

	return { maxAttempts, initialDelayMs, maxDelayMs };
}

function positiveSafeInteger(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new OxaPayConfigurationError(`${name} must be a positive, finite integer`);
	}
	return value;
}

function nonNegativeFinite(value: number, name: string): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new OxaPayConfigurationError(`${name} must be a finite, non-negative number`);
	}
	return value;
}

function normalizeTimeoutMs(value: number | undefined, name: string): number | undefined {
	if (value === undefined || value === 0) return undefined;
	if (!Number.isSafeInteger(value) || value < 0 || value > maxTimerDelayMs) {
		throw new OxaPayConfigurationError(`${name} must be 0 or a positive integer no greater than ${maxTimerDelayMs}`);
	}
	return value;
}

function retryAfterMs(headers: Headers): number | undefined {
	const value = headers.get("retry-after");
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
	const date = Date.parse(value);
	if (Number.isNaN(date)) return undefined;
	return Math.max(0, date - Date.now());
}

function retryDelay(attempt: number, policy: Pick<ResolvedRetry, "initialDelayMs" | "maxDelayMs">, headers?: Headers): number {
	const retryAfter = headers ? retryAfterMs(headers) : undefined;
	if (retryAfter !== undefined) return retryAfter;
	return Math.min(policy.initialDelayMs * 2 ** Math.max(0, attempt - 1), policy.maxDelayMs);
}

function wait(delayMs: number, signal: AbortSignal | undefined): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false);
	if (delayMs <= 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		const finish = (completed: boolean) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve(completed);
		};
		const onAbort = () => finish(false);
		const timer = setTimeout(() => finish(true), delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function throwIfAborted(signal: AbortSignal | undefined, metadata: OxaPayRequestMetadata): void {
	if (signal?.aborted) throw new OxaPayAbortError(metadata, signal.reason);
}

function safeMetadataUrl(url: URL): string {
	const safeUrl = new URL(url);
	safeUrl.search = "";
	return safeUrl.toString();
}

function safeResponseHookRequest(request: Request): Request {
	const headers = new Headers(request.headers);
	for (const header of apiKeyHeaderNames) headers.delete(header);
	return new Request(safeMetadataUrl(new URL(request.url)), {
		method: request.method,
		headers,
		signal: request.signal,
		redirect: request.redirect,
	});
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function messageForError(status: number, response: OxaPayResponse<unknown> | null): string {
	return response?.error?.message ?? response?.message ?? `OxaPay request failed with HTTP ${status}`;
}

function apiError(options: OxaPayApiErrorOptions): OxaPayApiError {
	const message = messageForError(options.status, options.response);
	switch (options.status) {
		case 400:
			return new OxaPayValidationError(message, options);
		case 401:
		case 403:
			return new OxaPayAuthenticationError(message, options);
		case 404:
			return new OxaPayNotFoundError(message, options);
		case 429:
			return new OxaPayRateLimitError(message, options);
		default:
			return options.status >= 500 ? new OxaPayServerError(message, options) : new OxaPayApiError(message, options);
	}
}

interface ParsedBody {
	json: unknown | null;
	parseError: unknown | null;
}

async function parseBody(response: Response): Promise<ParsedBody> {
	let text: string;
	try {
		text = await response.text();
	} catch (cause) {
		return { json: null, parseError: cause };
	}
	if (!text.trim()) return { json: null, parseError: null };
	try {
		return { json: JSON.parse(text), parseError: null };
	} catch (cause) {
		return { json: null, parseError: cause };
	}
}

function toEnvelope(value: unknown, fallbackStatus: number): OxaPayResponse<unknown> | null {
	const decoded = decodeOxaPayValue(value);
	if (!isRecord(decoded) || !("data" in decoded)) return null;

	const error = isRecord(decoded.error) ? decoded.error : null;
	return {
		data: decoded.data,
		message: typeof decoded.message === "string" ? decoded.message : "",
		error,
		status: typeof decoded.status === "number" ? decoded.status : fallbackStatus,
		version: typeof decoded.version === "string" ? decoded.version : "",
	};
}

/**
 * Low-level, runtime-neutral OxaPay transport. It is intentionally public so
 * applications can add features before a higher-level resource is released.
 */
export class OxaPayClient {
	readonly #options: OxaPayOptions;
	readonly #baseUrl: string;
	readonly #fetch: typeof globalThis.fetch;
	readonly #headers: Headers;

	constructor(options: OxaPayOptions = {}) {
		normalizeTimeoutMs(options.timeoutMs, "timeoutMs");
		this.#options = { ...options };
		this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? OXAPAY_DEFAULT_BASE_URL);
		this.#fetch = options.fetch ?? globalThis.fetch;
		if (typeof this.#fetch !== "function") {
			throw new OxaPayConfigurationError("A fetch implementation is required to use OxaPayClient");
		}
		this.#headers = new Headers(options.headers);
	}

	get baseUrl(): string {
		return this.#baseUrl;
	}

	/**
	 * Returns a new immutable client while preserving transport and policy settings.
	 * Credentials are replaced as a set rather than merged, preventing a tenant view
	 * from accidentally retaining another tenant's payout or general key.
	 */
	withCredentials(credentials: OxaPayCredentials): OxaPayClient {
		const { merchantApiKey: _merchantApiKey, payoutApiKey: _payoutApiKey, generalApiKey: _generalApiKey, ...transportOptions } = this.#options;
		return new OxaPayClient({ ...transportOptions, ...credentials });
	}

	/** Resolves configured webhook secrets for a framework adapter without exposing request auth internals. */
	async getWebhookCredentials(): Promise<OxaPayWebhookCredentials> {
		const credentials: OxaPayWebhookCredentials = {};
		const merchantApiKey = await this.#resolveApiKey("merchant", false);
		const payoutApiKey = await this.#resolveApiKey("payout", false);
		if (merchantApiKey) credentials.merchantApiKey = merchantApiKey;
		if (payoutApiKey) credentials.payoutApiKey = payoutApiKey;
		return credentials;
	}

	async request<T>(operation: OxaPayOperation, options: OxaPayOperationRequest = {}): Promise<OxaPayResponse<T>> {
		if (operation.method === "GET" && options.body !== undefined) {
			throw new OxaPayConfigurationError("GET OxaPay operations do not accept a request body");
		}

		let path: string;
		try {
			path = fillPath(operation.path, options.path);
		} catch (cause) {
			throw new OxaPayConfigurationError("Invalid OxaPay operation path parameters", { cause });
		}

		const url = new URL(`${this.#baseUrl}${path}`);
		try {
			appendQuery(url, options.query);
		} catch (cause) {
			throw new OxaPayConfigurationError("OxaPay query values must be finite strings, numbers, or booleans", { cause });
		}
		let body: string | undefined;
		if (options.body !== undefined) {
			try {
				const encoded = encodeOxaPayValue(options.body);
				assertFiniteNumbers(encoded, "OxaPay request body");
				const serialized = JSON.stringify(encoded);
				if (serialized === undefined) throw new TypeError("Request body did not serialize to JSON");
				body = serialized;
			} catch (cause) {
				throw new OxaPayConfigurationError("OxaPay request body must contain only JSON values with finite numbers", { cause });
			}
		}

		const metadata: OxaPayRequestMetadata = {
			method: operation.method,
			url: safeMetadataUrl(url),
			auth: operation.auth,
		};
		const key = await this.#resolveApiKey(operation.auth, operation.auth !== "none");
		const policy = retryPolicy(operation.method, options.retry, this.#options.retry);
		const attempts = policy?.maxAttempts ?? 1;
		let lastNetworkError: OxaPayNetworkError | undefined;

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			throwIfAborted(options.signal, metadata);
			const timeoutMs = normalizeTimeoutMs(
				options.timeoutMs === undefined ? this.#options.timeoutMs : options.timeoutMs,
				"timeoutMs",
			);
			const control = createAbortControl(options.signal, timeoutMs);
			let nextDelay: number | undefined;
			try {
				const headers = new Headers(this.#headers);
				new Headers(options.headers).forEach((value, name) => headers.set(name, value));
				headers.set("accept", "application/json");
				if (body !== undefined) headers.set("content-type", "application/json");

				const requestInit: RequestInit = {
					method: operation.method,
					headers,
					signal: control.signal ?? null,
					redirect: "error",
				};
				if (body !== undefined) requestInit.body = body;
				const request = new Request(url, requestInit);
				await this.#options.onRequest?.(request);
				this.#attachApiKey(request.headers, operation.auth, key);

				let response: Response | undefined;
				try {
					response = await this.#fetch(request);
				} catch (cause) {
					const error = control.timedOut() && timeoutMs !== undefined
						? new OxaPayTimeoutError(timeoutMs, metadata, { cause })
						: new OxaPayNetworkError("OxaPay request failed before a response was received", metadata, { cause });
					if (options.signal?.aborted) throw new OxaPayAbortError(metadata, options.signal.reason);
					if (error instanceof OxaPayNetworkError && !(error instanceof OxaPayTimeoutError) && policy && attempt < attempts) {
						lastNetworkError = error;
						nextDelay = retryDelay(attempt, policy);
					} else {
						throw error;
					}
				}

				if (response) {
					if (this.#options.onResponse) {
						const responseForHook = response.clone();
						try {
							await this.#options.onResponse(responseForHook, safeResponseHookRequest(request));
						} finally {
							responseForHook.body?.cancel().catch(() => undefined);
						}
					}
					if (policy && attempt < attempts && isRetryableStatus(response.status)) {
						response.body?.cancel().catch(() => undefined);
						nextDelay = retryDelay(attempt, policy, response.headers);
					} else {
						const parsed = await parseBody(response);
						const envelope = parsed.json === null ? null : toEnvelope(parsed.json, response.status);

						if (!response.ok) {
							const retryAfter = retryAfterMs(response.headers);
							throw apiError({
								status: response.status,
								request: metadata,
								response: envelope,
								...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
							});
						}

						if (parsed.parseError || !envelope) {
							throw new OxaPayResponseParseError(
								"OxaPay returned an empty, invalid, or unexpected JSON response",
								metadata,
								response.status,
								{ cause: parsed.parseError ?? undefined },
							);
						}

						return envelope as OxaPayResponse<T>;
					}
				}
			} finally {
				control.cleanup();
			}

			if (nextDelay !== undefined) {
				if (!(await wait(nextDelay, options.signal))) throwIfAborted(options.signal, metadata);
			}
		}

		throw lastNetworkError ?? new OxaPayNetworkError("OxaPay request failed after retrying", metadata);
	}

	async #resolveApiKey(scope: OxaPayAuthScope, required: boolean): Promise<string | undefined> {
		if (scope === "none") return undefined;
		const credential = this.#credentialFor(scope);
		if (credential === undefined) {
			if (required) throw new OxaPayConfigurationError(`A ${scope} API key is required for this OxaPay operation`);
			return undefined;
		}

		const value = typeof credential === "function" ? await credential() : credential;
		if (!value.trim()) {
			if (required) throw new OxaPayConfigurationError(`A non-empty ${scope} API key is required for this OxaPay operation`);
			return undefined;
		}
		return value;
	}

	#credentialFor(scope: Exclude<OxaPayAuthScope, "none">): OxaPayApiKey | undefined {
		switch (scope) {
			case "merchant":
				return this.#options.merchantApiKey;
			case "payout":
				return this.#options.payoutApiKey;
			case "general":
				return this.#options.generalApiKey;
		}
	}

	#attachApiKey(headers: Headers, scope: OxaPayAuthScope, key: string | undefined): void {
		if (!key || scope === "none") return;
		headers.set(`${scope}_api_key`, key);
	}
}
