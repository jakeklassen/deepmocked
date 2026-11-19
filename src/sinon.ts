import sinon, { type SinonStub } from 'sinon';

import { createMockFactory, type MockAdapter } from './core/create-mock';
import type {
	AnyFunction,
	DeepMocked as CoreDeepMocked,
	MockKind,
	MockOptions,
	PartialFuncReturn as CorePartialFuncReturn,
} from './core/types';

export type { MockOptions };

/** Sinon stub methods that return the stub itself, for chaining. */
type ChainingMethod =
	| 'returns'
	| 'returnsArg'
	| 'returnsThis'
	| 'resolves'
	| 'resolvesArg'
	| 'resolvesThis'
	| 'rejects'
	| 'throws'
	| 'throwsArg'
	| 'throwsException'
	| 'callsFake'
	| 'callThrough'
	| 'callsArg'
	| 'callsArgAsync'
	| 'callsArgOn'
	| 'callsArgOnAsync'
	| 'callsArgWith'
	| 'callsArgWithAsync'
	| 'callsArgOnWith'
	| 'callsArgOnWithAsync'
	| 'yields'
	| 'yieldsAsync'
	| 'yieldsOn'
	| 'yieldsOnAsync'
	| 'yieldsRight'
	| 'yieldsTo'
	| 'yieldsToAsync'
	| 'yieldsToOn'
	| 'yieldsToOnAsync'
	| 'named'
	| 'resetBehavior'
	| 'withArgs';

/**
 * Sinon's chaining methods, returning `this`. In the intersection that types a mocked
 * function, `this` is the whole mocked function, so `stub.withArgs(1).returns(x)()`
 * keeps the deeply mocked return type instead of falling back to a plain SinonStub.
 * (At runtime these return the mock itself; `withArgs` returns a child stub that
 * falls back to the same default.)
 */
export interface SinonChaining<TArgs extends readonly unknown[], TReturn> {
	returns(...args: Parameters<SinonStub<TArgs, TReturn>['returns']>): this;
	returnsArg(
		...args: Parameters<SinonStub<TArgs, TReturn>['returnsArg']>
	): this;
	returnsThis(
		...args: Parameters<SinonStub<TArgs, TReturn>['returnsThis']>
	): this;
	resolves(...args: Parameters<SinonStub<TArgs, TReturn>['resolves']>): this;
	resolvesArg(
		...args: Parameters<SinonStub<TArgs, TReturn>['resolvesArg']>
	): this;
	resolvesThis(
		...args: Parameters<SinonStub<TArgs, TReturn>['resolvesThis']>
	): this;
	rejects(...args: Parameters<SinonStub<TArgs, TReturn>['rejects']>): this;
	throws(...args: Parameters<SinonStub<TArgs, TReturn>['throws']>): this;
	throwsArg(...args: Parameters<SinonStub<TArgs, TReturn>['throwsArg']>): this;
	throwsException(
		...args: Parameters<SinonStub<TArgs, TReturn>['throwsException']>
	): this;
	callsFake(...args: Parameters<SinonStub<TArgs, TReturn>['callsFake']>): this;
	callThrough(
		...args: Parameters<SinonStub<TArgs, TReturn>['callThrough']>
	): this;
	callsArg(...args: Parameters<SinonStub<TArgs, TReturn>['callsArg']>): this;
	callsArgAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgAsync']>
	): this;
	callsArgOn(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgOn']>
	): this;
	callsArgOnAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgOnAsync']>
	): this;
	callsArgWith(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgWith']>
	): this;
	callsArgWithAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgWithAsync']>
	): this;
	callsArgOnWith(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgOnWith']>
	): this;
	callsArgOnWithAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['callsArgOnWithAsync']>
	): this;
	yields(...args: Parameters<SinonStub<TArgs, TReturn>['yields']>): this;
	yieldsAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsAsync']>
	): this;
	yieldsOn(...args: Parameters<SinonStub<TArgs, TReturn>['yieldsOn']>): this;
	yieldsOnAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsOnAsync']>
	): this;
	yieldsRight(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsRight']>
	): this;
	yieldsTo(...args: Parameters<SinonStub<TArgs, TReturn>['yieldsTo']>): this;
	yieldsToAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsToAsync']>
	): this;
	yieldsToOn(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsToOn']>
	): this;
	yieldsToOnAsync(
		...args: Parameters<SinonStub<TArgs, TReturn>['yieldsToOnAsync']>
	): this;
	named(...args: Parameters<SinonStub<TArgs, TReturn>['named']>): this;
	resetBehavior(
		...args: Parameters<SinonStub<TArgs, TReturn>['resetBehavior']>
	): this;
	withArgs(...args: Parameters<SinonStub<TArgs, TReturn>['withArgs']>): this;
}

