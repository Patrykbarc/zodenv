import type { Adapter } from "./types.js";

export const astroAdapter: Adapter = {
	name: "astro",
	shape: "direct",
	envAccessor: (varName) => `import.meta.env.${varName}`,
	splitPublicPrefix: "PUBLIC_",
	detect: (pkg) => "astro" in { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) },
};
