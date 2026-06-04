export { createGetEnvs } from "./runtime.js";
export { EnvParser } from "./EnvParser.js";
export { CodeGenerator } from "./CodeGenerator.js";
export { TemplateSync } from "./TemplateSync.js";
export type { EnvEntry, ParseResult } from "./EnvParser.js";
export type { GeneratorOptions } from "./CodeGenerator.js";
export type { SyncResult } from "./TemplateSync.js";

export {
	nodeAdapter,
	nextAdapter,
	viteAdapter,
	astroAdapter,
	cloudflareAdapter,
	denoAdapter,
	bunAdapter,
	detectAdapter,
	resolveAdapter,
	BUILT_IN_ADAPTERS,
} from "./adapters/index.js";
export type { Adapter, AdapterName, PackageJsonLike } from "./adapters/types.js";
