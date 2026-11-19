// Runs under the real `node --test` runner against the built package (dist/node.js):
// `pnpm run test:node`. Type-checked against the source via tsconfig `paths`.
import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

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
