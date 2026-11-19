// Runs under `node --test` against the built package (dist/sinon.js), with real Sinon:
// `pnpm run test:node`. Type-checked against the source via tsconfig `paths`.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import * as chai from 'chai';
import { createMock, type DeepMocked } from 'deepmocked/sinon';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);

interface User {
	id: number;
	profile: { name: string };
}

interface Repo {
	get: (id: number) => User | undefined;
	set: (user: User) => void;
	invoke: (command: string) => number;
	query: () => { rows: () => number[] };
}

interface UserService {
	getUser: (id: number) => Promise<User>;
	save: (user: User) => boolean;
	log: (message: string) => void;
	repo: Repo;
}

const user: User = { id: 1, profile: { name: 'Ada' } };

describe('createMock (sinon)', () => {
	describe('auto-mocking', () => {
		test('records calls on auto-mocked functions', () => {
			const service = createMock<UserService>();

			service.save(user);
			service.repo.get(7);

			assert.equal(service.save.callCount, 1);
			assert.ok(service.save.calledOnceWithExactly(user));
			assert.deepEqual(service.repo.get.firstCall.args, [7]);
		});

		test('returns the same nested auto-mock from repeated calls', () => {
			const service = createMock<UserService>();

			const result = service.repo.query();

			assert.equal(typeof result.rows, 'function');
			assert.equal(service.repo.query(), result);
			assert.equal(service.repo.query.returnValues[0], result);
		});

		test('makes awaited unstubbed async calls resolve to a mock', async () => {
			const service = createMock<UserService>();

			const result = await service.getUser(1);

			assert.equal(typeof result.profile, 'function');
		});

		test('auto-mocks domain methods named like Sinon internals', () => {
			// get/set/invoke exist on stubs but aren't public stub API
			const repo = createMock<UserService>().repo;
			const fromCall = createMock<{ make: () => Repo }>().make();

			repo.get(1);
			fromCall.set(user);
			fromCall.invoke('x');

			assert.equal(repo.get.callCount, 1);
			assert.ok(fromCall.set.calledWith(user));
			assert.equal(fromCall.invoke.callCount, 1);
		});
	});

	describe('stubbing with the Sinon API', () => {
		test('uses returns, resolves and throws', async () => {
			const service = createMock<UserService>();

			service.save.returns(true);
			service.getUser.resolves(user);
			service.repo.invoke.throws(new Error('boom'));

			assert.equal(service.save(user), true);
			assert.equal(await service.getUser(1), user);
			assert.throws(() => service.repo.invoke('x'), /boom/);
		});

		test('returns the mock itself from chainable methods', () => {
			const service = createMock<UserService>();

			assert.equal(service.save.returns(true), service.save);
		});

		test('uses onCall and withArgs, then falls back to auto-mocking', () => {
			const service = createMock<UserService>();

			service.repo.get.onFirstCall().returns(user);
			service.repo.get.withArgs(2).returns(undefined);

			assert.equal(service.repo.get(1), user);
			assert.equal(service.repo.get(2), undefined);
			assert.equal(typeof service.repo.get(3), 'function');
		});

		test('respects a stub that returns undefined', () => {
			const service = createMock<UserService>();

			service.repo.get.returns(undefined);

			assert.equal(service.repo.get(1), undefined);
		});
	});

	describe('resets', () => {
		for (const [name, reset] of [
			['stub.reset()', (mock: DeepMocked<UserService>) => mock.save.reset()],
			[
				'stub.resetBehavior()',
				(mock: DeepMocked<UserService>) => mock.save.resetBehavior(),
			],
			['sinon.reset()', () => sinon.reset()],
			['sinon.resetBehavior()', () => sinon.resetBehavior()],
		] as const) {
			test(`${name} goes back to auto-mocking`, () => {
				const service = createMock<UserService>();

				service.save.returns(true);
				reset(service);

				assert.equal(typeof service.save(user), 'function');
			});
		}

		test('a partial implementation comes back after a reset', () => {
			const service = createMock<UserService>({ save: () => true });

			service.save.returns(false);
			service.save.reset();

			assert.equal(service.save(user), true);
		});

		test('sinon.resetHistory() clears calls', () => {
			const service = createMock<UserService>();

			service.save(user);
			sinon.resetHistory();

			assert.equal(service.save.callCount, 0);
		});
	});

	describe('callback behaviors', () => {
		test('callsArg counts as stubbed, including in strict mode', () => {
			const service = createMock<{ read: (callback: () => number) => number }>(
				{},
				{ strict: true },
			);
			let calls = 0;

			service.read.callsArg(0);

			// Like a fresh Sinon stub: the callback runs and its result is returned
			assert.equal(
				service.read(() => ++calls),
				1,
			);
			assert.equal(calls, 1);
		});

		test('keeps a configured return value or fake alongside callsArg', () => {
			const service = createMock<{ read: (callback: () => void) => number }>();

			service.read.returns(5);
			service.read.callsArgWith(0);
			assert.equal(
				service.read(() => undefined),
				5,
			);

			service.read.callsFake(() => 6);
			service.read.callsArg(0);
			assert.equal(
				service.read(() => undefined),
				6,
			);
		});

		test('goes back to auto-mocking after a reset', () => {
			const service = createMock<{ read: (callback: () => void) => object }>();

			service.read.callsArg(0);
			service.read.reset();

			assert.equal(typeof service.read(() => undefined), 'function');
		});

		test('invokeCallback runs the last callback', () => {
			const service = createMock<{ read: (callback: () => void) => void }>();
			let calls = 0;

			service.read(() => calls++);
			// @types/sinon types invokeCallback's arguments as the stub's own parameters
			(service.read.invokeCallback as () => void)();

			assert.equal(calls, 1);
		});
	});

	describe('construction', () => {
		test('records `new` on auto-mocked functions', () => {
			const factory = createMock<Record<string, unknown>>();
			const Ctor = factory.Ctor;

			Ctor.returns(42);
			const instance: unknown = Reflect.construct(Ctor, []);

			assert.ok(Ctor.calledWithNew());
			assert.equal(Ctor.returnValues[0], instance);
		});
	});

	describe('sinon-chai', () => {
		test('asserts on auto-mocked functions, including `always`', () => {
			const service = createMock<UserService>();

			service.log('actual');

			chai.expect(service.log).to.have.been.calledOnceWith('actual');
			chai.expect(service.log).to.have.always.been.calledWith('actual');
			chai.expect(service.save).to.have.callCount(0);
		});

		test('fails `always` assertions that have no Sinon counterpart', () => {
			const service = createMock<UserService>();

			service.log('actual');

			assert.throws(() =>
				chai.expect(service.log).to.have.always.been.calledOnceWith('wrong'),
			);
			assert.throws(() =>
				chai
					.expect(service.log)
					.to.have.always.been.calledOnceWithExactly('wrong'),
			);
		});
	});

	describe('sinon.assert', () => {
		test('works on auto-mocked functions', () => {
			const service = createMock<UserService>();

			service.save(user);
			service.log('hi');

			sinon.assert.called(service.save);
			sinon.assert.calledOnce(service.save);
			sinon.assert.calledWith(service.save, user);
			sinon.assert.calledOnceWithExactly(service.log, 'hi');
			sinon.assert.notCalled(service.repo.get);
			sinon.assert.callOrder(service.save, service.log);
			sinon.assert.calledWithMatch(service.save, { id: 1 });
		});

		test('supports cross-stub ordering checks', () => {
			const service = createMock<UserService>();

			service.save(user);
			service.log('hi');

			assert.ok(service.save.calledBefore(service.log));
			assert.ok(service.log.calledImmediatelyAfter(service.save));
			sinon.assert.callOrder(service.save, service.log);
			assert.throws(
				() => sinon.assert.callOrder(service.log, service.save),
				(error: Error) => error.name === 'AssertError',
			);
		});

		test('supports named stubs', () => {
			const service = createMock<UserService>();

			assert.equal(service.save.named('save').toString(), 'save');
		});

		test('reports failures with readable messages', () => {
			const service = createMock<UserService>();

			service.save(user);

			assert.throws(
				() => sinon.assert.calledWith(service.save, { id: 2 }),
				(error: Error) =>
					error.name === 'AssertError' &&
					/expected stub to be called with arguments/.test(error.message),
			);
		});
	});

	describe('partials', () => {
		test('wraps provided functions in stubs that record calls', () => {
			const service = createMock<UserService>({ save: () => true });

			assert.equal(service.save(user), true);
			assert.equal(service.save.callCount, 1);
		});

		test('reuses stubs passed in (mock composition)', () => {
			const save = sinon.stub<[User], boolean>().returns(true);
			const service = createMock<UserService>({ save });

			service.save(user);

			assert.equal(service.save, save);
			assert.equal(save.callCount, 1);
		});

		test('mocks methods of nested partials and auto-mocks their missing keys', () => {
			const service = createMock<UserService>({ repo: { get: () => user } });

			assert.equal(service.repo.get(1), user);
			assert.equal(service.repo.get.callCount, 1);
			assert.equal(typeof service.repo.query().rows, 'function');
		});
	});

	describe('strict mode', () => {
		test('throws on unstubbed calls and records the throw', () => {
			const service = createMock<UserService>({}, { strict: true });

			assert.throws(
				() => service.save(user),
				/Method mock\.save was called without being explicitly stubbed/,
			);
			assert.ok(service.save.threw());
		});

		test('does not throw for a stub that returns undefined', () => {
			const service = createMock<UserService>({}, { strict: true });

			service.log.returns(undefined);

			assert.doesNotThrow(() => service.log('hi'));
		});
	});

	describe('types', () => {
		test('rejects wrong arguments and types stub behavior', () => {
			const service = createMock<UserService>();

			service.repo.get.returns(user);
			service.getUser.resolves(user);

			// Type-level only (never called)
			const unsafe = () => {
				// @ts-expect-error wrong argument type
				service.save('wrong');
				// @ts-expect-error returns() takes the real return type
				service.save.returns('not a boolean');
				// @ts-expect-error a number is not an implementation
				createMock<UserService>({ save: 123 });
				// @ts-expect-error Vitest-only API
				void service.save.mockReturnValue;
			};
			void unsafe;
		});

		test('types functions returned from calls as stubs', () => {
			const factory = createMock<{ make: () => (id: number) => string }>();

			const made = factory.make();
			made.returns('made');

			assert.equal(made(1), 'made');
			assert.ok(made.calledWith(1));
		});
	});
});
