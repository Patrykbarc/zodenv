import type { ZodObject, ZodRawShape, z } from 'zod';

type EnvSource = Record<string, string | undefined>;

export function createGetEnvs<T extends ZodRawShape>(
	schema: ZodObject<T>,
	envSource: EnvSource = process.env as EnvSource,
): () => z.infer<ZodObject<T>> {
	let cached: z.infer<ZodObject<T>> | undefined;

	return (): z.infer<ZodObject<T>> => {
		if (cached !== undefined) return cached;

		const keys = Object.keys(schema.shape);
		const raw = Object.fromEntries(keys.map((k) => [k, envSource[k]]));
		cached = schema.parse(raw);
		return cached;
	};
}
