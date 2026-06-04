import { describe, it, expect } from "vitest";
import { CodeGenerator, type GeneratorOptions } from "../src/CodeGenerator.js";
import type { EnvEntry } from "../src/EnvParser.js";
import {
	nextAdapter,
	viteAdapter,
	astroAdapter,
	cloudflareAdapter,
	denoAdapter,
	bunAdapter,
	nodeAdapter,
} from "../src/adapters/index.js";

const defaultOptions: GeneratorOptions = {
	envSource: "process.env",
	typeName: "EnvironmentVariables",
	generateGetEnvs: false,
};

const gen = (options: Partial<GeneratorOptions> = {}) =>
	new CodeGenerator({ ...defaultOptions, ...options });

describe("CodeGenerator.entryToZodExpression", () => {
	it("required string → z.string().min(1)", () => {
		const entry: EnvEntry = {
			key: "K",
			value: "v",
			type: "string",
			isOptional: false,
		};
		expect(gen().entryToZodExpression(entry)).toBe("z.string().min(1)");
	});

	it("optional string → z.string().optional()", () => {
		const entry: EnvEntry = {
			key: "K",
			value: "",
			type: "string",
			isOptional: true,
		};
		expect(gen().entryToZodExpression(entry)).toBe("z.string().optional()");
	});

	it("string with default → z.string().default(...)", () => {
		const entry: EnvEntry = {
			key: "K",
			value: "",
			type: "string",
			isOptional: true,
			defaultValue: "production",
		};
		expect(gen().entryToZodExpression(entry)).toBe("z.string().default('production')");
	});

	it("number → z.coerce.number()", () => {
		const entry: EnvEntry = {
			key: "K",
			value: "3000",
			type: "number",
			isOptional: false,
		};
		expect(gen().entryToZodExpression(entry)).toBe("z.coerce.number()");
	});

	it("boolean → z.enum transform (NOT z.coerce.boolean)", () => {
		const entry: EnvEntry = {
			key: "K",
			value: "false",
			type: "boolean",
			isOptional: false,
		};
		const expr = gen().entryToZodExpression(entry);
		expect(expr).toContain("z.enum(['true', 'false'])");
		expect(expr).toContain("transform");
		expect(expr).not.toContain("z.coerce.boolean");
	});
});

describe("CodeGenerator.generate", () => {
	const entries: EnvEntry[] = [
		{
			key: "API_URL",
			value: "https://x.com",
			type: "string",
			isOptional: false,
		},
		{ key: "DB_PORT", value: "5432", type: "number", isOptional: false },
		{ key: "DEBUG", value: "false", type: "boolean", isOptional: false },
		{
			key: "NODE_ENV",
			value: "",
			type: "string",
			isOptional: true,
			defaultValue: "production",
		},
	];

	it("generates header comment", () => {
		const code = gen().generate(entries);
		expect(code).toContain("DO NOT EDIT");
	});

	it("generates ENV_NAMES array", () => {
		const code = gen().generate(entries);
		expect(code).toContain(
			"export const ENV_NAMES = ['API_URL', 'DB_PORT', 'DEBUG', 'NODE_ENV'] as const;",
		);
	});

	it("generates envSchema", () => {
		const code = gen().generate(entries);
		expect(code).toContain("export const envSchema = z.object({");
	});

	it("generates type alias with correct typeName", () => {
		const code = gen().generate(entries);
		expect(code).toContain("export type EnvironmentVariables = z.infer<typeof envSchema>;");
	});

	it("respects custom typeName", () => {
		const code = gen({ typeName: "Env" }).generate(entries);
		expect(code).toContain("export type Env = z.infer<typeof envSchema>;");
	});

	it("does NOT include getEnvs when generateGetEnvs: false", () => {
		const code = gen().generate(entries);
		expect(code).not.toContain("export const getEnvs");
	});

	it("includes getEnvs with STATIC literal access when generateGetEnvs: true", () => {
		const code = gen({ generateGetEnvs: true }).generate(entries);
		expect(code).toContain("export const getEnvs");
		expect(code).toContain("process.env.API_URL");
		expect(code).toContain("process.env.DB_PORT");
		expect(code).toContain("process.env.DEBUG");
		expect(code).toContain("process.env.NODE_ENV");
	});

	it("does NOT emit dynamic bracket-notation access (bundler-unfriendly)", () => {
		const code = gen({ generateGetEnvs: true }).generate(entries);
		expect(code).not.toContain("process.env[name]");
		expect(code).not.toContain("Object.fromEntries");
	});

	it("uses import.meta.env when envSource configured", () => {
		const code = gen({
			generateGetEnvs: true,
			envSource: "import.meta.env",
		}).generate(entries);
		expect(code).toContain("import.meta.env.API_URL");
		expect(code).not.toContain("import.meta.env[name]");
	});

	it("snapshot — full generated file", () => {
		const code = gen().generate(entries);
		expect(code).toMatchSnapshot();
	});
});

