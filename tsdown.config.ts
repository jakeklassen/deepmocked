import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: { vitest: './src/vitest.ts', node: './src/node.ts' },
		platform: 'neutral',
		dts: true,
		deps: {
			neverBundle: [/^vitest$/, /^@vitest\//, /^node:/],
		},
	},
]);
