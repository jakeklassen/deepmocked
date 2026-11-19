// oxlint-disable-next-line typescript/no-explicit-any -- matches any function signature
export type AnyFunction = (...args: any[]) => any;

/**
 * Describes how a mock library types a mocked function, so the core types can be
 * written once and reused by every adapter.
 *
 * TypeScript can't pass a generic type such as `Mock` around as a parameter, so each
 * adapter extends this interface and computes `mock` from `this['fn']`:
 *
 * ```ts
 * interface VitestMockKind extends MockKind {
 *   readonly mock: Mock<this['fn']>;
 * }
 * ```
 */
export interface MockKind {
	readonly fn: AnyFunction;
	readonly mock: unknown;
}

/** The mock type an adapter's library uses for a function of type `F`. */
export type MockOf<K extends MockKind, F extends AnyFunction> = (K & {
	readonly fn: F;
})['mock'];

/**
 * Recursively makes all properties of a type optional and applies the same transformation
 * to nested objects. Arrays are preserved but their elements are made deeply partial.
 * Unknown types are left as-is since we can't make assumptions about their structure.
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U>
		? Array<DeepPartial<U>>
		: T[P] extends ReadonlyArray<infer U>
			? ReadonlyArray<DeepPartial<U>>
			: unknown extends T[P]
				? T[P]
				: DeepPartial<T[P]>;
};

/**
 * Type for the partial object passed to createMock. All properties are optional.
 * - Functions can be provided as implementations OR as already-mocked DeepMocked functions
 *   (enabling mock composition - passing pre-built mocks to other mocks)
 * - Non-function properties can be partial values OR already-mocked DeepMocked objects
 * This dual support prevents double-wrapping and allows flexible mock composition.
 */
export type PartialFuncReturn<T, M extends MockKind> = {
	[K in keyof T]?: T[K] extends (...args: infer A) => infer U
		? ((...args: A) => PartialFuncReturn<U, M>) | DeepMocked<T[K], M>
		: DeepPartial<T[K]> | DeepMocked<T[K], M>;
};

/**
 * Helper to detect if a type is exactly `unknown` (not `any` or other types).
 *
 * Logic breakdown:
 * - `unknown extends T` is true for both `unknown` and `any`
 * - `T extends {}` is true for `any` but false for `unknown`
 * - Therefore: if `unknown extends T` is true AND `T extends {}` is false, then T is `unknown`
 *
 * This is needed because Record<string, unknown> properties should become `any` for
 * proxy support, while concrete types should maintain their proper types.
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- {} intentionally used to detect unknown type
type IsUnknown<T> = unknown extends T ? (T extends {} ? false : true) : false;

/**
 * Tuple type used to track recursion depth in DeepMocked.
 * Each level decrements by removing an element from the tuple.
 */
type DecrementDepth<D extends number[]> = D extends [unknown, ...infer Rest]
	? Rest extends number[]
		? Rest
		: []
	: [];

/**
 * Default recursion depth for DeepMocked (5 levels deep).
 * This allows good typing for most use cases while preventing TypeScript
 * from exploding on extremely complex recursive types like Kysely.
 */
type DefaultDepth = [1, 1, 1, 1, 1];

/**
 * Helper type for mocked functions with depth-aware typing.
 *
 * At shallow depths (close to DefaultDepth): Uses full typing with Parameters<T>
 * and DeepMocked return types for good IDE support with simple interfaces.
 *
 * At deeper depths (approaching 0): Falls back to permissive typing to avoid
 * TypeScript complexity explosion with heavily nested types like Kysely.
 *
 * This allows simple interfaces to remain fully typed while complex nested
 * types gracefully degrade to `any`.
 */
type MockedFunctionWithDepth<
	T extends AnyFunction,
	D extends number[],
	M extends MockKind,
