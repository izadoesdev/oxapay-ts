import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const sandboxKeyEnvironmentVariable = "OXAPAY_SANDBOX_MERCHANT_API_KEY";
const smokeOptInEnvironmentVariable = "OXAPAY_RUN_SANDBOX_SMOKE";
const sandboxCallbackUrlEnvironmentVariable = "OXAPAY_SANDBOX_CALLBACK_URL";
const smokeAmount = 5;
const smokeTimeoutMs = 15_000;
const maximumOrderIdLength = 50;

/**
 * Resolves the explicit opt-in and sandbox-only environment variables this
 * script deliberately reads. It never falls back to OXAPAY_MERCHANT_API_KEY,
 * so a production key cannot accidentally run the sandbox workflow.
 */
export function resolveSandboxSmokeConfig(environment = process.env) {
	return {
		merchantApiKey: environment[sandboxKeyEnvironmentVariable]?.trim() || undefined,
		execute: environment[smokeOptInEnvironmentVariable] === "1",
		callbackUrl: environment[sandboxCallbackUrlEnvironmentVariable]?.trim() || undefined,
	};
}

function validatedCallbackUrl(value) {
	if (!value) return undefined;
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError(`${sandboxCallbackUrlEnvironmentVariable} must be an absolute HTTPS URL`);
	}
	if (url.protocol !== "https:" || url.username || url.password) {
		throw new TypeError(`${sandboxCallbackUrlEnvironmentVariable} must be an HTTPS URL without credentials`);
	}
	return url.toString();
}

function resolveSandboxSmokeState(environment = process.env) {
	const config = resolveSandboxSmokeConfig(environment);
	if (!config.execute) {
		return {
			config,
			executable: false,
			exitCode: 0,
			message: `No network call will be made. Set ${smokeOptInEnvironmentVariable}=1 to explicitly enable a sandbox invoice request.`,
		};
	}
	if (!config.merchantApiKey) {
		return {
			config,
			executable: false,
			exitCode: 1,
			message: `${sandboxKeyEnvironmentVariable} is required once ${smokeOptInEnvironmentVariable}=1 is set. No network call will be made.`,
		};
	}
	try {
		return {
			config: { ...config, callbackUrl: validatedCallbackUrl(config.callbackUrl) },
			executable: true,
			exitCode: 0,
			message: "Sandbox smoke test is enabled. It will create one sandbox invoice and never print its API key or payment URL.",
		};
	} catch (error) {
		return {
			config,
			executable: false,
			exitCode: 1,
			message: `${error instanceof Error ? error.message : "Invalid sandbox callback URL"}. No network call will be made.`,
		};
	}
}

/** Returns a human-readable, credential-free description of whether a smoke run can execute. */
export function sandboxSmokeStatus(environment = process.env) {
	const { executable, message } = resolveSandboxSmokeState(environment);
	return {
		executable,
		message,
	};
}

function createOrderId(now, randomId) {
	// OxaPay limits order IDs to 50 characters. Keep a readable time component
	// and enough UUID entropy for a one-invoice smoke run without approaching it.
	const orderId = `oxapay-smoke-${Math.trunc(now).toString(36)}-${randomId().slice(0, 16)}`;
	if (orderId.length > maximumOrderIdLength) {
		throw new RangeError(`Generated sandbox order ID exceeds OxaPay's ${maximumOrderIdLength}-character limit`);
	}
	return orderId;
}

function defaultRandomId() {
	return randomUUID().replaceAll("-", "");
}

async function defaultLoadSdk() {
	return import("../dist/index.js");
}

/**
 * Creates one OxaPay sandbox invoice after an explicit environment opt-in.
 * Dependencies are injectable so the no-network safety contract is unit tested.
 */
export async function runSandboxSmoke({
	environment = process.env,
	write = (message) => console.log(message),
	writeError = (message) => console.error(message),
	loadSdk = defaultLoadSdk,
	now = () => Date.now(),
	randomId = defaultRandomId,
} = {}) {
	const state = resolveSandboxSmokeState(environment);
	if (!state.executable) {
		(state.exitCode === 0 ? write : writeError)(state.message);
		return { executed: false, exitCode: state.exitCode };
	}

	const { merchantApiKey, callbackUrl } = state.config;
	const { OxaPay } = await loadSdk();
	const client = new OxaPay({ merchantApiKey, retry: false, timeoutMs: smokeTimeoutMs });
	const result = await client.payment.createInvoice(
		{
			amount: smokeAmount,
			currency: "USD",
			sandbox: true,
			orderId: createOrderId(now(), randomId),
			...(callbackUrl === undefined ? {} : { callbackUrl }),
		},
		{ retry: false, timeoutMs: smokeTimeoutMs },
	);

	write(`Sandbox invoice created: trackId=${result.data.trackId}, expiresAt=${result.data.expiredAt}`);
	return { executed: true, exitCode: 0, invoice: result.data };
}

function printUsage(write) {
	write(`Usage:
  npm run sandbox:check
  OXAPAY_SANDBOX_MERCHANT_API_KEY=... OXAPAY_RUN_SANDBOX_SMOKE=1 npm run sandbox:smoke

The check command and a smoke command without both required variables never make a network call.
Only OXAPAY_RUN_SANDBOX_SMOKE, OXAPAY_SANDBOX_MERCHANT_API_KEY, and the optional HTTPS
OXAPAY_SANDBOX_CALLBACK_URL are read; production OXAPAY_MERCHANT_API_KEY is intentionally ignored.`);
}

export async function main(argumentsList = process.argv.slice(2), dependencies = {}) {
	if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
		printUsage(dependencies.write ?? ((message) => console.log(message)));
		return 0;
	}
	if (argumentsList.length > 0 && (argumentsList.length !== 1 || argumentsList[0] !== "--check")) {
		(dependencies.writeError ?? ((message) => console.error(message)))("Unknown argument. Pass --check or --help.");
		return 1;
	}
	if (argumentsList[0] === "--check") {
		const status = sandboxSmokeStatus(dependencies.environment);
		const summary = status.executable ? "The sandbox smoke test is configured and ready." : status.message;
		(dependencies.write ?? ((message) => console.log(message)))(`${summary} No network call will be made by --check.`);
		return 0;
	}
	return (await runSandboxSmoke(dependencies)).exitCode;
}

function isExecutedDirectly() {
	return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isExecutedDirectly()) {
	main().then((exitCode) => {
		process.exitCode = exitCode;
	}).catch((error) => {
		console.error("OxaPay sandbox smoke test failed.", error);
		process.exitCode = 1;
	});
}
