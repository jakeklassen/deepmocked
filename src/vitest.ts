import type { Mock } from 'vitest';
import { vi } from 'vitest';

import { createMockFactory, type MockAdapter } from './core/create-mock';
import type {
	AnyFunction,
	DeepMocked as CoreDeepMocked,
	MockKind,
	MockOptions,
	PartialFuncReturn as CorePartialFuncReturn,
} from './core/types';

export type { MockOptions };

/** Types every mocked function as Vitest's `Mock`. Internal: not part of the public API. */
interface VitestMockKind extends MockKind {
	readonly mock: this['fn'] extends AnyFunction ? Mock<this['fn']> : never;
}

/**
 * A deeply mocked `T`: every function is a Vitest `Mock`, and nested objects and
 * function return values are deeply mocked too (up to 5 levels).
 */
export type DeepMocked<T> = CoreDeepMocked<T, VitestMockKind>;

/** The partial implementation accepted by `createMock<T>()`. */
export type PartialFuncReturn<T> = CorePartialFuncReturn<T, VitestMockKind>;

/**
 * Vitest's Mock API on a `vi.fn()`. These are passed straight to the underlying
 * mock instead of being auto-mocked.
 */
const apiKeys: ReadonlySet<string> = new Set([
	'getMockImplementation',
	'getMockName',
	'mock',
	'mockClear',
	'mockImplementation',
	'mockImplementationOnce',
	'mockName',
	'mockRejectedValue',
	'mockRejectedValueOnce',
	'mockReset',
	'mockResolvedValue',
	'mockResolvedValueOnce',
	'mockRestore',
	'mockReturnThis',
	'mockReturnValue',
	'mockReturnValueOnce',
	// Added in Vitest 4.1
	'mockThrow',
	'mockThrowOnce',
	'withImplementation',
]);

// Mocks must come from the `vitest` package itself (not a separate copy of
// @vitest/spy) so vi.clearAllMocks() and Vitest's clearMocks option reach them.
const vitestAdapter: MockAdapter = {
	fn: (implementation) => vi.fn(implementation),
	isMock: (value) => vi.isMockFunction(value),
	invoke: (mock, thisArg, args) => {
		// Check before calling: a one-off stub (mockReturnValueOnce, ...) is consumed by
		// the call, so afterwards it would look unstubbed even if it returned undefined
		const hasImplementation = Boolean((mock as Mock).getMockImplementation());
		const result: unknown = Reflect.apply(mock, thisArg, args);

		return { result, stubbed: hasImplementation || result !== undefined };
	},
	apiKeys,
};

/**
 * Creates a deep mock of the specified type with Vitest.
 *
 * Features:
 * - All properties and methods are automatically mocked
 * - Nested properties are also deeply mocked (e.g., `mock.user.address.city`)
 * - Function return values are automatically mocked and awaitable
 * - Supports mock composition: pass existing mocks as partial values
 * - All functions are Vitest mocks with full Mock API support
 *
 * @param partial - Optional object with pre-defined properties/implementations
 * @param options - Optional configuration (name, strict mode)
 * @returns A deeply mocked version of T with all Mock methods available
 *
 * @example
 * ```typescript
 * interface User {
 *   getName: () => string;
 *   getAddress: () => { city: string };
 * }
 *
 * // Auto-mocked
 * const user = createMock<User>();
 * user.getName.mockReturnValue('John');
 * user.getAddress().city; // Automatically mocked
 *
 * // With partial implementation
 * const user = createMock<User>({
 *   getName: () => 'John'
 * });
 *
 * // Mock composition
 * const address = createMock<Address>({ city: 'NYC' });
 * const user = createMock<User>({
 *   getAddress: () => address
 * });
 * ```
 */
export const createMock: <T extends object>(
	partial?: PartialFuncReturn<T>,
	options?: MockOptions,
) => DeepMocked<T> = createMockFactory<VitestMockKind>(vitestAdapter);
