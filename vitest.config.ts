import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: [
			...configDefaults.exclude,
			// tmp/ holds throwaway consumer projects with their own vitest copy
			'tmp/**',
			// run under `node --test` instead: pnpm run test:node
			'src/node.test.ts',
			'src/sinon.test.ts',
		],
	},
});
