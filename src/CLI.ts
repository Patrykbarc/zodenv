import {
	mkdirSync,
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
	type Dirent,
} from "fs";
import { join, dirname, relative, resolve, isAbsolute } from "path";
import { parseArgs } from "util";
import type { EnvParser } from "./EnvParser.js";
import type { TemplateSync } from "./TemplateSync.js";
import { CodeGenerator, type GeneratorOptions } from "./CodeGenerator.js";

const IGNORED_DIRS = new Set([
	"node_modules",
	"dist",
	"build",
	".git",
	".next",
	".turbo",
	"coverage",
]);

const IMPORT_META_DEPS = ["astro", "vite"];

export type EnvSourceOption = "auto" | "process.env" | "import.meta.env";

export interface CliOptions {
	outDir: string;
	outFile: string;
	envSource: EnvSourceOption;
	typeName: string;
	recursive: boolean;
	envFile?: string;
}

export const DEFAULT_OPTIONS: CliOptions = {
	outDir: "src/constants",
	outFile: "env.generated.ts",
	envSource: "auto",
	typeName: "EnvironmentVariables",
	recursive: false,
};

export interface ParsedCli {
	options: CliOptions;
	showHelp: boolean;
	showVersion: boolean;
}

export function parseCliArgs(argv: string[]): ParsedCli {
	const { values } = parseArgs({
		args: argv,
		options: {
			"out-dir": { type: "string" },
			"out-file": { type: "string" },
			"env-source": { type: "string" },
			"type-name": { type: "string" },
			recursive: { type: "boolean", short: "r" },
			"env-file": { type: "string" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		strict: true,
		allowPositionals: false,
	});

	const envSource = values["env-source"] as string | undefined;
	if (
		envSource &&
		envSource !== "auto" &&
		envSource !== "process.env" &&
		envSource !== "import.meta.env"
	) {
		throw new Error(
			`Invalid --env-source value: "${envSource}". Expected one of: auto, process.env, import.meta.env`,
		);
	}

	const options: CliOptions = {
		outDir: (values["out-dir"] as string | undefined) ?? DEFAULT_OPTIONS.outDir,
		outFile: (values["out-file"] as string | undefined) ?? DEFAULT_OPTIONS.outFile,
		envSource: (envSource as EnvSourceOption | undefined) ?? DEFAULT_OPTIONS.envSource,
		typeName: (values["type-name"] as string | undefined) ?? DEFAULT_OPTIONS.typeName,
		recursive: Boolean(values.recursive),
		envFile: values["env-file"] as string | undefined,
	};

	return {
		options,
		showHelp: Boolean(values.help),
		showVersion: Boolean(values.version),
	};
}

export const HELP_TEXT = `Usage: zodenv [options]

Generate a typed, Zod-validated TypeScript file from your .env, and keep
.env.template in sync.

Options:
  --out-dir <dir>          Output directory (default: src/constants)
  --out-file <file>        Output filename (default: env.generated.ts)
  --env-source <source>    auto | process.env | import.meta.env (default: auto)
  --type-name <name>       Exported type name (default: EnvironmentVariables)
  --env-file <path>        Path to .env file (default: ./.env)
  -r, --recursive          Recursively scan for every .env under a src/ folder
  -h, --help               Show this help
  -v, --version            Show version

Examples:
  zodenv
  zodenv --out-dir src/env --out-file schema.ts
  zodenv --env-source import.meta.env --type-name Env
  zodenv --recursive
`;

export class CLI {
	private readonly options: CliOptions;

	constructor(
		private parser: EnvParser,
		private templateSync: TemplateSync,
		options: Partial<CliOptions> = {},
	) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	async run(root: string = process.cwd()): Promise<void> {
		if (this.options.recursive) {
			this.runRecursive(root);
		} else {
			this.runSingle(root);
		}
	}

	private runSingle(cwd: string): void {
		const envPath = this.resolveEnvFile(cwd);

		if (!existsSync(envPath)) {
			console.error(`No .env file found at ${envPath}`);
			process.exitCode = 1;
			return;
		}

		this.processEnvFile(envPath, cwd);
	}

	private resolveEnvFile(cwd: string): string {
		const envFile = this.options.envFile;
		if (!envFile) return join(cwd, ".env");
		return isAbsolute(envFile) ? envFile : resolve(cwd, envFile);
	}

	private runRecursive(root: string): void {
		const envFiles = this.findEnvFiles(root).filter((p) => this.isProjectDir(dirname(p)));

		if (envFiles.length === 0) {
			console.log("No project .env files found under", root);
			return;
		}

		for (const envPath of envFiles) {
			this.processEnvFile(envPath, root);
		}
	}

	private isProjectDir(dir: string): boolean {
		const srcPath = join(dir, "src");
		return existsSync(srcPath) && statSync(srcPath).isDirectory();
	}

	private processEnvFile(envPath: string, cwd: string): void {
		const pkgDir = dirname(envPath);
		const envSource =
			this.options.envSource === "auto" ? this.detectEnvSource(pkgDir) : this.options.envSource;

		const generatorOptions: GeneratorOptions = {
			envSource,
			typeName: this.options.typeName,
			generateGetEnvs: true,
		};

		const { entries } = this.parser.parseFile(envPath);

		const outDir = isAbsolute(this.options.outDir)
			? this.options.outDir
			: join(pkgDir, this.options.outDir);

		if (!existsSync(outDir)) {
			mkdirSync(outDir, { recursive: true });
		}

		const outPath = join(outDir, this.options.outFile);
		const code = new CodeGenerator(generatorOptions).generate(entries);
		writeFileSync(outPath, code, "utf-8");

		const templatePath = join(pkgDir, ".env.template");
		const syncResult = this.templateSync.sync(entries, templatePath);

		const label = relative(cwd, pkgDir) || ".";
		const counts = `+${syncResult.added.length} / -${syncResult.removed.length}`;
		const outLabel = `${this.options.outDir}/${this.options.outFile}`;
		console.log(`✅ ${label} (${envSource}) → ${outLabel} (${counts})`);
	}

	private findEnvFiles(root: string): string[] {
		const results: string[] = [];
		this.walk(root, results);
		results.sort();
		return results;
	}

	private walk(dir: string, results: string[]): void {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
				this.walk(fullPath, results);
			} else if (entry.isFile() && entry.name === ".env") {
				results.push(fullPath);
			}
		}
	}

	private detectEnvSource(pkgDir: string): "process.env" | "import.meta.env" {
		const pkgPath = join(pkgDir, "package.json");
		if (!existsSync(pkgPath) || !statSync(pkgPath).isFile()) {
			return "process.env";
		}

		let pkg: {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		try {
			pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		} catch {
			return "process.env";
		}

		const allDeps = {
			...(pkg.dependencies ?? {}),
			...(pkg.devDependencies ?? {}),
		};
		for (const dep of Object.keys(allDeps)) {
			if (IMPORT_META_DEPS.includes(dep) || dep.startsWith("@vitejs/")) {
				return "import.meta.env";
			}
		}
		return "process.env";
	}
}
