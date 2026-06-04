import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CLI, parseCliArgs, DEFAULT_OPTIONS } from "../src/CLI.js";
import { EnvParser } from "../src/EnvParser.js";
import { TemplateSync } from "../src/TemplateSync.js";

describe("CLI single-project mode (default)", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "zodenvy-single-test-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("generates env.generated.ts for a single .env in cwd", async () => {
		writeFileSync(join(root, ".env"), "PORT=3000\nAPI_URL=https://x\n", "utf-8");
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }), "utf-8");

		const cli = new CLI(new EnvParser(), new TemplateSync());
		await cli.run(root);

		const outPath = join(root, "src/constants/env.generated.ts");
		expect(existsSync(outPath)).toBe(true);

		const content = readFileSync(outPath, "utf-8");
		expect(content).toContain("process.env[name]");
		expect(content).toContain("'PORT'");
		expect(content).toContain("'API_URL'");
	});

	it("syncs .env.template next to the .env", async () => {
		writeFileSync(join(root, ".env"), "DATABASE_URL=postgres://localhost\n", "utf-8");

		await new CLI(new EnvParser(), new TemplateSync()).run(root);

		expect(readFileSync(join(root, ".env.template"), "utf-8")).toContain("DATABASE_URL=");
	});

	it("respects custom outDir / outFile / typeName", async () => {
		writeFileSync(join(root, ".env"), "PORT=3000\n", "utf-8");

		const cli = new CLI(new EnvParser(), new TemplateSync(), {
			outDir: "src/env",
			outFile: "schema.ts",
			typeName: "Env",
		});
		await cli.run(root);

		const outPath = join(root, "src/env/schema.ts");
		expect(existsSync(outPath)).toBe(true);
		expect(readFileSync(outPath, "utf-8")).toContain(
			"export type Env = z.infer<typeof envSchema>;",
		);
	});

	it("respects envSource override (import.meta.env)", async () => {
		writeFileSync(join(root, ".env"), "API_URL=https://x\n", "utf-8");

		await new CLI(new EnvParser(), new TemplateSync(), {
			envSource: "import.meta.env",
		}).run(root);

		const content = readFileSync(join(root, "src/constants/env.generated.ts"), "utf-8");
		expect(content).toContain("import.meta.env[name]");
	});

	it("reads from custom --env-file path", async () => {
		const subdir = join(root, "config");
		mkdirSync(subdir, { recursive: true });
		writeFileSync(join(subdir, "app.env"), "TOKEN=abc\n", "utf-8");

		await new CLI(new EnvParser(), new TemplateSync(), {
			envFile: "config/app.env",
		}).run(root);

		expect(existsSync(join(subdir, "src/constants/env.generated.ts"))).toBe(true);
	});

	it("prints error and sets exitCode when .env is missing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const prevExitCode = process.exitCode;

		await new CLI(new EnvParser(), new TemplateSync()).run(root);

		expect(spy).toHaveBeenCalledWith(expect.stringContaining("No .env file found"));
		expect(process.exitCode).toBe(1);

		process.exitCode = prevExitCode;
		spy.mockRestore();
	});
});

describe("parseCliArgs", () => {
	it("returns defaults when no flags are passed", () => {
		const { options, showHelp, showVersion } = parseCliArgs([]);
		expect(options).toEqual(DEFAULT_OPTIONS);
		expect(showHelp).toBe(false);
		expect(showVersion).toBe(false);
	});

	it("parses all long flags", () => {
		const { options } = parseCliArgs([
			"--out-dir",
			"src/env",
			"--out-file",
			"schema.ts",
			"--env-source",
			"import.meta.env",
			"--type-name",
			"Env",
			"--recursive",
			"--env-file",
			"./.env.local",
		]);
		expect(options.outDir).toBe("src/env");
		expect(options.outFile).toBe("schema.ts");
		expect(options.envSource).toBe("import.meta.env");
		expect(options.typeName).toBe("Env");
		expect(options.recursive).toBe(true);
		expect(options.envFile).toBe("./.env.local");
	});

	it("parses -r short flag for recursive", () => {
		const { options } = parseCliArgs(["-r"]);
		expect(options.recursive).toBe(true);
	});

	it("detects --help and --version", () => {
		expect(parseCliArgs(["--help"]).showHelp).toBe(true);
		expect(parseCliArgs(["-h"]).showHelp).toBe(true);
		expect(parseCliArgs(["--version"]).showVersion).toBe(true);
		expect(parseCliArgs(["-v"]).showVersion).toBe(true);
	});

	it("throws on invalid --env-source value", () => {
		expect(() => parseCliArgs(["--env-source", "wrong"])).toThrow(/Invalid --env-source/);
	});

	it("throws on unknown flag", () => {
		expect(() => parseCliArgs(["--nope"])).toThrow();
	});
});
