import type { Adapter } from "./types.js";

export const bunAdapter: Adapter = {
	name: "bun",
	shape: "direct",
	envAccessor: (varName) => `Bun.env.${varName}`,
	detect: (pkg) => {
		const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
		return "bun" in deps || "bun-types" in deps || "@types/bun" in deps;
	},
};
