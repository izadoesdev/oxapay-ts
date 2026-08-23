import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const distDirectory = new URL("../dist/", import.meta.url);

await rm(distDirectory, { recursive: true, force: true });

const command = process.platform === "win32" ? "tsc.cmd" : "tsc";
const child = spawn(command, ["-p", "tsconfig.build.json"], { stdio: "inherit" });

const exitCode = await new Promise((resolve, reject) => {
	child.once("error", reject);
	child.once("exit", (code, signal) => {
		if (signal) reject(new Error(`TypeScript build stopped by ${signal}`));
		else resolve(code ?? 1);
	});
});

if (exitCode !== 0) process.exitCode = exitCode;
