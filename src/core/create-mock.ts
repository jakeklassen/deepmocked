import type { AnyFunction, CreateMock, MockKind, MockOptions } from './types';

/**
 * Everything the core needs to know about a mock library. Each adapter
 * (`deepmocked/vitest`, ...) provides one of these.
 */
export interface MockAdapter {
	/**
	 * Create a mock function, optionally wrapping an implementation. Called without one
	 * for auto-mocked functions.
	 */
	fn: (implementation?: AnyFunction) => AnyFunction;
	/** Whether a value is already a mock function from this library. */
	isMock: (value: unknown) => boolean;
	/**
	 * Called right after an auto-mocked function runs: whether that call was handled by
	 * behavior the user configured. When it wasn't, the call returns a nested auto-mock
	 * instead (or throws in strict mode).
	 */
	isStubbedCall: (mock: AnyFunction, result: unknown) => boolean;
	/**
	 * The library's own API on a mock function (`mockReturnValue`, `mock`, ...). These are
	 * passed straight to the underlying mock instead of being auto-mocked.
	 */
	apiKeys: ReadonlySet<string>;
}

/**
 * Keys every adapter passes through on auto-mocked functions, on top of its own API.
 *
 * `calls`: no supported library has it on its mock functions, so this resolves to
 * undefined. That is deliberate. jest's `expect` treats anything with `calls.all()` and
 * `calls.count()` as a Jasmine spy; without this entry the proxy would auto-mock `calls`
 * and its matchers would read garbage instead of the library's own call records.
 */
const coreApiKeys: ReadonlySet<string> = new Set(['calls']);

/**
 * Builds a `createMock` function for a mock library.
 *
 * @param adapter - How to create and inspect the library's mock functions
 */
export const createMockFactory = <M extends MockKind>(
	adapter: MockAdapter,
): CreateMock<M> => {
	const isApiKey = (key: string) =>
		adapter.apiKeys.has(key) || coreApiKeys.has(key);

	/**
	 * Creates a Proxy that enables deep mocking with automatic property generation.
	 *
	 * @param name - Debug name for the mock (used in error messages)
	 * @param strict - If true, throws errors when calling unstubbed methods
	 * @param base - Optional base object with pre-defined properties/implementations
	 * @returns A proxied object that auto-generates mocks for any accessed property
	 */
	const createProxy = (
		name: string,
		strict: boolean,
		base?: object,
	): object => {
		const cache = new Map<string | number | symbol, unknown>();
		const target: object = base ?? adapter.fn();

		const handler: ProxyHandler<object> = {
			get: (obj, prop, receiver) => {
				const propName = prop.toString();

				// Return undefined for special properties to prevent interference:
				// - 'inspect' & Symbol(util.inspect.custom): Node.js inspection (console.log)
				// - 'then': Prevents mocks from being treated as Promises
				// - 'asymmetricMatch': Prevents interference with asymmetric matchers
				if (
					prop === 'inspect' ||
					prop === 'then' ||
					prop === 'asymmetricMatch' ||
					(typeof prop === 'symbol' &&
						propName === 'Symbol(util.inspect.custom)')
				) {
					return undefined;
				}

				// Never auto-mock Symbol.toStringTag: assertion formatters (loupe, pretty-format)
				// read it and coerce it to a string, which throws on an auto-mocked function and
				// hides the real assertion failure. Real values (own or user-assigned) still work.
				if (prop === Symbol.toStringTag) {
					return Reflect.get(obj, prop, receiver);
				}

				// For auto-mocked functions (no base), allow direct access to the mock
				// library's API so methods like mockImplementation work correctly
				if (!base && isApiKey(propName)) {
					const value: unknown = Reflect.get(obj, prop, receiver);

					if (typeof value !== 'function') {
						return value;
					}

					if (!cache.has(prop)) {
						// Mock API methods return the underlying mock for chaining. Return the
						// proxy instead so chained calls keep auto-mocking, as the types promise.
						cache.set(prop, function (this: unknown, ...args: unknown[]) {
							const result: unknown = Reflect.apply(value, this, args);

							return result === obj ? proxy : result;
						});
					}

					return cache.get(prop);
				}

				// Return cached value if we've already created a mock for this property
				// Ensures consistency: accessing mock.foo twice returns the same mock
				if (cache.has(prop)) {
					return cache.get(prop);
				}

				const existing: unknown = Reflect.get(obj, prop);
				let mockedProp: unknown;

				if (prop in obj) {
					// Property exists in the base object
					// Check for functions - don't double-wrap already mocked functions
					if (typeof existing === 'function') {
						// If it's already a mock (from mock composition), use it as-is
						// Otherwise wrap it in a mock to track calls
						mockedProp = adapter.isMock(existing)
							? existing
							: adapter.fn(existing as AnyFunction);
					} else {
						// Non-function property, use the value directly
						mockedProp = existing;
					}
				} else {
					// Property doesn't exist - auto-generate a nested mock
					// This enables deep access like mock.nested.deeply.whatever
					mockedProp = createProxy(`${name}.${propName}`, strict);
				}

				// Cache the mocked property for consistent return values
				cache.set(prop, mockedProp);

				return mockedProp;
			},
			set: (obj, prop, newValue) => {
				// Update both the cache and the underlying object
				// This allows mock properties to be reassigned: mock.foo = 42
				cache.set(prop, newValue);

				return Reflect.set(obj, prop, newValue);
			},
		};

		// For auto-mocked functions (no base), add apply trap to handle function calls
		if (!base) {
			handler.apply = (fnTarget, thisArg, argsArray) => {
				const result: unknown = Reflect.apply(
					fnTarget as AnyFunction,
					thisArg,
					argsArray,
				);

				// If the user stubbed this call, use its result as-is
				if (adapter.isStubbedCall(fnTarget as AnyFunction, result)) {
					return result;
				}

				// Strict mode: throw error if function is called without being stubbed
				if (strict) {
					throw new Error(
						`Method ${name} was called without being explicitly stubbed`,
					);
				}

				// Auto-generate a mock for the return value
				// Cache it so repeated calls return the same mock object
				if (!cache.has('__apply')) {
					cache.set('__apply', createProxy(name, strict));
				}

				return cache.get('__apply');
			};
		}

		const proxy = new Proxy(target, handler);

		return proxy;
	};

	return ((partial: object = {}, options: MockOptions = {}) => {
		const { name = 'mock', strict = false } = options;

		return createProxy(name, strict, partial);
	}) as CreateMock<M>;
};
