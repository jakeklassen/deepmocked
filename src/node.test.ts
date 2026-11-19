// Runs under the real `node --test` runner against the built package (dist/node.js):
// `pnpm run test:node`. Type-checked against the source via tsconfig `paths`.
import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { inspect } from 'node:util';

import { createMock, type DeepMocked } from 'deepmocked/node';

interface User {
	id: number;
	profile: { name: string };
}

interface UserService {
	getUser: (id: number) => Promise<User>;
	save: (user: User) => boolean;
	log: (message: string) => void;
	repo: {
		find: (id: number) => User | undefined;
		query: () => { rows: () => number[] };
	};
}

const user: User = { id: 1, profile: { name: 'Ada' } };

describe('createMock (node:test)', () => {
	describe('auto-mocking', () => {
		test('records calls on auto-mocked functions', () => {
			const service = createMock<UserService>();

			service.save(user);
			service.repo.find(7);

			assert.equal(service.save.mock.callCount(), 1);
			assert.deepEqual(service.save.mock.calls[0]?.arguments, [user]);
			assert.deepEqual(service.repo.find.mock.calls[0]?.arguments, [7]);
		});

		test('returns nested auto-mocks from unstubbed calls', () => {
			const service = createMock<UserService>();

			const rows = service.repo.query().rows;
			rows();

			assert.equal(typeof rows, 'function');
			assert.equal(rows.mock.callCount(), 1);
		});

		test('returns the same nested mock from repeated calls and accesses', () => {
			const service = createMock<UserService>();

			assert.equal(service.repo, service.repo);
			assert.equal(service.repo.query(), service.repo.query());
		});

		test('makes awaited unstubbed async calls resolve to a mock', async () => {
			const service = createMock<UserService>();

			const result = await service.getUser(1);

			assert.equal(typeof result.profile, 'function');
		});

		test('is not thenable itself', () => {
			const service = createMock<UserService>();

			assert.equal(Reflect.get(service, 'then'), undefined);
		});
	});

	describe('stubbing through fn.mock', () => {
		test('uses mockImplementation', async () => {
			const service = createMock<UserService>();

			service.getUser.mock.mockImplementation(async () => user);

			assert.equal((await service.getUser(1)).profile.name, 'Ada');
		});

		test('uses mockImplementationOnce, then falls back to auto-mocking', () => {
			const service = createMock<UserService>();

			service.save.mock.mockImplementationOnce(() => true);

			assert.equal(service.save(user), true);
			assert.equal(typeof service.save(user), 'function');
		});

		test('respects a stub that returns undefined', () => {
			const service = createMock<UserService>();

			service.repo.find.mock.mockImplementation(() => undefined);

			assert.equal(service.repo.find(1), undefined);
		});

		test('resumes auto-mocking after fn.mock.restore()', () => {
			const service = createMock<UserService>();

			service.save.mock.mockImplementation(() => true);
			service.save.mock.restore();

			assert.equal(typeof service.save(user), 'function');
		});

		test('resumes auto-mocking after the global mock.restoreAll()', () => {
			const service = createMock<UserService>();

			service.save.mock.mockImplementation(() => true);
			mock.restoreAll();

			assert.equal(typeof service.save(user), 'function');
		});
	});

	describe('partials', () => {
		test('wraps provided functions in mocks that record calls', () => {
			const service = createMock<UserService>({ save: () => true });

			assert.equal(service.save(user), true);
			assert.equal(service.save.mock.callCount(), 1);
		});

		test('keeps provided values and nested partials', () => {
			const service = createMock<UserService>({
				repo: { find: () => user },
			});

			assert.equal(service.repo.find(1), user);
		});

		test('reuses mocks passed in (mock composition)', () => {
			const save = mock.fn((_user: User) => true);
			const repo: DeepMocked<UserService['repo']> =
				createMock<UserService['repo']>();
			const service = createMock<UserService>({ save, repo });

			service.save(user);

			assert.equal(service.save, save);
			assert.equal(service.repo, repo);
			assert.equal(save.mock.callCount(), 1);
		});

		test('allows properties to be reassigned', () => {
			const service = createMock<{ count: number }>({ count: 1 });

			service.count = 2;

			assert.equal(service.count, 2);
		});
	});

	describe('strict mode', () => {
		test('throws on unstubbed calls', () => {
			const service = createMock<UserService>({}, { strict: true });

			assert.throws(
				() => service.save(user),
				/Method mock\.save was called without being explicitly stubbed/,
			);
		});

		test('does not throw for a stub that returns undefined', () => {
			const service = createMock<UserService>({}, { strict: true });

			service.log.mock.mockImplementation(() => undefined);

			assert.doesNotThrow(() => service.log('hi'));
		});

		test('throws on unstubbed `new`, then uses a stub configured afterwards', () => {
			const service = createMock<UserService>({}, { strict: true });

			assert.throws(
				() => Reflect.construct(service.save, []),
				/Method mock\.save was called without being explicitly stubbed/,
			);
			service.save.mock.mockImplementation(() => true);

			assert.equal(service.save(user), true);
		});
	});

	describe('edge cases', () => {
		test('uses a stub configured after the mock was called with new', () => {
			const service = createMock<UserService>();

			Reflect.construct(service.save, []);
			service.save.mock.mockImplementation(() => true);

			assert.equal(service.save(user), true);
		});

		test('accepts partial functions with a non-configurable `mock` property', () => {
			// e.g. a Vitest mock: node:test's mock.fn() can't proxy a function like this
			const save = Object.defineProperty((_user: User) => true, 'mock', {
				value: {},
				writable: false,
				configurable: false,
			});
			const service = createMock<UserService>({ save });

			assert.equal(service.save(user), true);
			assert.equal(service.save.mock.callCount(), 1);
		});

		test('records the auto-mock an unstubbed call returns', () => {
			const service = createMock<UserService>();

			const repo = service.repo.query();

			assert.equal(service.repo.query.mock.calls[0]?.result, repo);
		});

		test('records strict-mode throws as errors', () => {
			const service = createMock<UserService>({}, { strict: true });

			assert.throws(() => service.save(user));
			assert.ok(service.save.mock.calls[0]?.error instanceof Error);
		});

		test('mocks methods of nested partials and auto-mocks their missing keys', () => {
			const service = createMock<UserService>({
				repo: { find: () => user },
			});

			assert.equal(service.repo.find(1), user);
			assert.equal(service.repo.find.mock.callCount(), 1);
			assert.equal(typeof service.repo.query().rows, 'function');
		});

		test('constructs partial constructors with new', () => {
			class Point {
				readonly target: unknown;
				readonly x: number;
				constructor(x: number) {
					this.x = x;
					this.target = new.target;
				}
			}
			// Constructor types aren't mocked by DeepMocked, so type the mock loosely
			const factory = createMock<Record<string, unknown>>({ Point });

			const point: unknown = Reflect.construct(factory.Point, [1]);

			assert.ok(point instanceof Point);
			assert.equal(point.target, Point);
			assert.equal(point.x, 1);
			assert.equal(factory.Point.mock.callCount(), 1);
		});

		test('does not auto-mock util.inspect.custom', () => {
			const service = createMock<UserService>();

			assert.equal(Reflect.get(service.repo, inspect.custom), undefined);
			assert.doesNotThrow(() => inspect(service.repo));
		});
	});

	describe('types', () => {
		test('rejects wrong arguments and keeps implementation parameter types', () => {
			const service = createMock<UserService>();

			// @ts-expect-error wrong argument type
			service.repo.find('wrong');
			// @ts-expect-error too many arguments
			service.repo.find(1, 2);

			service.repo.find.mock.mockImplementation((id) => {
				// @ts-expect-error id is a number, not any
				id.nonexistent();

				return { id: id.valueOf(), profile: { name: 'Ada' } };
			});
		});

		test('types functions returned from calls as mocks', () => {
			const factory = createMock<{ make: () => (id: number) => string }>();

			const made = factory.make();
			made.mock.mockImplementation((id) => id.toFixed());

			assert.equal(made(2), '2');
			assert.equal(made.mock.callCount(), 1);
			// Type-level only (never called)
			// @ts-expect-error wrong argument type
			const wrongArgument = () => made('wrong');
			void wrongArgument;
		});

		test('keeps null on nullable members', () => {
			const service = createMock<{ read: ((id: number) => string) | null }>({
				read: null,
			});

			// Type-level only (never called)
			// @ts-expect-error read may be null
			const unsafeRead = () => service.read(1);
			void unsafeRead;
			assert.equal(service.read, null);
		});

		test('rejects partials that are not implementations or mocks', () => {
			// @ts-expect-error a number is not an implementation
			createMock<UserService>({ save: 123 });

			createMock<UserService>({
				save: () => true,
				log: mock.fn((_message: string) => undefined),
			});
		});

		test('keeps the mock API on deeply mocked return values', async () => {
			const service = createMock<UserService>();

			const rows = service.repo.query().rows;
			const profile = (await service.getUser(1)).profile;
			rows();

			assert.equal(rows.mock.callCount(), 1);
			assert.equal(typeof profile, 'function');
		});

		test('exposes the node:test API, not Vitest', () => {
			const service = createMock<UserService>();

			// The type check is the test: Vitest's mockReturnValue must not exist here
			// @ts-expect-error Vitest-only API
			void service.save.mockReturnValue;
		});
	});

	describe('assertions', () => {
		test('reports node:assert failures instead of throwing a TypeError', () => {
			const service = createMock<UserService>();

			assert.throws(
				() => assert.deepEqual(service.repo, { find: 1 }),
				assert.AssertionError,
			);
		});
	});
});
