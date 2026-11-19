import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: {
			vitest: './src/vitest.ts',
			node: './src/node.ts',
			sinon: './src/sinon.ts',
		},
		platform: 'neutral',
		dts: true,
		deps: {
			neverBundle: [/^vitest$/, /^@vitest\//, /^node:/, /^sinon$/],
		},
	},
]);
