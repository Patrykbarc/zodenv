export interface PackageJsonLike {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export interface Adapter {
	name: string;
	envAccessor: (varName: string) => string;
	shape: "direct" | "factory";
	splitPublicPrefix?: string;
	imports?: string[];
	detect?: (pkg: PackageJsonLike) => boolean;
}

export type AdapterName = "node" | "next" | "vite" | "astro" | "cloudflare" | "deno" | "bun";
