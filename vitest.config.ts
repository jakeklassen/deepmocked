import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// tmp/ holds throwaway consumer projects with their own vitest copy
		exclude: [...configDefaults.exclude, 'tmp/**'],
	},
});
