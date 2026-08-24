/** A key accepted by OxaPay. A provider is useful for key rotation and multi-tenant apps. */
export type OxaPayApiKey = string | (() => string | Promise<string>);

/** The three key types used by the OxaPay v1 API. */
export interface OxaPayCredentials {
	merchantApiKey?: OxaPayApiKey;
	payoutApiKey?: OxaPayApiKey;
	generalApiKey?: OxaPayApiKey;
}

export type OxaPayAuthScope = "merchant" | "payout" | "general" | "none";
export type OxaPayHttpMethod = "GET" | "POST";

/** A route definition that can also be passed to {@link OxaPayClient.request}. */
export interface OxaPayOperation {
	readonly method: OxaPayHttpMethod;
	readonly path: string;
	readonly auth: OxaPayAuthScope;
}

export type OxaPayFetch = typeof globalThis.fetch;

export interface OxaPayRetryOptions {
	/** Total attempts, including the initial request. Defaults to 3 for safe GET requests. */
	maxAttempts?: number;
	/** Base delay for exponential backoff. Defaults to 250 ms. */
	initialDelayMs?: number;
	/** Maximum backoff delay. Defaults to 5 seconds. */
	maxDelayMs?: number;
	/**
	 * Opt in before retrying a POST. OxaPay does not document a universal idempotency
	 * key, so create operations are deliberately not retried by default.
	 */
	retryUnsafeRequests?: boolean;
}

export interface OxaPayRequestOptions {
	headers?: HeadersInit;
	signal?: AbortSignal;
	/** Per-attempt timeout in milliseconds. `0` disables the configured timeout. */
	timeoutMs?: number;
	retry?: false | OxaPayRetryOptions;
}

/** Runs before an API key is attached, so it never receives credential headers. */
export type OxaPayRequestInterceptor = (request: Request) => void | Promise<void>;
/**
 * Runs for every HTTP response. The Request is a safe snapshot: it keeps the
 * method, URL, and non-auth headers, but never exposes API-key headers or a body.
 */
export type OxaPayResponseInterceptor = (response: Response, request: Request) => void | Promise<void>;

/** Configuration shared by every resource on an {@link OxaPay} instance. */
export interface OxaPayOptions extends OxaPayCredentials {
	/** Defaults to https://api.oxapay.com/v1. Useful for sandbox proxies and tests. */
	baseUrl?: string;
	/** Native fetch implementation. Inject one for proxies, testing, or custom runtimes. */
	fetch?: OxaPayFetch;
	/** Headers applied before resource-specific authentication is attached. */
	headers?: HeadersInit;
	/** Default per-attempt timeout in milliseconds. `0` or omission disables it. */
	timeoutMs?: number;
	/** Retry policy. Only GET requests are retried unless explicitly opted in. */
	retry?: false | OxaPayRetryOptions;
	onRequest?: OxaPayRequestInterceptor;
	onResponse?: OxaPayResponseInterceptor;
}

export type OxaPayJsonInputValue = string | number | boolean | null | Date | OxaPayJsonObject | readonly OxaPayJsonInputValue[];

/** A JSON object accepted by the low-level custom-route API. Undefined object fields are omitted. */
export interface OxaPayJsonObject {
	readonly [field: string]: OxaPayJsonInputValue | undefined;
}

export type OxaPayQueryValue = string | number | boolean | null | undefined;
/** Flat query parameters accepted by the low-level custom-route API. */
export type OxaPayQuery = Record<string, OxaPayQueryValue | readonly OxaPayQueryValue[]>;

export interface OxaPayOperationRequest extends OxaPayRequestOptions {
	/** Values for `{placeholder}` segments in an operation path. */
	path?: Record<string, string | number>;
	query?: OxaPayQuery;
	body?: OxaPayJsonObject;
}

export interface OxaPayErrorBody {
	type?: string;
	key?: string;
	message?: string;
	readonly [field: string]: unknown;
}

/** The envelope returned by every documented OxaPay v1 endpoint. */
export interface OxaPayResponse<T> {
	data: T;
	message: string;
	error: OxaPayErrorBody | null;
	status: number;
	version: string;
}

export interface OxaPayPagination {
	page: number;
	lastPage: number;
	total: number;
}

export interface OxaPayPage<T> {
	list: T[];
	meta: OxaPayPagination;
}

/** OxaPay models monetary fields as JSON numbers. Do not use JavaScript arithmetic for settlement logic. */
export type OxaPayAmount = number;
export type OxaPayCurrency = string;
export type OxaPayNetwork = string;
export type OxaPayTrackId = string;
export type OxaPayUnixTimestamp = number;
export type OxaPayFlag = 0 | 1;
export type OpenString<T extends string> = T | (string & {});

