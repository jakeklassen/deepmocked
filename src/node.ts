import { mock, type Mock } from 'node:test';

import { createMockFactory, type MockAdapter } from './core/create-mock';
import type {
	AnyFunction,
	DeepMocked as CoreDeepMocked,
	MockKind,
	MockOptions,
	PartialFuncReturn as CorePartialFuncReturn,
} from './core/types';

export type { MockOptions };

/** Types every mocked function as `node:test`'s `Mock`. */
export interface NodeMockKind extends MockKind {
	readonly mock: Mock<this['fn']>;
}

/**
 * A deeply mocked `T`: every function is a `node:test` `Mock` (with its `.mock`
 * context), and nested objects and function return values are deeply mocked too
 * (up to 5 levels).
 */
export type DeepMocked<T> = CoreDeepMocked<T, NodeMockKind>;

/** The partial implementation accepted by `createMock<T>()`. */
export type PartialFuncReturn<T> = CorePartialFuncReturn<T, NodeMockKind>;

/**
 * `node:test` keeps its whole Mock API on `fn.mock` (`calls`, `callCount()`,
 * `mockImplementation()`, `restore()`, ...), so that is the only key passed through.
 */
const apiKeys: ReadonlySet<string> = new Set(['mock']);

/**
 * `node:test` has no way to ask a mock whether the user set an implementation. So
 * auto-mocked functions start with a sentinel implementation that records when it
 * runs: if it ran, the call wasn't stubbed. `mockImplementation()` replaces it, and
 * `restore()`, `mock.restoreAll()` and `mock.reset()` bring it back, so auto-mocking
 * resumes after a restore.
 */
const unstubbedCalls = new WeakMap<AnyFunction, { ran: boolean }>();

const nodeAdapter: MockAdapter = {
	fn: (implementation) => {
		if (implementation) {
			return mock.fn(implementation);
		}

		const state = { ran: false };
		const fn = mock.fn(function unstubbed() {
			state.ran = true;
		});

		unstubbedCalls.set(fn, state);

		return fn;
	},
	isMock: (value) => {
		if (typeof value !== 'function') {
			return false;
		}

		const context: unknown = Reflect.get(value, 'mock');

		return (
			typeof context === 'object' &&
			context !== null &&
			typeof Reflect.get(context, 'callCount') === 'function' &&
			typeof Reflect.get(context, 'mockImplementation') === 'function'
		);
	},
	isStubbedCall: (fn) => {
		const state = unstubbedCalls.get(fn);

		if (!state) {
			return true;
		}

		const ran = state.ran;
		state.ran = false;

		return !ran;
	},
	apiKeys,
};

/**
 * Creates a deep mock of the specified type with `node:test`'s `mock.fn()`.
 *
 * Features:
 * - All properties and methods are automatically mocked
 * - Nested properties are also deeply mocked (e.g., `mock.user.address.city`)
 * - Function return values are automatically mocked and awaitable
 * - Supports mock composition: pass existing mocks as partial values
 * - All functions are `node:test` mocks: configure and inspect them through `.mock`
 *
 * Mocks are created on the global `mock` tracker from `node:test`, so
 * `mock.restoreAll()` and `mock.reset()` apply to them.
 *
 * @param partial - Optional object with pre-defined properties/implementations
 * @param options - Optional configuration (name, strict mode)
 * @returns A deeply mocked version of T
 *
 * @example
 * ```typescript
 * import assert from 'node:assert/strict';
 * import { test } from 'node:test';
 * import { createMock } from 'deepmocked/node';
 *
 * interface UserService {
 *   getUser: (id: number) => Promise<{ name: string }>;
 * }
 *
 * test('gets a user', async () => {
 *   const users = createMock<UserService>();
 *   users.getUser.mock.mockImplementation(async () => ({ name: 'Ada' }));
 *
 *   assert.equal((await users.getUser(1)).name, 'Ada');
 *   assert.deepEqual(users.getUser.mock.calls[0].arguments, [1]);
 * });
 * ```
 */
export const createMock: <T extends object>(
	partial?: PartialFuncReturn<T>,
	options?: MockOptions,
) => DeepMocked<T> = createMockFactory<NodeMockKind>(nodeAdapter);
