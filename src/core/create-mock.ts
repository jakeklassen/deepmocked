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

/** Own properties every function has; on an auto-mocked function they keep their real values. */
const functionBuiltins: ReadonlySet<string | symbol> = new Set([
	'length',
	'name',
	'prototype',
]);

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
 * A proxy's get trap must return a property's real value when the target forbids
 * anything else: a non-configurable, read-only data property (e.g. on a frozen object),
 * or a non-configurable accessor without a getter (which must read as undefined).
 */
const mustReturnAsIs = (obj: object, prop: string | symbol): boolean => {
	const descriptor = Reflect.getOwnPropertyDescriptor(obj, prop);

	if (descriptor === undefined || descriptor.configurable) {
		return false;
	}

	return 'value' in descriptor
		? !descriptor.writable
		: descriptor.get === undefined;
};

/**
 * State shared by every proxy created for one `createMock()` call, so the same original
 * value always maps to the same mock: an object referenced twice (or by itself) is one
 * mock, and a function used in two places is one mock function.
 */
interface MockTree {
	readonly strict: boolean;
	readonly objects: WeakMap<object, object>;
	readonly functions: WeakMap<AnyFunction, AnyFunction>;
}

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
	const createAutoMockedFunction = (name: string, tree: MockTree): object => {
		let returned: object | undefined;

		return adapter.fn(function unstubbed(): unknown {
			if (tree.strict) {
				throw new Error(
					`Method ${name} was called without being explicitly stubbed`,
				);
			}

			returned ??= createProxy(name, tree);

			return returned;
		});
	};

	/**
	 * The one mock function for a function found on a mock's target.
	 *
	 * @param instance - Set when the function is a method of a class-instance partial:
	 *   it then runs as that instance, so `#private` fields work. Otherwise it gets the
	 *   call-site `this` (the mock).
	 */
	const mockFunction = (
		fn: AnyFunction,
		tree: MockTree,
		instance?: object,
	): AnyFunction => {
		if (adapter.isMock(fn)) {
			return fn;
		}

		let mocked = tree.functions.get(fn);

		if (!mocked) {
			const implementation = instance
				? function (this: unknown, ...args: unknown[]): unknown {
						return Reflect.apply(fn, instance, args);
					}
				: fn;

			mocked = adapter.fn(implementation);
			tree.functions.set(fn, mocked);
		}

		return mocked;
	};

	/**
	 * Creates a Proxy that enables deep mocking with automatic property generation.
	 *
	 * @param name - Debug name for the mock (used in error messages)
	 * @param tree - State shared by the whole mock from one `createMock()` call
	 * @param base - Optional base object with pre-defined properties/implementations
	 * @returns A proxied object that auto-generates mocks for any accessed property
	 */
	const createProxy = (name: string, tree: MockTree, base?: object): object => {
		const target: object = base ?? createAutoMockedFunction(name, tree);
		// A class-instance partial (not a plain object) runs its methods and getters as itself
		const instance = base && !isPlainObject(base) ? base : undefined;
		// Wrappers for the mock library's API methods (auto-mocked functions only)
		const apiMethods = new Map<string | symbol, unknown>();
		// Auto-mocks for keys the target doesn't have
		const autoMocks = new Map<string | symbol, object>();
		// Keys the user assigned or defined through the mock: returned as they are
		const assigned = new Set<string | symbol>();
		// On an auto-mocked function, the mock library's own properties (taken right after
		// creation, so ones the user adds later aren't included) that aren't in its API are
		// internals (e.g. Sinon's `get`/`invoke`), not user data: they auto-mock
		const libraryInternals: ReadonlySet<string | symbol> = base
			? new Set()
			: new Set(
					Reflect.ownKeys(target).filter(
						(key) => !functionBuiltins.has(key) && !isApiKey(key.toString()),
					),
				);

		const forget = (prop: string | symbol) => {
			autoMocks.delete(prop);
			assigned.add(prop);
		};

		const handler: ProxyHandler<object> = {
			get: (obj, prop, receiver) => {
				// Values a proxy may not replace (e.g. on frozen partials) come first: the
				// engine enforces this for every key, including the special ones below
				if (mustReturnAsIs(obj, prop)) {
					return Reflect.get(obj, prop);
				}

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

				const propName = prop.toString();

				// For auto-mocked functions (no base), allow direct access to the mock
				// library's API so methods like mockImplementation work correctly
				if (!base && isApiKey(propName)) {
					const value: unknown = Reflect.get(obj, prop, receiver);

					if (typeof value !== 'function') {
						return value;
					}

					let method = apiMethods.get(prop);

					if (!method) {
						// Call the library's method on the underlying mock itself: its internals
						// (e.g. Sinon's `this.behaviors`) must not go through this proxy and get
						// auto-mocked. It returns that mock for chaining; return the proxy instead
						// so chained calls keep auto-mocking, as the types promise.
						method = (...args: unknown[]) => {
							const result: unknown = Reflect.apply(value, obj, args);

							return result === obj ? proxy : result;
						};
						apiMethods.set(prop, method);
					}

					return method;
				}

				// Assigned values, and the basics every function has, are returned as they are
				if (assigned.has(prop) || (!base && functionBuiltins.has(prop))) {
					return Reflect.get(obj, prop, receiver);
				}

				if (prop in obj && !libraryInternals.has(prop)) {
					// Read live (getters re-run, outside changes show up). Getters run with the
					// mock as `this`, so `this.method()` hits the mock, except on class
					// instances, which run as themselves.
					const value: unknown = Reflect.get(obj, prop, instance ?? receiver);

					if (typeof value === 'function') {
						return mockFunction(value as AnyFunction, tree, instance);
					}

					if (isPlainObject(value) && !mocks.has(value)) {
						// A nested partial: deep-mock it like the root, so its methods become
						// mocks and missing keys auto-mock (class instances, arrays, etc. are
						// left as-is). One mock per object, so shared and circular references
						// keep their identity.
						let nested = tree.objects.get(value);

						if (!nested) {
							nested = createProxy(`${name}.${propName}`, tree, value);
							tree.objects.set(value, nested);
						}

						return nested;
					}

					return value;
				}

				// Property doesn't exist - auto-generate a nested mock
				// This enables deep access like mock.nested.deeply.whatever
				let autoMock = autoMocks.get(prop);

				if (!autoMock) {
					autoMock = createProxy(`${name}.${propName}`, tree);
					autoMocks.set(prop, autoMock);
				}

				return autoMock;
			},
			set: (obj, prop, newValue, receiver) => {
				// mock.foo = 42 writes to the underlying object; on success the key is
				// returned as assigned from then on (a failed write changes nothing)
				const written = Reflect.set(obj, prop, newValue, receiver);

				if (written) {
					forget(prop);
				}

				return written;
			},
			defineProperty: (obj, prop, descriptor) => {
				const defined = Reflect.defineProperty(obj, prop, descriptor);

				if (defined) {
					forget(prop);
				}

				return defined;
			},
			deleteProperty: (obj, prop) => {
				const deleted = Reflect.deleteProperty(obj, prop);

				if (deleted) {
					autoMocks.delete(prop);
					assigned.delete(prop);
				}

				return deleted;
			},
		};

		const proxy = new Proxy(target, handler);
		mocks.add(proxy);

		return proxy;
	};

	return ((partial: object = {}, options: MockOptions = {}) => {
		const tree: MockTree = {
			strict: options.strict ?? false,
			objects: new WeakMap(),
			functions: new WeakMap(),
		};

		return createProxy(options.name ?? 'mock', tree, partial);
	}) as CreateMock<M>;
};
