import type { Adapter, AdapterName, PackageJsonLike } from "./types.js";
import { nodeAdapter } from "./node.js";
import { nextAdapter } from "./next.js";
import { viteAdapter } from "./vite.js";
import { astroAdapter } from "./astro.js";
import { cloudflareAdapter } from "./cloudflare.js";
import { denoAdapter } from "./deno.js";
import { bunAdapter } from "./bun.js";

export {
	nodeAdapter,
	nextAdapter,
	viteAdapter,
	astroAdapter,
	cloudflareAdapter,
	denoAdapter,
	bunAdapter,
};
export type { Adapter, AdapterName, PackageJsonLike } from "./types.js";

export const BUILT_IN_ADAPTERS: Record<AdapterName, Adapter> = {
	node: nodeAdapter,
	next: nextAdapter,
	vite: viteAdapter,
	astro: astroAdapter,
	cloudflare: cloudflareAdapter,
	deno: denoAdapter,
	bun: bunAdapter,
};

const DETECTION_ORDER: Adapter[] = [
	nextAdapter,
	astroAdapter,
	viteAdapter,
	cloudflareAdapter,
	bunAdapter,
];

export function detectAdapter(pkg: PackageJsonLike): Adapter {
	for (const adapter of DETECTION_ORDER) {
		if (adapter.detect?.(pkg)) return adapter;
	}
	return nodeAdapter;
}

export function resolveAdapter(name: string): Adapter {
	if (name in BUILT_IN_ADAPTERS) {
		return BUILT_IN_ADAPTERS[name as AdapterName];
	}
	throw new Error(
		`Unknown framework "${name}". Expected one of: ${Object.keys(BUILT_IN_ADAPTERS).join(", ")}, or "auto".`,
	);
}
