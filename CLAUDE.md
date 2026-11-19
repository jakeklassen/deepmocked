# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**deepmocked** provides `createMock<T>()`: type-safe deep mocks for TypeScript tests, originally a port of [@golevelup/ts-jest](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-jest). It was previously published as `vitest-create-mock`.

It is a mock-library-agnostic core plus one adapter per mock library, each exposed as a subpath export (`deepmocked/vitest`; `node`, `sinon` and `jest` adapters are planned).

## Package Manager

This project uses **pnpm** (not npm or yarn). Always use `pnpm` commands.

## Common Commands

### Development

- `pnpm run dev` - Rebuild on file changes (tsdown --watch)
- `pnpm run build` - Build the library using tsdown
- `pnpm run typecheck` - Type check without emitting files

### Testing

- `pnpm run test` - Run all tests with Vitest
- `pnpm run test -- path/to/file.test.ts` - Run a single test file

### Release

- `pnpm run release` - Bump version and publish to npm. The user runs this themselves.

## Architecture

### Source Structure

- [src/core/types.ts](src/core/types.ts) - `DeepMocked<T, M>`, `PartialFuncReturn<T, M>`, `MockOptions`. Written once and parameterized by a `MockKind` (`M`), which each adapter extends to supply its library's mock type (TypeScript has no higher-kinded types, so `MockOf<M, F>` looks up `(M & { fn: F })['mock']`).
- [src/core/create-mock.ts](src/core/create-mock.ts) - The proxy engine and `createMockFactory(adapter)`. Imports no mock library. A `MockAdapter` supplies `fn`, `isMock`, `hasImplementation` and `apiKeys` (the library's Mock API, passed through instead of auto-mocked).
- [src/vitest.ts](src/vitest.ts) - The Vitest adapter and the `deepmocked/vitest` entry. It must import `vi` from `vitest` itself (not a separate `@vitest/spy`) so `vi.clearAllMocks()` and Vitest's `clearMocks` option reach these mocks.
- Tests live next to the source as `*.test.ts` (e.g. [src/vitest.test.ts](src/vitest.test.ts)).

Adding an adapter: create `src/<lib>.ts`, add it to `entry` in [tsdown.config.ts](tsdown.config.ts) and to `exports` in package.json, and add the library as an optional peer dependency.

### Build System

**tsdown** (not tsc or other bundlers), configured in [tsdown.config.ts](tsdown.config.ts): one entry per adapter, platform neutral, mock libraries never bundled. Declarations are generated with oxc because `isolatedDeclarations` is on, so exported values need explicit types.

### TypeScript Configuration

TypeScript 7 (native `tsc`), strict, `module: preserve` with bundler resolution, `noUnusedLocals`, `isolatedDeclarations`.

### Scratch Work

Put throwaway files and trial projects in `tmp/` (gitignored, and excluded from Vitest), never in the system `/tmp`.
