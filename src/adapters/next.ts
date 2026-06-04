import type { Adapter, PackageJsonLike } from "./types.js";

const allDeps = (pkg: PackageJsonLike): Record<string, string> => ({
	...(pkg.dependencies ?? {}),
	...(pkg.devDependencies ?? {}),
});

export const nextAdapter: Adapter = {
	name: "next",
	shape: "direct",
	envAccessor: (varName) => `process.env.${varName}`,
	splitPublicPrefix: "NEXT_PUBLIC_",
	detect: (pkg) => "next" in allDeps(pkg),
};
