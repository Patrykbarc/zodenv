import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { EnvEntry } from './EnvParser.js';

export interface SyncResult {
	added: string[];
	removed: string[];
}

export class TemplateSync {
	sync(entries: EnvEntry[], templatePath: string): SyncResult {
		const added: string[] = [];
		const removed: string[] = [];

		let templateLines: string[] = [];
		if (existsSync(templatePath)) {
			templateLines = readFileSync(templatePath, 'utf-8').split('\n');
		}

		const templateKeys = new Set<string>();
		for (const line of templateLines) {
			const trimmed = line.trim();
			if (trimmed === '' || trimmed.startsWith('#')) continue;
			const eqIndex = trimmed.indexOf('=');
			if (eqIndex !== -1) {
				templateKeys.add(trimmed.slice(0, eqIndex).trim());
			}
		}

		const currentKeys = new Set(entries.map((e) => e.key));

		// Find added (in current but not in template)
		for (const entry of entries) {
			if (!templateKeys.has(entry.key)) {
				added.push(entry.key);
			}
		}

		// Find removed (in template but not in current)
		for (const key of templateKeys) {
			if (!currentKeys.has(key)) {
				removed.push(key);
			}
		}

		// Rebuild template: keep existing lines, add new keys, remove old keys
		const newLines: string[] = [];

		for (const line of templateLines) {
			const trimmed = line.trim();
			if (trimmed !== '' && !trimmed.startsWith('#')) {
				const eqIndex = trimmed.indexOf('=');
				if (eqIndex !== -1) {
					const key = trimmed.slice(0, eqIndex).trim();
					if (!currentKeys.has(key)) continue; // remove it
				}
			}
			newLines.push(line);
		}

		// Add new entries (without values)
		for (const key of added) {
			newLines.push(`${key}=`);
		}

		// Remove trailing empty lines and add single newline
		const content = newLines.join('\n').trimEnd() + '\n';
		writeFileSync(templatePath, content, 'utf-8');

		return { added, removed };
	}
}
