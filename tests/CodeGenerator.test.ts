import { describe, it, expect } from 'vitest';
import { CodeGenerator, type GeneratorOptions } from '../src/CodeGenerator.js';
import type { EnvEntry } from '../src/EnvParser.js';

const defaultOptions: GeneratorOptions = {
	envSource: 'process.env',
	typeName: 'EnvironmentVariables',
	generateGetEnvs: false,
};

const gen = (options: Partial<GeneratorOptions> = {}) =>
	new CodeGenerator({ ...defaultOptions, ...options });

describe('CodeGenerator.entryToZodExpression', () => {
	it('required string → z.string().min(1)', () => {
		const entry: EnvEntry = { key: 'K', value: 'v', type: 'string', isOptional: false };
		expect(gen().entryToZodExpression(entry)).toBe('z.string().min(1)');
	});

	it('optional string → z.string().optional()', () => {
		const entry: EnvEntry = { key: 'K', value: '', type: 'string', isOptional: true };
		expect(gen().entryToZodExpression(entry)).toBe('z.string().optional()');
	});

	it('string with default → z.string().default(...)', () => {
		const entry: EnvEntry = {
			key: 'K',
			value: '',
			type: 'string',
			isOptional: true,
			defaultValue: 'production',
		};
		expect(gen().entryToZodExpression(entry)).toBe("z.string().default('production')");
	});

	it('number → z.coerce.number()', () => {
		const entry: EnvEntry = { key: 'K', value: '3000', type: 'number', isOptional: false };
		expect(gen().entryToZodExpression(entry)).toBe('z.coerce.number()');
	});

	it('boolean → z.enum transform (NOT z.coerce.boolean)', () => {
		const entry: EnvEntry = { key: 'K', value: 'false', type: 'boolean', isOptional: false };
		const expr = gen().entryToZodExpression(entry);
		expect(expr).toContain("z.enum(['true', 'false'])");
		expect(expr).toContain('transform');
		expect(expr).not.toContain('z.coerce.boolean');
	});
});

describe('CodeGenerator.generate', () => {
	const entries: EnvEntry[] = [
		{ key: 'API_URL', value: 'https://x.com', type: 'string', isOptional: false },
		{ key: 'DB_PORT', value: '5432', type: 'number', isOptional: false },
		{ key: 'DEBUG', value: 'false', type: 'boolean', isOptional: false },
		{ key: 'NODE_ENV', value: '', type: 'string', isOptional: true, defaultValue: 'production' },
	];

	it('generates header comment', () => {
		const code = gen().generate(entries);
		expect(code).toContain('DO NOT EDIT');
	});

	it('generates ENV_NAMES array', () => {
		const code = gen().generate(entries);
		expect(code).toContain(
			"export const ENV_NAMES = ['API_URL', 'DB_PORT', 'DEBUG', 'NODE_ENV'] as const;",
		);
	});

	it('generates envSchema', () => {
		const code = gen().generate(entries);
		expect(code).toContain('export const envSchema = z.object({');
	});

	it('generates type alias with correct typeName', () => {
		const code = gen().generate(entries);
		expect(code).toContain('export type EnvironmentVariables = z.infer<typeof envSchema>;');
	});

	it('respects custom typeName', () => {
		const code = gen({ typeName: 'Env' }).generate(entries);
		expect(code).toContain('export type Env = z.infer<typeof envSchema>;');
	});

	it('does NOT include getEnvs when generateGetEnvs: false', () => {
		const code = gen().generate(entries);
		expect(code).not.toContain('export const getEnvs');
	});

	it('includes getEnvs when generateGetEnvs: true', () => {
		const code = gen({ generateGetEnvs: true }).generate(entries);
		expect(code).toContain('export const getEnvs');
		expect(code).toContain('process.env[name]');
	});

	it('uses import.meta.env when configured', () => {
		const code = gen({ generateGetEnvs: true, envSource: 'import.meta.env' }).generate(entries);
		expect(code).toContain('import.meta.env[name]');
	});

	it('snapshot — full generated file', () => {
		const code = gen().generate(entries);
		expect(code).toMatchSnapshot();
	});
});