/** A Sinon stub whose chaining methods keep the mocked function's type. */
type ChainingSinonStub<TArgs extends readonly unknown[], TReturn> = Omit<
	SinonStub<TArgs, TReturn>,
	ChainingMethod
> &
	SinonChaining<TArgs, TReturn>;

/** Types every mocked function as a Sinon stub. Internal: not part of the public API. */
interface SinonMockKind extends MockKind {
	readonly mock: this['fn'] extends infer F extends AnyFunction
		? ChainingSinonStub<Parameters<F>, ReturnType<F>>
		: never;
}

/**
 * A deeply mocked `T`: every function is a Sinon stub, and nested objects and
 * function return values are deeply mocked too (up to 5 levels).
 */
export type DeepMocked<T> = CoreDeepMocked<T, SinonMockKind>;

/** The partial implementation accepted by `createMock<T>()`. */
export type PartialFuncReturn<T> = CorePartialFuncReturn<T, SinonMockKind>;

/**
 * Sinon's public spy and stub API, passed straight to the underlying stub instead of
 * being auto-mocked.
 *
 * This is an allowlist on purpose. A stub has ~110 own properties, including internals
 * and property-stub methods with common names (`get`, `set`, `value`, `invoke`).
 * Since values returned by unstubbed calls are stubs too, passing those through would
 * break ordinary code like `repo.get(id)`, so they keep auto-mocking.
 */
const apiKeys: ReadonlySet<string> = new Set([
	// Spy: call records and assertions
	'args',
	'called',
	'calledOnce',
	'calledTwice',
	'calledThrice',
	'callCount',
	'notCalled',
	'firstCall',
	'secondCall',
	'thirdCall',
	'lastCall',
	'firstArg',
	'lastArg',
	'thisValues',
	'returnValues',
	'exceptions',
	'getCall',
	'getCalls',
	'calledBefore',
	'calledAfter',
	'calledImmediatelyBefore',
	'calledImmediatelyAfter',
	'calledOn',
	'alwaysCalledOn',
	'calledWith',
	'calledOnceWith',
	'alwaysCalledWith',
	'calledWithExactly',
	'calledOnceWithExactly',
	'alwaysCalledWithExactly',
	'calledWithMatch',
	'calledOnceWithMatch',
	'alwaysCalledWithMatch',
	'calledWithNew',
	'alwaysCalledWithNew',
	'neverCalledWith',
	'neverCalledWithMatch',
	'threw',
	'alwaysThrew',
	'returned',
	'alwaysReturned',
	'callArg',
	'callArgOn',
	'callArgWith',
	'callArgOnWith',
	'yield',
	'yieldOn',
	'yieldTo',
	'yieldToOn',
	'printf',
	'named',
	'displayName',
	'toString',
	'invokeCallback',
	'isSinonProxy',
	// Sinon's type marker, and `proxy`: a stub has none, so this reads as undefined.
	// sinon.assert follows `fake.proxy` when it's a Sinon proxy; an auto-mocked one would
	// look like one and recurse forever.
	'Symbol(SinonType)',
	'proxy',
	// Read off the *other* stub by cross-stub checks (calledBefore/After,
	// calledImmediatelyBefore/After, sinon.assert.callOrder). Trade-off: `id` on an
	// unstubbed auto-mocked value is Sinon's stub id rather than an auto-mock.
	'id',
	'callIds',
	'resetHistory',
	// Stub: behavior
	'returns',
	'returnsArg',
	'returnsThis',
	'resolves',
	'resolvesArg',
	'resolvesThis',
	'rejects',
	'throws',
	'throwsArg',
	'throwsException',
	'callsFake',
	'callThrough',
	'callThroughWithNew',
	'callsArg',
	'callsArgAsync',
	'callsArgOn',
	'callsArgOnAsync',
	'callsArgWith',
	'callsArgWithAsync',
	'callsArgOnWith',
	'callsArgOnWithAsync',
	'yields',
	'yieldsAsync',
	'yieldsOn',
	'yieldsOnAsync',
	'yieldsRight',
	'yieldsRightAsync',
	'yieldsTo',
	'yieldsToAsync',
	'yieldsToOn',
	'yieldsToOnAsync',
	'onCall',
	'onFirstCall',
	'onSecondCall',
	'onThirdCall',
	'withArgs',
	'reset',
	'resetBehavior',
	// Not on a stub, so these read as undefined, like on a real one. sinon-chai picks
	// `always<Method>` when it exists; an auto-mocked one would make `.always` assertions
	// pass regardless of the calls.
	'alwaysCalledAfter',
	'alwaysCalledBefore',
	'alwaysCalledImmediatelyAfter',
	'alwaysCalledImmediatelyBefore',
	'alwaysCalledOnceWith',
	'alwaysCalledOnceWithExactly',
	'alwaysCalledOnceWithMatch',
]);

