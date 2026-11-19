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

/** Types every mocked function as a Sinon `SinonStub`. Internal: not part of the public API. */
interface SinonMockKind extends MockKind {
	readonly mock: this['fn'] extends infer F extends AnyFunction
		? SinonStub<Parameters<F>, ReturnType<F>>
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
]);

const sinonAdapter: MockAdapter = {
	fn: (implementation) => {
		const stub = sinon.stub().callsFake(implementation);
		const resetBehavior = stub.resetBehavior.bind(stub);

		// Sinon's resets (stub.reset(), stub.resetBehavior(), sinon.reset(), ...) all clear
		// behavior through this method, which would leave the stub returning undefined.
		// Restore the default implementation afterwards, so auto-mocking (or the partial's
		// implementation) comes back after a reset, as with the other adapters.
		Object.defineProperty(stub, 'resetBehavior', {
			configurable: true,
			writable: true,
			value() {
				resetBehavior();
				stub.callsFake(implementation);
			},
		});

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
