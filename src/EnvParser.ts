import { readFileSync, statSync } from 'fs';

export interface EnvEntry {
	key: string;
	value: string;
	type: 'string' | 'number' | 'boolean';
	isOptional: boolean;
	defaultValue?: string;
}

export interface ParseResult {
	entries: EnvEntry[];
	rawValues: Map<string, string>;
}

export class EnvParser {
	parse(content: string): ParseResult {
		const entries: EnvEntry[] = [];
		const rawValues = new Map<string, string>();
		const lines = content.split('\n');
		let pendingComments: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();

			if (trimmed === '') {
				pendingComments = [];
				continue;
			}

			if (trimmed.startsWith('#')) {
				pendingComments.push(trimmed);
				continue;
			}

			const eqIndex = trimmed.indexOf('=');
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex).trim();
			const value = trimmed.slice(eqIndex + 1).trim();

			if (!key) continue;

			rawValues.set(key, value);

			const annotations = this.parseAnnotations(pendingComments);
			const inferredType = this.inferType(value);

			const entry: EnvEntry = {
				key,
				value,
				type: annotations.type ?? inferredType,
				isOptional: annotations.isOptional ?? value === '',
				...(annotations.defaultValue !== undefined
					? { defaultValue: annotations.defaultValue, isOptional: true }
					: {}),
			};

			entries.push(entry);
			pendingComments = [];
		}

		return { entries, rawValues };
	}

	parseFile(filePath: string): ParseResult {
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(filePath);
		} catch {
			throw new Error(`File not found: ${filePath}`);
		}
		if (stat.isDirectory()) {
			throw new Error(`Expected a file but got a directory: ${filePath}`);
		}
		const content = readFileSync(filePath, 'utf-8');
		return this.parse(content);
	}

	private inferType(value: string): 'string' | 'number' | 'boolean' {
		if (value === 'true' || value === 'false') return 'boolean';
		if (value !== '' && !isNaN(Number(value))) return 'number';
		return 'string';
	}

	private parseAnnotations(pendingComments: string[]): Partial<EnvEntry> {
		const result: Partial<EnvEntry> = {};

		for (const comment of pendingComments) {
			const body = comment.replace(/^#\s*/, '');

			if (body.startsWith('@type ')) {
				const t = body.slice(6).trim();
				if (t === 'number' || t === 'boolean' || t === 'string') {
					result.type = t;
				}
			} else if (body === '@optional') {
				result.isOptional = true;
			} else if (body.startsWith('@default ')) {
				result.defaultValue = body.slice(9).trim();
			}
		}

		return result;
	}
}
