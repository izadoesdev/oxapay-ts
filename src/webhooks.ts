import { decodeOxaPayValue, isRecord } from "./codecs.js";
import { OxaPayClient } from "./client.js";
import { OxaPayConfigurationError, OxaPayWebhookParseError, OxaPayWebhookSignatureError } from "./errors.js";
import { documentedMerchantWebhookTypes } from "./types.js";
import type {
	KnownOxaPayWebhookEvent,
	OxaPayRawBody,
	OxaPayWebhookSignatureOptions,
	OxaPayWebhookEvent,
	OxaPayWebhookVerification,
	VerifiedWebhook,
	VerifyWebhookOptions,
} from "./types.js";

export type { OxaPayRawBody } from "./types.js";

const merchantWebhookTypes = new Set<string>(documentedMerchantWebhookTypes);

function bytesFromRawBody(rawBody: OxaPayRawBody): Uint8Array {
	if (typeof rawBody === "string") return new TextEncoder().encode(rawBody);
	if (rawBody instanceof Uint8Array) return rawBody;
	return new Uint8Array(rawBody);
}

function bytesFromHex(value: string): Uint8Array | null {
	const normalized = value.trim();
	if (!/^[a-f\d]{128}$/i.test(normalized)) return null;
	const bytes = new Uint8Array(normalized.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		const pair = normalized.slice(index * 2, index * 2 + 2);
		bytes[index] = Number.parseInt(pair, 16);
	}
	return bytes;
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let result = 0;
	for (let index = 0; index < left.length; index += 1) result |= left[index]! ^ right[index]!;
	return result === 0;
}

function copyForWebCrypto(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(bytes);
}

let nodeSubtle: Promise<SubtleCrypto> | undefined;

async function subtleCrypto(): Promise<SubtleCrypto> {
	if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
	if (!nodeSubtle) {
		nodeSubtle = (async () => {
			try {
				// A variable keeps this Node-only fallback out of browser import graphs.
				const moduleName = "node:crypto";
				const nodeCrypto = (await import(moduleName)) as { webcrypto?: Crypto };
				if (nodeCrypto.webcrypto?.subtle) return nodeCrypto.webcrypto.subtle;
			} catch {
				// A runtime without node:crypto is expected to provide Web Crypto globally.
			}
			throw new OxaPayConfigurationError("Web Crypto is required to verify OxaPay webhooks");
		})();
	}
	return nodeSubtle;
}

async function digest(secret: string, rawBody: Uint8Array): Promise<Uint8Array> {
	const subtle = await subtleCrypto();
	const key = await subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-512" },
		false,
		["sign"],
	);
	return new Uint8Array(await subtle.sign("HMAC", key, copyForWebCrypto(rawBody)));
}

function invalidKnownWebhook(path: string, expected: string): never {
	throw new OxaPayWebhookParseError(`OxaPay webhook ${path} must be ${expected}`);
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
	if (!isRecord(value)) invalidKnownWebhook(path, "an object");
	return value;
}

function requiredString(value: Record<string, unknown>, key: string, path: string): void {
	if (typeof value[key] !== "string") invalidKnownWebhook(`${path}.${key}`, "a string");
}

function optionalString(value: Record<string, unknown>, key: string, path: string): void {
	if (value[key] !== undefined) requiredString(value, key, path);
}

function requiredFiniteNumber(value: Record<string, unknown>, key: string, path: string): void {
	if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
		invalidKnownWebhook(`${path}.${key}`, "a finite number");
	}
}

function optionalFiniteNumber(value: Record<string, unknown>, key: string, path: string): void {
	if (value[key] !== undefined) requiredFiniteNumber(value, key, path);
}

function optionalFlag(value: Record<string, unknown>, key: string, path: string): void {
	if (value[key] !== undefined && value[key] !== 0 && value[key] !== 1) {
		invalidKnownWebhook(`${path}.${key}`, "0 or 1");
	}
}

function assertKnownTransaction(value: unknown, path: string): void {
	const transaction = requiredRecord(value, path);
	for (const key of [
		"status",
		"txHash",
		"currency",
		"network",
		"senderAddress",
		"address",
		"autoConvertCurrency",
	]) {
		requiredString(transaction, key, path);
	}
	for (const key of [
		"sentAmount",
		"receivedAmount",
		"value",
		"sentValue",
		"rate",
		"confirmations",
		"autoConvertAmount",
		"date",
	]) {
		requiredFiniteNumber(transaction, key, path);
	}
}

function assertKnownMerchantWebhook(data: Record<string, unknown>): void {
	const type = data.type;
	if (typeof type !== "string" || !merchantWebhookTypes.has(type)) {
		invalidKnownWebhook("data.type", "a documented merchant event type");
	}
	for (const key of ["trackId", "status", "currency"]) requiredString(data, key, "data");
	for (const key of ["amount", "value", "sentValue", "date"]) requiredFiniteNumber(data, key, "data");
	for (const key of ["moduleName", "orderId", "email", "note", "description"]) optionalString(data, key, "data");
	optionalFlag(data, "feePaidByPayer", "data");
	optionalFiniteNumber(data, "underPaidCoverage", "data");
	if (data.txs === undefined) return;
	if (!Array.isArray(data.txs)) invalidKnownWebhook("data.txs", "an array");
	for (const [index, transaction] of data.txs.entries()) assertKnownTransaction(transaction, `data.txs[${index}]`);
}