/**
 * Behaviors that invoke a callback argument. Sinon keeps an existing `callsFake`
 * implementation alongside them, so on its own the default implementation would still
 * run (returning an auto-mock, or throwing in strict mode).
 */
const callbackBehaviors = [
	'callsArg',
	'callsArgAsync',
	'callsArgOn',
	'callsArgOnAsync',
	'callsArgWith',
	'callsArgWithAsync',
	'callsArgOnWith',
	'callsArgOnWithAsync',
] as const;

/** Replaces a stub's own method, keeping the original callable. */
const overrideMethod = <K extends keyof SinonStub>(
	stub: SinonStub,
	key: K,
	method: (
		original: (...args: unknown[]) => unknown,
		args: unknown[],
	) => unknown,
): void => {
	const original = (
		Reflect.get(stub, key) as (...args: unknown[]) => unknown
	).bind(stub);

	Object.defineProperty(stub, key, {
		configurable: true,
		writable: true,
		value: (...args: unknown[]) => method(original, args),
	});
};

const sinonAdapter: MockAdapter = {
	fn: (implementation) => {
		const stub = sinon.stub().callsFake(implementation);
		// Whether the default implementation is still what the stub falls back to. Reads
		// Sinon's (long-stable, internal) default behavior; if that ever changes shape,
		// this is false and Sinon's own semantics apply.
		const usingDefault = () =>
			Reflect.get(Object(Reflect.get(stub, 'defaultBehavior')), 'fakeFn') ===
			implementation;

		// Sinon's resets (stub.reset(), stub.resetBehavior(), sinon.reset(), ...) all clear
		// behavior through this method, which would leave the stub returning undefined.
		// Restore the default implementation afterwards, so auto-mocking (or the partial's
		// implementation) comes back after a reset, as with the other adapters.
		overrideMethod(stub, 'resetBehavior', (resetBehavior) => {
			resetBehavior();
			stub.callsFake(implementation);
		});

		// A callback behavior configured over the default implementation should behave
		// like on a fresh stub: run the callback and return undefined. `returns()` drops
		// the default implementation and keeps the callback.
		for (const key of callbackBehaviors) {
			overrideMethod(stub, key, (callbackBehavior, args) => {
				const replaceDefault = usingDefault();
				const result = callbackBehavior(...args);

				if (replaceDefault) {
					stub.returns(undefined);
				}

				return result;
			});
		}

		return stub;
	},
	isMock: (value) =>
		typeof value === 'function' && Reflect.get(value, 'isSinonProxy') === true,
	apiKeys,
};

/**
 * Creates a deep mock of the specified type with Sinon stubs.
 *
 * Features:
 * - All properties and methods are automatically mocked
 * - Nested properties are also deeply mocked (e.g., `mock.user.address.city`)
 * - Function return values are automatically mocked and awaitable
 * - Supports mock composition: pass existing stubs or mocks as partial values
 * - All functions are Sinon stubs: `returns`, `resolves`, `withArgs`, `calledWith`, ...
 *
 * Stubs are created with `sinon.stub()`, so `sinon.reset()` and `sinon.resetHistory()`
 * apply to them. After a reset, unstubbed calls go back to returning auto-mocks.
 *
 * @param partial - Optional object with pre-defined properties/implementations
 * @param options - Optional configuration (name, strict mode)
 * @returns A deeply mocked version of T
 *
 * @example
 * ```typescript
 * import sinon from 'sinon';
 * import { createMock } from 'deepmocked/sinon';
 *
 * interface UserService {
 *   getUser: (id: number) => Promise<{ name: string }>;
 * }
 *
 * const users = createMock<UserService>();
 * users.getUser.resolves({ name: 'Ada' });
 *
 * await users.getUser(1);
 * sinon.assert.calledOnceWithExactly(users.getUser, 1);
 * ```
 */
export const createMock: <T extends object>(
	partial?: PartialFuncReturn<T>,
	options?: MockOptions,
) => DeepMocked<T> = createMockFactory<SinonMockKind>(sinonAdapter);
