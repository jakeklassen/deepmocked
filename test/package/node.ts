// Type-checked by scripts/check-package.mjs against the packed tarball, as a consumer.
import { mock } from 'node:test';

import { createMock, type DeepMocked } from 'deepmocked/node';

interface UserService {
	getUser: (id: number) => Promise<{ name: string; load: () => number }>;
	save: (name: string) => boolean;
}

export async function usage(): Promise<number> {
	const service: DeepMocked<UserService> = createMock<UserService>({
		save: mock.fn((name: string) => name.length > 0),
	});

	service.getUser.mock.mockImplementation(async () => ({
		name: 'Ada',
		load: () => 1,
	}));
	service.save.mock.mockImplementation((name) => name.length > 0);
	(await service.getUser(1)).load.mock.callCount();

	// @ts-expect-error wrong argument type
	service.save(1);
	// @ts-expect-error a number is not an implementation
	createMock<UserService>({ save: 1 });
	// @ts-expect-error Vitest-only API
	void service.save.mockReturnValue;

	return service.save.mock.callCount();
}