export type PaymentType = OpenString<
	"invoice" | "white_label" | "static_address" | "payment_link" | "donation"
>;
/** Payment states documented by OxaPay, plus future string values for forward compatibility. */
export type PaymentStatus = OpenString<
	| "new"
	| "waiting"
	| "paying"
	| "paid"
	| "manual_accept"
	| "underpaid"
	| "refunding"
	| "refunded"
	| "expired"
	| "Paying"
	| "Paid"
>;
/** Payout states documented by OxaPay, plus callback casing and future string values. */
export type PayoutStatus = OpenString<
	| "processing"
	| "pending"
	| "confirming"
	| "confirmed"
	| "canceled"
	| "rejected"
	| "failed"
	| "Confirming"
	| "Confirmed"
	| "Failed"
>;
/** Blockchain transaction states may grow independently of payout and payment states. */
export type TransactionStatus = OpenString<"confirming" | "confirmed" | "failed">;

export interface CreateInvoiceInput {
	/** Invoice amount. When currency is omitted, OxaPay treats this as USD. */
	amount: OxaPayAmount;
	currency?: OxaPayCurrency;
	/** Lifetime in minutes, from 15 to 2,880 according to OxaPay's v1 documentation. */
	lifetime?: number;
	/** `1` charges the payer the invoice fee; `0` charges the merchant. */
	feePaidByPayer?: OxaPayFlag;
	/** Maximum permitted shortfall, as a percentage from 0 to 60. */
	underPaidCoverage?: number;
	/** Convert received funds to this currency. OxaPay currently documents USDT as the supported target. */
	toCurrency?: OxaPayCurrency;
	/** Send received funds to the configured address list instead of the OxaPay balance. */
	autoWithdrawal?: boolean;
	/** Allow the payer to complete an underpayment with another currency. */
	mixedPayment?: boolean;
	callbackUrl?: string;
	returnUrl?: string;
	email?: string;
	orderId?: string;
	thanksMessage?: string;
	description?: string;
	sandbox?: boolean;
}

export interface Invoice {
	trackId: OxaPayTrackId;
	paymentUrl: string;
	expiredAt: OxaPayUnixTimestamp;
	date: OxaPayUnixTimestamp;
}

export interface CreateWhiteLabelInput {
	payCurrency: OxaPayCurrency;
	amount: OxaPayAmount;
	currency?: OxaPayCurrency;
	network?: OxaPayNetwork;
	lifetime?: number;
	feePaidByPayer?: OxaPayFlag;
	underPaidCoverage?: number;
	toCurrency?: OxaPayCurrency;
	autoWithdrawal?: boolean;
	callbackUrl?: string;
	email?: string;
	orderId?: string;
	description?: string;
}

export interface WhiteLabelPayment {
	trackId: OxaPayTrackId;
	amount: OxaPayAmount;
	currency: OxaPayCurrency;
	payAmount: OxaPayAmount;
	payCurrency: OxaPayCurrency;
	network: OxaPayNetwork;
	address: string;
	memo: string;
	callbackUrl: string;
	description: string;
	email: string;
	feePaidByPayer: OxaPayFlag;
	lifetime: number;
	orderId: string;
	underPaidCoverage: number;
	rate: number;
	qrCode: string;
	expiredAt: OxaPayUnixTimestamp;
	date: OxaPayUnixTimestamp;
}

export interface CreateStaticAddressInput {
	network: OxaPayNetwork;
	toCurrency?: OxaPayCurrency;
	/** The documented endpoint currently models this as 0 or 1. */
	autoWithdrawal?: OxaPayFlag;
	callbackUrl?: string;
	email?: string;
	orderId?: string;
	description?: string;
}

export interface StaticAddress {
	trackId: OxaPayTrackId;
	address: string;
	network: OxaPayNetwork;
	memo?: string;
	qrCode?: string;
	callbackUrl?: string;
	email?: string;
	orderId?: string;
	description?: string;
	date: OxaPayUnixTimestamp;
}

/** The documented v1 revoke endpoint requires the static-address value. */
export interface RevokeStaticAddressInput {
	address: string;
}

export interface StaticAddressListQuery {
	trackId?: OxaPayTrackId;
	network?: OxaPayNetwork;
	currency?: OxaPayCurrency;
	address?: string;
	haveTx?: boolean;
	orderId?: string;
	email?: string;
	page?: number;
	size?: number;
}

