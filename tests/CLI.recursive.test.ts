import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CLI } from "../src/CLI.js";
import { EnvParser } from "../src/EnvParser.js";
import { TemplateSync } from "../src/TemplateSync.js";

const writePkg = (dir: string, pkg: Record<string, unknown>) => {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2), "utf-8");
};

const writeEnv = (dir: string, content: string) => {
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(join(dir, ".env"), content, "utf-8");
};

const makeRecursiveCli = () => new CLI(new EnvParser(), new TemplateSync(), { recursive: true });

describe("CLI --recursive mode", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "zodenvy-recursive-test-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("generates env.generated.ts for every package with a .env + src/", async () => {
		writePkg(join(root, "apps/api"), { name: "api" });
		writeEnv(join(root, "apps/api"), "PORT=3000\nDATABASE_URL=postgres://x\n");

		writePkg(join(root, "apps/web"), {
			name: "web",
			dependencies: { astro: "^6.0.0" },
		});
		writeEnv(join(root, "apps/web"), "API_URL=https://api.example.com\n");

		await makeRecursiveCli().run(root);

		const apiOut = readFileSync(join(root, "apps/api/src/constants/env.generated.ts"), "utf-8");
		expect(apiOut).toContain("process.env.PORT");
		expect(apiOut).toContain("process.env.DATABASE_URL");
		expect(apiOut).not.toContain("process.env[name]");
		expect(apiOut).toContain("'PORT'");
		expect(apiOut).toContain("'DATABASE_URL'");

		const webOut = readFileSync(join(root, "apps/web/src/constants/env.generated.ts"), "utf-8");
		expect(webOut).toContain("import.meta.env.API_URL");
		expect(webOut).not.toContain("import.meta.env[name]");
		expect(webOut).toContain("'API_URL'");
	});

	it("syncs .env.template next to each .env", async () => {
		writePkg(join(root, "packages/db"), { name: "db" });
		writeEnv(join(root, "packages/db"), "DATABASE_URL=postgres://localhost/x\n");

		await makeRecursiveCli().run(root);

		const tpl = readFileSync(join(root, "packages/db/.env.template"), "utf-8");
		expect(tpl).toContain("DATABASE_URL=");
	});

	it("skips node_modules and hidden directories", async () => {
		writePkg(join(root, "apps/api"), { name: "api" });
		writeEnv(join(root, "apps/api"), "PORT=3000\n");

		mkdirSync(join(root, "node_modules/some-pkg/src"), { recursive: true });
		writeFileSync(join(root, "node_modules/some-pkg/.env"), "BOGUS=1\n");

		mkdirSync(join(root, ".cache/inner/src"), { recursive: true });
		writeFileSync(join(root, ".cache/inner/.env"), "NOPE=1\n");

		await makeRecursiveCli().run(root);

		expect(existsSync(join(root, "node_modules/some-pkg/src/constants/env.generated.ts"))).toBe(
			false,
		);
		expect(existsSync(join(root, ".cache/inner/src/constants/env.generated.ts"))).toBe(false);
		expect(existsSync(join(root, "apps/api/src/constants/env.generated.ts"))).toBe(true);
	});

	it("skips .env files in directories without src/", async () => {
		writePkg(root, { name: "monorepo" });
		writeFileSync(join(root, ".env"), "POSTGRES_USER=blog\n", "utf-8");

		await makeRecursiveCli().run(root);

		expect(existsSync(join(root, "src/constants/env.generated.ts"))).toBe(false);
	});

	it("detects envSource from @vitejs/* packages", async () => {
		writePkg(join(root, "apps/vue-app"), {
			name: "vue-app",
			devDependencies: { "@vitejs/plugin-vue": "^5.0.0" },
		});
		writeEnv(join(root, "apps/vue-app"), "API_URL=https://x\n");

		await makeRecursiveCli().run(root);

		const out = readFileSync(join(root, "apps/vue-app/src/constants/env.generated.ts"), "utf-8");
		expect(out).toContain("import.meta.env.API_URL");
		expect(out).not.toContain("import.meta.env[name]");
	});

	it("respects custom --out-dir / --out-file / --type-name", async () => {
		writePkg(join(root, "apps/api"), { name: "api" });
		writeEnv(join(root, "apps/api"), "PORT=3000\n");

		const cli = new CLI(new EnvParser(), new TemplateSync(), {
			recursive: true,
			outDir: "src/env",
			outFile: "schema.ts",
			typeName: "Env",
		});
		await cli.run(root);

		const outPath = join(root, "apps/api/src/env/schema.ts");
		expect(existsSync(outPath)).toBe(true);
		const content = readFileSync(outPath, "utf-8");
		expect(content).toContain("export type Env = z.infer<typeof envSchema>;");
	});
});
