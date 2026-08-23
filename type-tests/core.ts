import {
	OxaPay,
	type OxaPayJsonObject,
	type OxaPayQuery,
	type OxaPayRequestOptions,
	type PaymentStatus,
	type PayoutStatus,
	type TransactionStatus,
	routes,
} from "../src/index.js";

const oxapay = new OxaPay({ merchantApiKey: "merchant-secret" });
const requestOptions: OxaPayRequestOptions = { timeoutMs: 5_000 };

oxapay.account.balance(requestOptions);
oxapay.account.balance("USDT", requestOptions);
oxapay.account.balance(undefined, requestOptions);

const query = {
	page: 1,
	status: "paid",
} satisfies OxaPayQuery;
const body = {
	amount: 10,
	metadata: { orderId: "order_1" },
} satisfies OxaPayJsonObject;

const documentedPaymentStatus: PaymentStatus = "manual_accept";
const documentedPayoutStatus: PayoutStatus = "rejected";
const documentedTransactionStatus: TransactionStatus = "failed";
void documentedPaymentStatus;
void documentedPayoutStatus;
void documentedTransactionStatus;

oxapay.client.request<{ status: boolean }>(routes.common.monitor, { query });
oxapay.client.request<{ accepted: boolean }>(
	{ method: "POST", path: "/custom", auth: "merchant" },
	{ body },
);

oxapay.payment.createInvoice({ amount: 10, callbackUrl: "https://merchant.example/oxapay" });
// @ts-expect-error named resource inputs reject misspelled API fields
oxapay.payment.createInvoice({ amount: 10, callbakUrl: "https://merchant.example/oxapay" });

oxapay.payment.list({ fromDate: 1, page: 2 });
// @ts-expect-error named resource queries reject misspelled API fields
oxapay.payment.list({ fromData: 1 });

// @ts-expect-error nested query objects cannot be serialized as URL query parameters
oxapay.client.request(routes.common.monitor, { query: { filter: { status: "paid" } } });
// @ts-expect-error functions are not JSON request values
oxapay.client.request({ method: "POST", path: "/custom", auth: "merchant" }, { body: { callback: () => undefined } });
