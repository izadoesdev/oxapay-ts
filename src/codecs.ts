import type { OxaPayQuery } from "./types.js";

const plainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Date || value instanceof Uint8Array) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

export const toSnakeCase = (key: string): string => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
export const toCamelCase = (key: string): string => key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

/** Converts public camelCase input to OxaPay's snake_case JSON wire format. */
export function encodeOxaPayValue(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(encodeOxaPayValue);
	if (!plainObject(value)) return value;

	return Object.fromEntries(
		Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.map(([key, item]) => [toSnakeCase(key), encodeOxaPayValue(item)]),
	);
}

/** Rejects values JSON would silently corrupt, such as NaN, functions, and undefined array items. */
export function assertFiniteNumbers(value: unknown, path: string): void {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) assertFiniteNumbers(value[index], `${path}[${index}]`);
		return;
	}
	if (plainObject(value)) {
		for (const [key, item] of Object.entries(value)) assertFiniteNumbers(item, `${path}.${key}`);
		return;
	}
	throw new TypeError(`${path} must be a JSON-compatible value`);
}

/** Converts OxaPay's snake_case response objects to camelCase without touching scalar values. */
export function decodeOxaPayValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(decodeOxaPayValue);
	if (!plainObject(value)) return value;

	return Object.fromEntries(Object.entries(value).map(([key, item]) => [toCamelCase(key), decodeOxaPayValue(item)]));
}

export function appendQuery(url: URL, query: OxaPayQuery | undefined): void {
	if (!query) return;

	for (const [key, value] of Object.entries(query)) {
		const encodedKey = toSnakeCase(key);
		const values = Array.isArray(value) ? value : [value];
		for (const item of values) {
			if (item === undefined || item === null) continue;
			if (typeof item === "number" && !Number.isFinite(item)) {
				throw new TypeError(`Query parameter ${key} must be a finite number`);
			}
			if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
				throw new TypeError(`Query parameter ${key} must be a string, number, or boolean`);
			}
			url.searchParams.append(encodedKey, String(item));
		}
	}
}

export function fillPath(template: string, values: Record<string, string | number> | undefined): string {
	return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
		const value = values?.[key];
		if (value === undefined || value === null || value === "") {
			throw new TypeError(`Missing required path parameter: ${key}`);
		}
		return encodeURIComponent(String(value));
	});
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
