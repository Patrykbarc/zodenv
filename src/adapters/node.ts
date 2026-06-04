import type { Adapter } from "./types.js";

export const nodeAdapter: Adapter = {
	name: "node",
	shape: "direct",
	envAccessor: (varName) => `process.env.${varName}`,
};
