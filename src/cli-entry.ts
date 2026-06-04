import { readFileSync } from 'fs';
import { join } from 'path';
import { EnvParser } from './EnvParser.js';
import { TemplateSync } from './TemplateSync.js';
import { CLI, HELP_TEXT, parseCliArgs } from './CLI.js';

const readVersion = (): string => {
	try {
		const pkgPath = join(__dirname, '..', 'package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
		return pkg.version ?? 'unknown';
	} catch {
		return 'unknown';
	}
};

const main = async (): Promise<void> => {
	let parsed;
	try {
		parsed = parseCliArgs(process.argv.slice(2));
	} catch (err) {
		console.error((err as Error).message);
		console.error('\nRun `zodenv --help` for usage.');
		process.exit(1);
	}

	if (parsed.showHelp) {
		console.log(HELP_TEXT);
		return;
	}

	if (parsed.showVersion) {
		console.log(readVersion());
		return;
	}

	const cli = new CLI(new EnvParser(), new TemplateSync(), parsed.options);
	await cli.run();
};

main().catch((err: unknown) => {
	console.error('Error:', err);
	process.exit(1);
});
