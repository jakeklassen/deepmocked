# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**deepmocked** provides `createMock<T>()`: type-safe deep mocks for TypeScript tests, originally a port of [@golevelup/ts-jest](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-jest). It was previously published as `vitest-create-mock`.

It is a mock-library-agnostic core plus one adapter per mock library, each exposed as a subpath export: `deepmocked/vitest`, `deepmocked/node` (`node:test`) and `deepmocked/sinon`. A `jest` adapter is planned.

## Package Manager

This project uses **pnpm** (not npm or yarn). Always use `pnpm` commands.

## Common Commands

### Development

- `pnpm run dev` - Rebuild on file changes (tsdown --watch)
- `pnpm run build` - Build the library using tsdown
- `pnpm run typecheck` - Type check without emitting files

### Testing

- `pnpm run test` - Run the Vitest tests
- `pnpm run test:node` - Build, then run the `node:test` and Sinon adapters' tests under `node --test` against `dist/`
- `pnpm run check:package` - Pack the tarball (`prepack` builds), install it into a consumer under `tmp/`, type-check the fixtures in [test/package/](test/package/) against it (nodenext and bundler, no skipLibCheck) and import every entry point. Add type assertions there for anything consumers rely on.
- `pnpm run test -- path/to/file.test.ts` - Run a single test file

### Release

- `pnpm run release` - Bump version and publish to npm. The user runs this themselves.

## Architecture

### Source Structure

- [src/core/types.ts](src/core/types.ts) - `DeepMocked<T, M>`, `PartialFuncReturn<T, M>`, `MockOptions`. Written once and parameterized by a `MockKind` (`M`), which each adapter extends to supply its library's mock type (TypeScript has no higher-kinded types, so `MockOf<M, F>` looks up `(M & { fn: F })['mock']`). `MockKind.fn` must stay `unknown`: a function-typed base would intersect a permissive `(...args: any[]) => any` signature into every mocked function. Adapter kinds are internal (not exported).
- [src/core/create-mock.ts](src/core/create-mock.ts) - The proxy engine and `createMockFactory(adapter)`. Imports no mock library. A `MockAdapter` supplies `fn` (create a mock with a given default implementation), `isMock` and `apiKeys` (the library's Mock API, passed through instead of auto-mocked). An auto-mocked function's default implementation returns the nested auto-mock (or throws in strict mode), so the library's own call records match what callers get, user stubs replace it, and reset/restore bring it back; there is no call interception. On an auto-mocked function, the underlying mock's own properties that aren't in `apiKeys` are library internals and auto-mock (except `length`/`name`/`prototype`); passthrough methods are called with the raw mock as `this` so library internals never go through the proxy. Plain objects nested in a partial are deep-mocked via the same proxy; existing mocks (tracked in a WeakSet), class instances and arrays are not, and non-configurable read-only values (frozen objects) must be returned as-is to respect proxy invariants.
- [src/vitest.ts](src/vitest.ts) - The Vitest adapter and the `deepmocked/vitest` entry. It must import `vi` from `vitest` itself (not a separate `@vitest/spy`) so `vi.clearAllMocks()` and Vitest's `clearMocks` option reach these mocks.
- [src/node.ts](src/node.ts) - The `node:test` adapter (`deepmocked/node`). Its whole API is on `fn.mock`, the only passthrough key. It wraps implementations in a fresh function before `mock.fn()`, which can't proxy functions that already have a non-configurable `mock` (e.g. a Vitest mock). Mocked functions are typed as our deep-mocked signature plus `{ mock: MockFunctionContext<F> }`, not `node:test`'s `Mock<F>` (which re-adds `F` and its overloads).
- [src/sinon.ts](src/sinon.ts) - The Sinon adapter (`deepmocked/sinon`). Mocks are `sinon.stub().callsFake(impl)`. `apiKeys` is an explicit allowlist of Sinon's public spy/stub API (a stub has ~110 own properties, many with domain-like names such as `get`/`set`/`invoke`), plus what Sinon itself reads off stubs we hand it: `proxy` (must read undefined or `sinon.assert` recurses forever), `id`/`callIds` (cross-stub checks), `isSinonProxy`, `Symbol(SinonType)`. Each stub overrides its own `resetBehavior` to restore the default implementation, because every Sinon reset path goes through it.
- Tests live next to the source as `*.test.ts`. [src/vitest.test.ts](src/vitest.test.ts) runs under Vitest. [src/node.test.ts](src/node.test.ts) runs under `node --test` (excluded in [vitest.config.ts](vitest.config.ts)), imports `deepmocked/node` so Node resolves it to `dist/` via `exports`, and type-checks against `src/` via `paths` in tsconfig.json.

Adding an adapter: create `src/<lib>.ts`, add it to `entry` in [tsdown.config.ts](tsdown.config.ts) and to `exports` in package.json, add the library as an optional peer dependency, run its tests under the library's own runner in CI ([.github/workflows/unit-test.yml](.github/workflows/unit-test.yml)), and add a consumer fixture to [test/package/](test/package/) plus its import to [scripts/check-package.mjs](scripts/check-package.mjs).

### Build System

**tsdown** (not tsc or other bundlers), configured in [tsdown.config.ts](tsdown.config.ts): one entry per adapter, platform neutral, mock libraries never bundled. Declarations are generated with oxc because `isolatedDeclarations` is on, so exported values need explicit types.

### TypeScript Configuration

TypeScript 7 (native `tsc`), strict, `module: preserve` with bundler resolution, `noUnusedLocals`, `isolatedDeclarations`.

### Scratch Work

Put throwaway files and trial projects in `tmp/` (gitignored, and excluded from Vitest), never in the system `/tmp`.
