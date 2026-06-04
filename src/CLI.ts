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
import {
	BUILT_IN_ADAPTERS,
	detectAdapter,
	resolveAdapter,
	nodeAdapter,
	viteAdapter,
} from "./adapters/index.js";
import type { Adapter, AdapterName, PackageJsonLike } from "./adapters/types.js";

const IGNORED_DIRS = new Set([
	"node_modules",
	"dist",
	"build",
	".git",
	".next",
	".turbo",
	"coverage",
]);

export type EnvSourceOption = "auto" | "process.env" | "import.meta.env";
export type FrameworkOption = "auto" | AdapterName;

export interface CliOptions {
	outDir: string;
	outFile: string;
	envSource: EnvSourceOption;
	framework: FrameworkOption;
	typeName: string;
	recursive: boolean;
	envFile?: string;
}

export const DEFAULT_OPTIONS: CliOptions = {
	outDir: "src/constants",
	outFile: "env.generated.ts",
	envSource: "auto",
	framework: "auto",
	typeName: "EnvironmentVariables",
	recursive: false,
};

export interface ParsedCli {
	options: CliOptions;
	showHelp: boolean;
	showVersion: boolean;
}

const VALID_FRAMEWORKS: readonly string[] = ["auto", ...Object.keys(BUILT_IN_ADAPTERS)];

export function parseCliArgs(argv: string[]): ParsedCli {
	const { values } = parseArgs({
		args: argv,
		options: {
			"out-dir": { type: "string" },
			"out-file": { type: "string" },
			"env-source": { type: "string" },
			framework: { type: "string" },
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

	const framework = values.framework as string | undefined;
	if (framework && !VALID_FRAMEWORKS.includes(framework)) {
		throw new Error(
			`Invalid --framework value: "${framework}". Expected one of: ${VALID_FRAMEWORKS.join(", ")}`,
		);
	}

	const options: CliOptions = {
		outDir: (values["out-dir"] as string | undefined) ?? DEFAULT_OPTIONS.outDir,
		outFile: (values["out-file"] as string | undefined) ?? DEFAULT_OPTIONS.outFile,
		envSource: (envSource as EnvSourceOption | undefined) ?? DEFAULT_OPTIONS.envSource,
		framework: (framework as FrameworkOption | undefined) ?? DEFAULT_OPTIONS.framework,
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

export const HELP_TEXT = `Usage: zodenvy [options]

Generate a typed, Zod-validated TypeScript file from your .env, and keep
.env.template in sync.

Options:
  --out-dir <dir>          Output directory (default: src/constants)
  --out-file <file>        Output filename (default: env.generated.ts)
  --framework <name>       auto | node | next | vite | astro | cloudflare | deno | bun (default: auto)
  --env-source <source>    auto | process.env | import.meta.env (legacy override, default: auto)
  --type-name <name>       Exported type name (default: EnvironmentVariables)
  --env-file <path>        Path to .env file (default: ./.env)
  -r, --recursive          Recursively scan for every .env under a src/ folder
  -h, --help               Show this help
  -v, --version            Show version

Examples:
  zodenvy
  zodenvy --framework next
  zodenvy --framework cloudflare --out-dir src/env
  zodenvy --recursive
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
		const adapter = this.resolveAdapter(pkgDir);

		const generatorOptions: GeneratorOptions = {
			envSource: adapter.envAccessor("X").startsWith("import.meta.env")
				? "import.meta.env"
				: "process.env",
			typeName: this.options.typeName,
			generateGetEnvs: true,
			adapter,
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
		console.log(`✅ ${label} (${adapter.name}) → ${outLabel} (${counts})`);
	}

	private resolveAdapter(pkgDir: string): Adapter {
		if (this.options.framework !== "auto") {
			return resolveAdapter(this.options.framework);
		}

		if (this.options.envSource === "process.env") return nodeAdapter;
		if (this.options.envSource === "import.meta.env") return viteAdapter;

		const pkg = this.readPackageJson(pkgDir);
		return pkg ? detectAdapter(pkg) : nodeAdapter;
	}

	private readPackageJson(pkgDir: string): PackageJsonLike | null {
		const pkgPath = join(pkgDir, "package.json");
		if (!existsSync(pkgPath) || !statSync(pkgPath).isFile()) return null;
		try {
			return JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJsonLike;
		} catch {
			return null;
		}
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
}
