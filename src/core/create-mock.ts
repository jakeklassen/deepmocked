import type { AnyFunction, CreateMock, MockKind, MockOptions } from './types';

/**
 * Everything the core needs to know about a mock library. Each adapter
 * (`deepmocked/vitest`, ...) provides one of these.
 */
export interface MockAdapter {
	/**
	 * Create a mock function with a default implementation. For auto-mocked functions
	 * the core passes one that returns a nested auto-mock (or throws in strict mode), so
	 * the library records what callers actually receive. Stubs the user configures
	 * replace it, and resetting/restoring the mock brings it back.
	 */
	fn: (implementation: AnyFunction) => AnyFunction;
	/** Whether a value is already a mock function from this library. */
	isMock: (value: unknown) => boolean;
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

/** `util.inspect.custom` from Node, looked up without importing `node:util`. */
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

/** Every proxy created by any adapter, so existing mocks are never wrapped again. */
const mocks = new WeakSet<object>();

/** Objects created with `{}` or `Object.create(null)`: the ones nested partials deep-mock. */
const isPlainObject = (value: unknown): value is object => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const prototype: unknown = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
};

/**
 * A proxy's get trap must return the exact value of a non-configurable, read-only
 * property (e.g. on a frozen object), so those can't be wrapped.
 */
const mustReturnAsIs = (obj: object, prop: string | symbol): boolean => {
	const descriptor = Reflect.getOwnPropertyDescriptor(obj, prop);

	return (
		descriptor !== undefined &&
		!descriptor.configurable &&
		'value' in descriptor &&
		!descriptor.writable
	);
};

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
	 * An auto-mocked function: its default implementation returns the same nested
	 * auto-mock on every call, or throws in strict mode.
	 */
	const createAutoMockedFunction = (name: string, strict: boolean): object => {
		let returned: object | undefined;

		return adapter.fn(function unstubbed(): unknown {
			if (strict) {
				throw new Error(
					`Method ${name} was called without being explicitly stubbed`,
				);
			}

			returned ??= createProxy(name, strict);

			return returned;
		});
	};

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
		const target: object = base ?? createAutoMockedFunction(name, strict);

		const handler: ProxyHandler<object> = {
			get: (obj, prop, receiver) => {
				const propName = prop.toString();

				// Return undefined for special properties to prevent interference:
				// - 'inspect' & util.inspect.custom: Node.js inspection (console.log)
				// - 'then': Prevents mocks from being treated as Promises
				// - 'asymmetricMatch': Prevents interference with asymmetric matchers
				if (
					prop === 'inspect' ||
					prop === 'then' ||
					prop === 'asymmetricMatch' ||
					prop === inspectCustom
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

				// Values a proxy may not replace (e.g. on frozen partials) pass through untouched
				if (mustReturnAsIs(obj, prop)) {
					return Reflect.get(obj, prop);
				}

				// Return cached value if we've already created a mock for this property
				// Ensures consistency: accessing mock.foo twice returns the same mock
				if (cache.has(prop)) {
					return cache.get(prop);
				}

				const existing: unknown = Reflect.get(obj, prop);
				let mockedProp: unknown;

				if (prop in obj) {
					if (typeof existing === 'function') {
						// If it's already a mock (from mock composition), use it as-is
						// Otherwise wrap it in a mock to track calls
						mockedProp = adapter.isMock(existing)
							? existing
							: adapter.fn(existing as AnyFunction);
					} else if (isPlainObject(existing) && !mocks.has(existing)) {
						// A nested partial: deep-mock it like the root, so its methods become
						// mocks and missing keys auto-mock (class instances, arrays, etc. are
						// left as-is)
						mockedProp = createProxy(`${name}.${propName}`, strict, existing);
					} else {
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

		const proxy = new Proxy(target, handler);
		mocks.add(proxy);

		return proxy;
	};

	return ((partial: object = {}, options: MockOptions = {}) => {
		const { name = 'mock', strict = false } = options;

		return createProxy(name, strict, partial);
	}) as CreateMock<M>;
};
