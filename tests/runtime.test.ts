import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createGetEnvs } from '../src/runtime.js';

describe('createGetEnvs', () => {
	const schema = z.object({
		API_URL: z.string().min(1),
		DB_PORT: z.coerce.number(),
		DEBUG: z.enum(['true', 'false']).transform((v) => v === 'true'),
	});

	it('returns parsed object from envSource', () => {
		const env = { API_URL: 'https://example.com', DB_PORT: '3000', DEBUG: 'true' };
		const getEnvs = createGetEnvs(schema, env);
		const result = getEnvs();

		expect(result.API_URL).toBe('https://example.com');
		expect(result.DB_PORT).toBe(3000);
		expect(result.DEBUG).toBe(true);
	});

	it('"false" for boolean → false (not true)', () => {
		const env = { API_URL: 'https://x.com', DB_PORT: '5432', DEBUG: 'false' };
		const getEnvs = createGetEnvs(schema, env);
		expect(getEnvs().DEBUG).toBe(false);
	});

	it('throws ZodError when required field is missing', () => {
		const env = { DB_PORT: '3000', DEBUG: 'true' }; // missing API_URL
		const getEnvs = createGetEnvs(schema, env);
		expect(() => getEnvs()).toThrow();
	});

	it('returns cached result on second call', () => {
		const env = { API_URL: 'https://example.com', DB_PORT: '8080', DEBUG: 'false' };
		const getEnvs = createGetEnvs(schema, env);
		const first = getEnvs();
		const second = getEnvs();
		expect(first).toBe(second); // same reference
	});

	it('uses custom envSource instead of process.env', () => {
		const customEnv = { API_URL: 'https://custom.com', DB_PORT: '9999', DEBUG: 'true' };
		const getEnvs = createGetEnvs(schema, customEnv);
		expect(getEnvs().API_URL).toBe('https://custom.com');
		expect(getEnvs().DB_PORT).toBe(9999);
	});
});
