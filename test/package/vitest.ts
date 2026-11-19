// Type-checked by scripts/check-package.mjs against the packed tarball, as a consumer.
import { createMock, type DeepMocked } from 'deepmocked/vitest';
import { vi } from 'vitest';

interface UserService {
	getUser: (id: number) => Promise<{ name: string; load: () => number }>;
	save: (name: string) => boolean;
}

export async function usage(): Promise<string> {
	const service: DeepMocked<UserService> = createMock<UserService>({
		save: vi.fn(() => true),
	});

	service.getUser.mockResolvedValue({ name: 'Ada', load: () => 1 });
	service.save.mockImplementation((name) => name.length > 0);
	(await service.getUser(1)).load.mockReturnValue(2);

	// @ts-expect-error wrong argument type
	service.save(1);
	// @ts-expect-error a number is not an implementation
	createMock<UserService>({ save: 1 });
	// Explicit undefined is allowed where the type allows it (checked with
	// exactOptionalPropertyTypes on)
	createMock<{ save: ((name: string) => boolean) | undefined }>({
		save: undefined,
	});

	return (await service.getUser(1)).name;
}