function assertKnownPayoutWebhook(data: Record<string, unknown>): void {
	for (const key of ["trackId", "status", "txHash", "address", "currency", "network"]) requiredString(data, key, "data");
	for (const key of ["amount", "value", "date"]) requiredFiniteNumber(data, key, "data");
	optionalString(data, "description", "data");
}

/**
 * Validates a verified payload against OxaPay's currently documented merchant
 * and payout callback shapes. It also makes sure the matched API-key scope
 * matches the callback family, so a payout key cannot impersonate a merchant
 * callback when an endpoint holds both keys.
 */
export function assertKnownOxaPayWebhookEvent(
	event: VerifiedWebhook<OxaPayWebhookEvent>,
): asserts event is VerifiedWebhook<KnownOxaPayWebhookEvent> {
	const data = requiredRecord(event.data, "data");
	if (data.type === "payout") {
		if (event.verifiedWith !== "payout") {
			invalidKnownWebhook("verifiedWith", "the payout API key for a payout event");
		}
		assertKnownPayoutWebhook(data);
		return;
	}
	if (event.verifiedWith !== "merchant") {
		invalidKnownWebhook("verifiedWith", "the merchant API key for a merchant event");
	}
	assertKnownMerchantWebhook(data);
}

/**
 * Validates OxaPay's lowercase-hex HMAC-SHA512 header against the exact raw body.
 * It intentionally tries all configured secrets before trusting the unverified JSON `type`.
 */
export async function verifyWebhookSignature(
	rawBody: OxaPayRawBody,
	options: VerifyWebhookOptions,
): Promise<OxaPayWebhookVerification> {
	const signature = bytesFromHex(options.signature ?? "");
	if (!signature) return { valid: false };

	const candidates = [
		["merchant", options.merchantApiKey],
		["payout", options.payoutApiKey],
	] as const;
	const secrets = candidates.filter((candidate): candidate is readonly ["merchant" | "payout", string] => Boolean(candidate[1]?.trim()));
	if (secrets.length === 0) {
		throw new OxaPayConfigurationError("A merchant or payout API key is required to verify an OxaPay webhook");
	}

	const bytes = bytesFromRawBody(rawBody);
	for (const [scope, secret] of secrets) {
		if (equal(await digest(secret, bytes), signature)) return { valid: true, verifiedWith: scope };
	}
	return { valid: false };
}

/**
 * Verifies a raw webhook and only then parses its JSON payload.
 *
 * The generic is a caller-owned assertion for custom payload schemas. Use
 * {@link parseAndVerifyKnownWebhook} when you want the documented OxaPay shape
 * to be checked at runtime.
 */
export async function parseAndVerifyWebhook<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
	rawBody: OxaPayRawBody,
	options: VerifyWebhookOptions,
): Promise<VerifiedWebhook<T>> {
	const verification = await verifyWebhookSignature(rawBody, options);
	if (!verification.valid || !verification.verifiedWith) {
		throw new OxaPayWebhookSignatureError("OxaPay webhook HMAC signature is invalid");
	}

	const bytes = bytesFromRawBody(rawBody);
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch (cause) {
		throw new OxaPayWebhookParseError("OxaPay webhook body is not valid JSON", { cause });
	}
	const decoded = decodeOxaPayValue(parsed);
	if (!isRecord(decoded) || typeof decoded.type !== "string") {
		throw new OxaPayWebhookParseError("OxaPay webhook payload must be an object with a string type");
	}

	return {
		data: decoded as T,
		verifiedWith: verification.verifiedWith,
		rawBody: bytes,
	};
}

/** Verifies a raw webhook and validates it against OxaPay's documented callback schema. */
export async function parseAndVerifyKnownWebhook(
	rawBody: OxaPayRawBody,
	options: VerifyWebhookOptions,
): Promise<VerifiedWebhook<KnownOxaPayWebhookEvent>> {
	const event = await parseAndVerifyWebhook(rawBody, options);
	assertKnownOxaPayWebhookEvent(event);
	return event;
}

/**
 * A webhook facade bound to credentials configured on an {@link OxaPay} client.
 * Use a framework-specific entrypoint such as `oxapay-ts/nextjs` or
 * `oxapay-ts/express` for application endpoints. {@link parse} and
 * {@link verify} are the low-level escape hatches for custom runtimes.
 */
export class OxaPayWebhooks {
	constructor(private readonly client: OxaPayClient) {}

	/** Low-level raw-body verification using this client's configured credentials. */
	async verify(rawBody: OxaPayRawBody, { signature }: OxaPayWebhookSignatureOptions): Promise<OxaPayWebhookVerification> {
		return verifyWebhookSignature(rawBody, { ...(await this.client.getWebhookCredentials()), signature });
	}

	/** Low-level raw-body parsing using this client's configured credentials. */
	async parse<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
		rawBody: OxaPayRawBody,
		{ signature }: OxaPayWebhookSignatureOptions,
	): Promise<VerifiedWebhook<T>> {
		return parseAndVerifyWebhook<T>(rawBody, { ...(await this.client.getWebhookCredentials()), signature });
	}

	/** Low-level parsing and documented-shape validation using this client's credentials. */
	async parseKnown(
		rawBody: OxaPayRawBody,
		{ signature }: OxaPayWebhookSignatureOptions,
	): Promise<VerifiedWebhook<KnownOxaPayWebhookEvent>> {
		return parseAndVerifyKnownWebhook(rawBody, { ...(await this.client.getWebhookCredentials()), signature });
	}
}