> = D['length'] extends 0 | 1
	? // At depth 0-1: use permissive typing to avoid complexity explosion
		// oxlint-disable-next-line typescript/no-explicit-any -- permissive fallback for deep nesting
		((...args: any[]) => any) & MockOf<M, AnyFunction>
	: // At higher depths: use full typing for good DX
		((
			...args: Parameters<T>
		) => DeepMockedWithDepth<ReturnType<T>, DecrementDepth<D>, M>) &
			MockOf<M, T>;

/**
 * Properties that should be excluded from mocking to prevent interference
 * with JavaScript runtime behavior (e.g., Promise detection).
 */
type ExcludedMockProperties = 'then' | 'asymmetricMatch';

/**
 * Depth-limited version of DeepMocked that stops recursing when depth reaches 0.
 * When depth is exhausted, returns `any` to allow continued chaining without
 * type errors. This is necessary for extremely complex types like Kysely's
 * query builders which have deeply nested generic overloads.
 *
 * Special handling:
 * - Promises: Returns Promise<DeepMocked<T>> instead of deeply mocking Promise itself
 * - Excludes 'then' and 'asymmetricMatch' to prevent interference with runtime behavior
 */
type DeepMockedWithDepth<
	T,
	D extends number[],
	M extends MockKind,
> = D extends []
	? // oxlint-disable-next-line typescript/no-explicit-any -- fallback for exhausted depth - enables chaining on complex types
		any
	: // Handle Promise specially - don't mock the Promise, mock its resolved value
		T extends Promise<infer U>
		? Promise<DeepMockedWithDepth<U, DecrementDepth<D>, M>>
		: {
				[
					K in keyof T as K extends ExcludedMockProperties ? never : K
				]: IsUnknown<T[K]> extends true
					? // oxlint-disable-next-line typescript/no-explicit-any -- unknown types become any for proxy support
						any
					: NonNullable<T[K]> extends AnyFunction
						? undefined extends T[K]
							? MockedFunctionWithDepth<NonNullable<T[K]>, D, M> | undefined
							: MockedFunctionWithDepth<NonNullable<T[K]>, D, M>
						: NonNullable<T[K]> extends object
							? undefined extends T[K]
								? | DeepMockedWithDepth<NonNullable<T[K]>, DecrementDepth<D>, M>
									| undefined
								: DeepMockedWithDepth<T[K], DecrementDepth<D>, M>
							: T[K];
			};

/**
 * Recursively transforms a type into a deeply mocked version, using the mock type
 * of the adapter's library (`M`) for every function.
 * Each property is handled based on its type:
 *
 * 1. Unknown types (e.g., Record<string, unknown>):
 *    - Become `any` to support dynamic proxy access
 *    - Enables `mock.anything.nested.deeply` without type errors
 *
 * 2. Functions:
 *    - Typed as the library's mock type, so its Mock API is available
 *    - Return types are recursively DeepMocked (up to depth limit)
 *    - Optional functions preserve their optionality (union with undefined)
 *    - Example: `mock.getUser()` returns DeepMocked<User> with all Mock methods
 *
 * 3. Objects:
 *    - Recursively transformed to DeepMocked (up to depth limit)
 *    - Optional objects preserve their optionality
 *    - Example: `mock.nested.property` is also deeply mocked
 *
 * 4. Primitives (string, number, boolean, etc.):
 *    - Left as-is since they can't have nested properties
 *
 * The depth limit (default 5 levels) prevents TypeScript from exploding
 * on complex recursive types like Kysely query builders.
 */
export type DeepMocked<T, M extends MockKind> = DeepMockedWithDepth<
	T,
	DefaultDepth,
	M
>;

export type MockOptions = {
	/** Debug name for the mock, used in error messages (default: 'mock') */
	name?: string;
	/** If true, throws errors when calling unstubbed methods (default: false) */
	strict?: boolean;
};

/** Signature of the `createMock` function every adapter exports. */
export type CreateMock<M extends MockKind> = <T extends object>(
	partial?: PartialFuncReturn<T, M>,
	options?: MockOptions,
) => DeepMocked<T, M>;