describe("CodeGenerator with adapters", () => {
	const mixedEntries: EnvEntry[] = [
		{ key: "API_URL", value: "x", type: "string", isOptional: false },
		{ key: "DB_PASSWORD", value: "secret", type: "string", isOptional: false },
		{ key: "NEXT_PUBLIC_API_URL", value: "x", type: "string", isOptional: false },
	];

	it("node adapter — process.env static access, no split", () => {
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: nodeAdapter,
		}).generate(mixedEntries);
		expect(code).toContain("process.env.API_URL");
		expect(code).not.toContain("getPublicEnvs");
		expect(code).not.toContain("publicEnvSchema");
	});

	it("next adapter — emits getEnvs + getPublicEnvs (NEXT_PUBLIC_ subset)", () => {
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: nextAdapter,
		}).generate(mixedEntries);
		expect(code).toContain("export const getEnvs");
		expect(code).toContain("export const getPublicEnvs");
		expect(code).toContain("export const publicEnvSchema");
		expect(code).toContain("process.env.API_URL");
		expect(code).toContain("process.env.DB_PASSWORD");
		expect(code).toContain("process.env.NEXT_PUBLIC_API_URL");
		// public schema only includes NEXT_PUBLIC_*
		const publicSchemaMatch = code.match(/publicEnvSchema = z\.object\(\{([\s\S]*?)\}\)/);
		expect(publicSchemaMatch).not.toBeNull();
		expect(publicSchemaMatch![1]).toContain("NEXT_PUBLIC_API_URL");
		expect(publicSchemaMatch![1]).not.toContain("DB_PASSWORD");
		// publicEnvSchema must NOT include the non-prefixed API_URL — match line start with tab
		expect(publicSchemaMatch![1]).not.toMatch(/^\tAPI_URL:/m);
	});

	it("vite adapter — import.meta.env + VITE_ public split", () => {
		const entries: EnvEntry[] = [
			{ key: "API_KEY", value: "k", type: "string", isOptional: false },
			{ key: "VITE_API_URL", value: "x", type: "string", isOptional: false },
		];
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: viteAdapter,
		}).generate(entries);
		expect(code).toContain("import.meta.env.API_KEY");
		expect(code).toContain("import.meta.env.VITE_API_URL");
		expect(code).toContain("export const getPublicEnvs");
		expect(code).toContain("publicEnvSchema");
	});

	it("astro adapter — PUBLIC_ public split", () => {
		const entries: EnvEntry[] = [
			{ key: "SECRET", value: "s", type: "string", isOptional: false },
			{ key: "PUBLIC_URL", value: "u", type: "string", isOptional: false },
		];
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: astroAdapter,
		}).generate(entries);
		expect(code).toContain("import.meta.env.PUBLIC_URL");
		const publicSchemaMatch = code.match(/publicEnvSchema = z\.object\(\{([\s\S]*?)\}\)/);
		expect(publicSchemaMatch![1]).toContain("PUBLIC_URL");
		expect(publicSchemaMatch![1]).not.toContain("SECRET");
	});

	it("cloudflare adapter — emits createGetEnvs factory, NOT getEnvs", () => {
		const entries: EnvEntry[] = [{ key: "API_KEY", value: "k", type: "string", isOptional: false }];
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: cloudflareAdapter,
		}).generate(entries);
		expect(code).toContain(
			"export const createGetEnvs = (env: Record<string, string | undefined>)",
		);
		expect(code).toContain("env.API_KEY");
		expect(code).not.toMatch(/export const getEnvs = \(\):/);
		expect(code).not.toContain("process.env");
	});

	it("deno adapter — Deno.env.get(...)", () => {
		const entries: EnvEntry[] = [{ key: "API_KEY", value: "k", type: "string", isOptional: false }];
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: denoAdapter,
		}).generate(entries);
		expect(code).toContain('Deno.env.get("API_KEY")');
	});

	it("bun adapter — Bun.env.FOO", () => {
		const entries: EnvEntry[] = [{ key: "API_KEY", value: "k", type: "string", isOptional: false }];
		const code = new CodeGenerator({
			...defaultOptions,
			generateGetEnvs: true,
			adapter: bunAdapter,
		}).generate(entries);
		expect(code).toContain("Bun.env.API_KEY");
	});

	it("adapter takes precedence over envSource", () => {
		const code = new CodeGenerator({
			envSource: "process.env",
			typeName: "Env",
			generateGetEnvs: true,
			adapter: viteAdapter,
		}).generate(mixedEntries);
		expect(code).toContain("import.meta.env.API_URL");
		expect(code).not.toMatch(/process\.env\.API_URL/);
	});
});