export interface PaymentTransaction {
	txHash: string;
	amount: OxaPayAmount;
	currency: OxaPayCurrency;
	network: OxaPayNetwork;
	address: string;
	status: TransactionStatus;
	confirmations: number;
	autoConvert: {
		processed: boolean;
		amount: OxaPayAmount;
		currency: OxaPayCurrency;
	};
	autoWithdrawal: {
		processed: boolean;
	};
	date: OxaPayUnixTimestamp;
}

export interface Payment {
	trackId: OxaPayTrackId;
	type: PaymentType;
	amount: OxaPayAmount;
	currency: OxaPayCurrency;
	status: PaymentStatus;
	mixedPayment: boolean;
	callbackUrl: string;
	description: string;
	email: string;
	feePaidByPayer: OxaPayFlag;
	lifetime: number;
	orderId: string;
	underPaidCoverage: number;
	returnUrl: string;
	thanksMessage: string;
	expiredAt: OxaPayUnixTimestamp;
	date: OxaPayUnixTimestamp;
	txs: PaymentTransaction[];
}

export interface PaymentHistoryQuery {
	trackId?: OxaPayTrackId;
	type?: OpenString<"invoice" | "white_label" | "static_address">;
	status?: PaymentStatus;
	payCurrency?: OxaPayCurrency;
	currency?: OxaPayCurrency;
	network?: OxaPayNetwork;
	address?: string;
	fromDate?: OxaPayUnixTimestamp;
	toDate?: OxaPayUnixTimestamp;
	fromAmount?: OxaPayAmount;
	toAmount?: OxaPayAmount;
	sortBy?: OpenString<"create_date" | "pay_date" | "amount">;
	sortType?: "asc" | "desc";
	page?: number;
	size?: number;
}

export interface PaymentStatisticsQuery {
	type?: OpenString<"invoice" | "white_label" | "static_address">;
	network?: OxaPayNetwork;
	payCurrency?: OxaPayCurrency;
	fromDate?: OxaPayUnixTimestamp;
	toDate?: OxaPayUnixTimestamp;
}

export interface PaymentStatistic {
	payCurrency: OxaPayCurrency;
	total: number;
	receivedAmount: string;
}

export interface CreatePayoutInput {
	address: string;
	currency: OxaPayCurrency;
	amount: OxaPayAmount;
	network?: OxaPayNetwork;
	callbackUrl?: string;
	memo?: string;
	description?: string;
}

export interface PayoutCreated {
	trackId: OxaPayTrackId;
	status: PayoutStatus;
}

export interface Payout {
	trackId: OxaPayTrackId;
	address: string;
	currency: OxaPayCurrency;
	network: OxaPayNetwork;
	amount: OxaPayAmount;
	fee: OxaPayAmount;
	status: PayoutStatus;
	txHash: string;
	description: string;
	internal: boolean;
	memo: string;
	date: OxaPayUnixTimestamp;
}

export interface PayoutHistoryQuery {
	status?: PayoutStatus;
	type?: "external" | "internal";
	currency?: OxaPayCurrency;
	network?: OxaPayNetwork;
	fromAmount?: OxaPayAmount;
	toAmount?: OxaPayAmount;
	fromDate?: OxaPayUnixTimestamp;
	toDate?: OxaPayUnixTimestamp;
	sortBy?: OpenString<"create_date" | "pay_date" | "amount">;
	sortType?: "asc" | "desc";
	page?: number;
	size?: number;
}

export interface CreateSwapInput {
	fromCurrency: OxaPayCurrency;
	toCurrency: OxaPayCurrency;
	amount: OxaPayAmount;
}

export interface Swap {
	trackId: OxaPayTrackId;
	fromCurrency: OxaPayCurrency;
	toCurrency: OxaPayCurrency;
	fromAmount: OxaPayAmount;
	toAmount: OxaPayAmount;
	rate: number;
	date: OxaPayUnixTimestamp;
}

export interface SwapHistoryQuery {
	trackId?: OxaPayTrackId;
	type?: OpenString<"autoConvert" | "manualSwap" | "swapByApi">;
	fromCurrency?: OxaPayCurrency;
	toCurrency?: OxaPayCurrency;
	fromDate?: OxaPayUnixTimestamp;
	toDate?: OxaPayUnixTimestamp;
	sortBy?: OpenString<"create_date" | "amount">;
	sortType?: "asc" | "desc";
	page?: number;
	size?: number;
}

export interface SwapPair {
	fromCurrency: OxaPayCurrency;
	toCurrency: OxaPayCurrency;
	minAmount: OxaPayAmount;
}

