// Checks the package as consumers get it: packs the tarball (running `prepack`, which
// builds), installs it into a throwaway consumer under tmp/, then type-checks the
// fixtures in test/package/ against it and imports every entry point at runtime.
//
// Usage: pnpm run check:package
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const work = join(root, 'tmp', 'package-check');
const consumer = join(work, 'consumer');
const modules = join(consumer, 'node_modules');
const tsc = join(root, 'node_modules', '.bin', 'tsc');

const run = (command, args, cwd = root) =>
	execFileSync(command, args, { cwd, stdio: 'inherit' });

rmSync(work, { recursive: true, force: true });
mkdirSync(join(modules, 'deepmocked'), { recursive: true });

// 1. Pack exactly what `npm publish` would upload
run('npm', ['pack', '--pack-destination', work, '--silent']);
const tarball = readdirSync(work).find((file) => file.endsWith('.tgz'));

if (!tarball) {
	throw new Error(`npm pack produced no tarball in ${work}`);
}

// 2. Install it into a consumer. Only the consumer's own deps come from the repo.
run('tar', [
	'-xzf',
	join(work, tarball),
	'-C',
	join(modules, 'deepmocked'),
	'--strip-components=1',
]);
for (const dependency of ['vitest', 'sinon']) {
	symlinkSync(
		join(root, 'node_modules', dependency),
		join(modules, dependency),
	);
}
symlinkSync(join(root, 'node_modules', '@types'), join(modules, '@types'));
cpSync(join(root, 'test', 'package'), consumer, { recursive: true });
writeFileSync(
	join(consumer, 'package.json'),
	JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
);

// 3. Type-check the fixtures under the module settings consumers use. skipLibCheck is
// off so errors in our published .d.ts files can't hide.
for (const [module, moduleResolution] of [
	['nodenext', 'nodenext'],
	['preserve', 'bundler'],
]) {
	console.log(`check-package: tsc (${moduleResolution})`);
	writeFileSync(
		join(consumer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				target: 'esnext',
				module,
				moduleResolution,
				types: ['node'],
				noEmit: true,
				skipLibCheck: false,
				exactOptionalPropertyTypes: true,
			},
			files: ['vitest.ts', 'node.ts', 'sinon.ts'],
		}),
	);
	run(tsc, ['-p', consumer]);
}

// 4. Every export resolves and loads at runtime
for (const entry of [
	'deepmocked/vitest',
	'deepmocked/node',
	'deepmocked/sinon',
]) {
	console.log(`check-package: import ${entry}`);
	run(
		process.execPath,
		[
			'--input-type=module',
			'--eval',
			`const { createMock } = await import(${JSON.stringify(entry)}); if (typeof createMock().anything.deep !== 'function') throw new Error('${entry}: createMock is broken');`,
		],
		consumer,
	);
}

rmSync(work, { recursive: true, force: true });
console.log('check-package: ok');
