import { describe, it, expect } from 'vitest';
import { EnvParser } from '../src/EnvParser.js';

const parser = new EnvParser();

describe('EnvParser', () => {
	it('parses a simple KEY=value', () => {
		const { entries } = parser.parse('API_URL=https://example.com');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			key: 'API_URL',
			value: 'https://example.com',
			type: 'string',
			isOptional: false,
		});
	});

	it('skips comment-only lines and blank lines', () => {
		const content = `# This is a comment\n\nKEY=value`;
		const { entries } = parser.parse(content);
		expect(entries).toHaveLength(1);
		expect(entries[0].key).toBe('KEY');
	});

	it('infers boolean for true/false values', () => {
		const { entries } = parser.parse('DEBUG=true\nFLAG=false');
		expect(entries[0].type).toBe('boolean');
		expect(entries[1].type).toBe('boolean');
	});

	it('infers number for numeric values', () => {
		const { entries } = parser.parse('DB_PORT=3000');
		expect(entries[0].type).toBe('number');
	});

	it('marks empty value as optional string', () => {
		const { entries } = parser.parse('OPTIONAL_KEY=');
		expect(entries[0].type).toBe('string');
		expect(entries[0].isOptional).toBe(true);
	});

	it('applies @type annotation', () => {
		const content = `# @type number\nSOME_KEY=abc`;
		const { entries } = parser.parse(content);
		expect(entries[0].type).toBe('number');
	});

	it('applies @optional annotation', () => {
		const content = `# @optional\nSOME_KEY=value`;
		const { entries } = parser.parse(content);
		expect(entries[0].isOptional).toBe(true);
	});

	it('applies @default annotation', () => {
		const content = `# @default production\nNODE_ENV=`;
		const { entries } = parser.parse(content);
		expect(entries[0].defaultValue).toBe('production');
		expect(entries[0].isOptional).toBe(true);
	});

	it('clears annotation buffer on blank line', () => {
		const content = `# @type number\n\nSOME_KEY=abc`;
		const { entries } = parser.parse(content);
		// blank line clears the buffer, so type is inferred (string for non-numeric)
		expect(entries[0].type).toBe('string');
	});

	it('@type annotation applies only to next var', () => {
		const content = `# @type number\nFIRST=abc\nSECOND=xyz`;
		const { entries } = parser.parse(content);
		expect(entries[0].type).toBe('number');
		expect(entries[1].type).toBe('string'); // no annotation
	});

	it('populates rawValues map', () => {
		const { rawValues } = parser.parse('FOO=bar\nBAZ=42');
		expect(rawValues.get('FOO')).toBe('bar');
		expect(rawValues.get('BAZ')).toBe('42');
	});
});
