import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: { index: 'src/index.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		clean: true,
		sourcemap: true,
		external: ['zod'],
	},
	{
		entry: { cli: 'src/cli-entry.ts' },
		format: ['cjs'],
		dts: false,
		clean: false,
		sourcemap: true,
		outputOptions: {
			banner: '#!/usr/bin/env node',
		},
		external: ['zod'],
	},
]);
