import type { Adapter } from "./types.js";

export const viteAdapter: Adapter = {
	name: "vite",
	shape: "direct",
	envAccessor: (varName) => `import.meta.env.${varName}`,
	splitPublicPrefix: "VITE_",
	detect: (pkg) => {
		const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
		if ("vite" in deps) return true;
		return Object.keys(deps).some((d) => d.startsWith("@vitejs/"));
	},
};
