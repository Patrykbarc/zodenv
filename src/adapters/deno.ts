import type { Adapter } from "./types.js";

export const denoAdapter: Adapter = {
	name: "deno",
	shape: "direct",
	envAccessor: (varName) => `Deno.env.get("${varName}")`,
};
