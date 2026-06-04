import type { Adapter } from "./types.js";

const CF_DEPS = ["wrangler", "@cloudflare/workers-types"];

export const cloudflareAdapter: Adapter = {
	name: "cloudflare",
	shape: "factory",
	envAccessor: (varName) => `env.${varName}`,
	detect: (pkg) => {
		const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
		return CF_DEPS.some((d) => d in deps);
	},
};
