// Type-checked by scripts/check-package.mjs against the packed tarball, as a consumer.
import { createMock, type DeepMocked } from 'deepmocked/sinon';
import sinon from 'sinon';

interface UserService {
	getUser: (id: number) => Promise<{ name: string; load: () => number }>;
	save: (name: string) => boolean;
}

export async function usage(): Promise<number> {
	const service: DeepMocked<UserService> = createMock<UserService>({
		save: sinon.stub<[string], boolean>().returns(true),
	});

	service.getUser.resolves({ name: 'Ada', load: () => 1 });
	(await service.getUser(1)).load.returns(2);
	sinon.assert.calledOnceWithExactly(service.getUser, 1);

	// @ts-expect-error wrong argument type
	service.save(1);
	// @ts-expect-error returns() takes the real return type
	service.save.returns('yes');
	// @ts-expect-error a number is not an implementation
	createMock<UserService>({ save: 1 });

	return service.getUser.callCount;
}