export interface SwapQuote {
	toAmount: OxaPayAmount;
	rate: number;
	amount: OxaPayAmount;
}

export interface SwapRateInput {
	fromCurrency: OxaPayCurrency;
	toCurrency: OxaPayCurrency;
}

export interface SwapRate {
	rate: number;
}

export type AccountBalances = Record<OxaPayCurrency, OxaPayAmount>;
export type CurrencyPrices = Record<OxaPayCurrency, OxaPayAmount>;

export interface CurrencyNetworkDetails {
	network: string;
	name: string;
	keys: string[];
	requiredConfirmations: number;
	withdrawFee: OxaPayAmount;
	withdrawMin: OxaPayAmount;
	depositMin: OxaPayAmount;
	staticFixedFee: OxaPayAmount;
}

export interface SupportedCurrency {
	symbol: OxaPayCurrency;
	name: string;
	status: boolean;
	networks: Record<OxaPayNetwork, CurrencyNetworkDetails>;
}

export type SupportedCurrencies = Record<OxaPayCurrency, SupportedCurrency>;

export interface FiatCurrency {
	symbol: string;
	name: string;
	price: OxaPayAmount;
	displayPrecision: number;
}

export type FiatCurrencies = Record<string, FiatCurrency>;

export interface SystemStatus {
	status: boolean;
}

/** Merchant callback types accepted by strict webhook validation. */
export const documentedMerchantWebhookTypes = [
	"invoice",
	"white_label",
	"static_address",
	"payment_link",
	"donation",
	"payment",
] as const;
export type MerchantWebhookType = (typeof documentedMerchantWebhookTypes)[number];

export interface WebhookTransaction {
	status: TransactionStatus;
	txHash: string;
	sentAmount: OxaPayAmount;
	receivedAmount: OxaPayAmount;
	value: OxaPayAmount;
	sentValue: OxaPayAmount;
	currency: OxaPayCurrency;
	network: OxaPayNetwork;
	senderAddress: string;
	address: string;
	rate: number;
	confirmations: number;
	autoConvertAmount: OxaPayAmount;
	autoConvertCurrency: OxaPayCurrency;
	date: OxaPayUnixTimestamp;
}

export interface MerchantWebhookEvent {
	type: MerchantWebhookType;
	trackId: OxaPayTrackId;
	status: PaymentStatus;
	moduleName?: string;
	amount: OxaPayAmount;
	value: OxaPayAmount;
	sentValue: OxaPayAmount;
	currency: OxaPayCurrency;
	orderId?: string;
	email?: string;
	note?: string;
	feePaidByPayer?: OxaPayFlag;
	underPaidCoverage?: number;
	description?: string;
	date: OxaPayUnixTimestamp;
	txs?: WebhookTransaction[];
}

export interface PayoutWebhookEvent {
	type: "payout";
	trackId: OxaPayTrackId;
	status: PayoutStatus;
	txHash: string;
	address: string;
	amount: OxaPayAmount;
	value: OxaPayAmount;
	currency: OxaPayCurrency;
	network: OxaPayNetwork;
	description?: string;
	date: OxaPayUnixTimestamp;
}

/** Events documented by OxaPay today, with their useful fields preserved for the happy path. */
export type KnownOxaPayWebhookEvent = MerchantWebhookEvent | PayoutWebhookEvent;
export type UnknownWebhookEvent = { type: string } & Record<string, unknown>;
/** Includes unknown future event types for low-level integrations that prefer forward compatibility. */
export type OxaPayWebhookEvent = KnownOxaPayWebhookEvent | UnknownWebhookEvent;

export interface OxaPayWebhookCredentials {
	merchantApiKey?: string;
	payoutApiKey?: string;
}

/** The untouched bytes used to verify an OxaPay webhook signature. */
export type OxaPayRawBody = string | ArrayBuffer | Uint8Array;

/** The signature extracted from an incoming OxaPay webhook request. */
export interface OxaPayWebhookSignatureOptions {
	signature: string | null | undefined;
}

/** Credentials and signature for standalone raw-webhook verification. */
export interface VerifyWebhookOptions extends OxaPayWebhookCredentials, OxaPayWebhookSignatureOptions {}

export interface OxaPayWebhookVerification {
	valid: boolean;
	verifiedWith?: "merchant" | "payout";
}

export interface VerifiedWebhook<T extends OxaPayWebhookEvent = OxaPayWebhookEvent> {
	data: T;
	verifiedWith: "merchant" | "payout";
	rawBody: Uint8Array;
}
