import type { OxaPayJsonObject, OxaPayOperationRequest, OxaPayQuery, OxaPayRequestOptions } from "../types.js";

/**
 * Bridges a resource's closed public input shape to the low-level custom-route
 * contract. Runtime serialization still validates the values before a request
 * is sent; keeping this assertion internal preserves excess-property checks for
 * resource callers.
 */
export function withOxaPayBody(input: object, options?: OxaPayRequestOptions): OxaPayOperationRequest {
	return { ...options, body: input as unknown as OxaPayJsonObject };
}

/** Keeps resource query interfaces closed while the custom-route API remains extensible. */
export function withOxaPayQuery(query: object, options?: OxaPayRequestOptions): OxaPayOperationRequest {
	return { ...options, query: query as unknown as OxaPayQuery };
}
