# deepmocked

Type-safe, deeply mocked objects for TypeScript tests. `createMock<T>()` gives you a `T` where every method is a mock and every nested property and return value is mocked automatically.

`deepmocked` has a mock-library-agnostic core with one adapter per mock library, imported by path:

| Import              | Mock library                      | Status       |
| ------------------- | --------------------------------- | ------------ |
| `deepmocked/vitest` | Vitest (`vi.fn`)                  | ✅ Available |
| `deepmocked/node`   | `node:test` (`mock.fn`)           | ✅ Available |
| `deepmocked/sinon`  | Sinon (works with Japa, AdonisJS) | ✅ Available |
| `deepmocked/jest`   | Jest / `jest-mock`                | Planned      |

It started as a port of [@golevelup/ts-jest](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-jest)'s `createMock`, and was previously published as [`vitest-create-mock`](https://www.npmjs.com/package/vitest-create-mock).

## Features

- 🎯 **Type-Safe Mocking** - Full TypeScript support with proper type inference
- 🔄 **Deep Mocking** - Automatically mocks nested properties and methods
- ⚡ **Auto-Mocking** - Automatically creates mocks for properties not explicitly provided
- 🎭 **Partial Mocking** - Provide only the properties you need to mock
- 🔒 **Strict Mode** - Optional strict mode to catch unmocked method calls
- 🧩 **Proxy-Based** - Efficient proxy-based implementation with caching
- ✨ **Promise Support** - Automatically handles async/await and promises

## Installation

```bash
pnpm add -D deepmocked
```

```bash
npm install --save-dev deepmocked
```

```bash
yarn add -D deepmocked
```

```bash
bun add -d deepmocked
```

Each adapter uses the mock library you already have installed (`vitest` for `deepmocked/vitest`); none of them are installed for you. `deepmocked/node` needs nothing beyond Node itself (and `@types/node` for types). `deepmocked/sinon` needs `sinon` 22 (and `@types/sinon` for types).

`deepmocked` is ESM-only: import it from ES modules. Modern Node can `require()` it, and TypeScript allows that from CommonJS files under `module: nodenext`, but not under the older `module: node16`. With `deepmocked/sinon`, import Sinon as ESM too: Sinon's CommonJS and ESM builds have separate default sandboxes, so a `sinon.reset()` from `require('sinon')` doesn't reach these mocks.

### Migrating from `vitest-create-mock`

The API is the same. Change the package and the import path:

```diff
- import { createMock } from 'vitest-create-mock';
+ import { createMock } from 'deepmocked/vitest';
```

## Quick Start

```typescript
import { createMock } from 'deepmocked/vitest';
import { describe, expect, it } from 'vitest';

interface UserService {
	getUser: (id: number) => Promise<{ name: string; email: string }>;
	deleteUser: (id: number) => Promise<void>;
}

describe('UserController', () => {
	it('should get user', async () => {
		const userService = createMock<UserService>({
			getUser: async () => ({ name: 'John', email: 'john@example.com' }),
		});

		const user = await userService.getUser(1);

		expect(user.name).toBe('John');
		expect(userService.getUser).toHaveBeenCalledWith(1);
	});
});
```

### With `node:test`

`deepmocked/node` works the same way, with `node:test`'s mocks. Their whole API lives on `fn.mock`, so that's where you stub and inspect them:

```typescript
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMock } from 'deepmocked/node';

interface UserService {
	getUser: (id: number) => Promise<{ name: string; email: string }>;
	deleteUser: (id: number) => Promise<void>;
}

test('gets a user', async () => {
	const userService = createMock<UserService>();
	userService.getUser.mock.mockImplementation(async () => ({
		name: 'John',
		email: 'john@example.com',
	}));

	const user = await userService.getUser(1);

	assert.equal(user.name, 'John');
	assert.deepEqual(userService.getUser.mock.calls[0]?.arguments, [1]);
});
```

- Stub with `fn.mock.mockImplementation()` / `mockImplementationOnce()`; inspect with `fn.mock.calls` and `fn.mock.callCount()`.
- A stub that returns `undefined` is respected (it isn't replaced by an auto-mock), including in strict mode.
- Mocks are created on the global `mock` tracker, so `mock.restoreAll()` and `mock.reset()` apply to them; after a restore, unstubbed calls go back to returning auto-mocks.

### With Sinon (Japa, AdonisJS, Mocha, ...)

`deepmocked/sinon` makes every function a real Sinon stub, so it works with any test runner, including [Japa](https://japa.dev/), which has no mocking library of its own:

```typescript
import { createMock } from 'deepmocked/sinon';
import sinon from 'sinon';

const userService = createMock<UserService>();
userService.getUser.resolves({ name: 'John', email: 'john@example.com' });

const user = await userService.getUser(1);

sinon.assert.calledOnceWithExactly(userService.getUser, 1);
userService.deleteUser.rejects(new Error('forbidden'));
```

- Sinon's spy and stub API works: `returns`, `resolves`, `throws`, `callsFake`, `callsArg`, `withArgs`, `onCall`, `calledWith`, `getCall`, ... and so do `sinon.assert` and [sinon-chai](https://github.com/chaijs/sinon-chai). `callThrough` doesn't apply, since these stubs don't wrap a real method.
- Stubs are created with `sinon.stub()` in Sinon's default sandbox, so `sinon.reset()` / `sinon.resetHistory()` apply to them, but cleaning up your own `sinon.createSandbox()` doesn't. After any reset (`stub.reset()`, `stub.resetBehavior()`, `sinon.reset()`), unstubbed calls go back to returning auto-mocks, and a partial's implementation comes back. Stubs you pass in yourself keep Sinon's usual reset behavior.
- One Sinon-specific quirk: values returned by unstubbed calls are stubs too, and Sinon's cross-stub checks (`calledBefore`, `sinon.assert.callOrder`, ...) need their `id`. So `id` on such a value is Sinon's stub id rather than an auto-mock. Stub `id` explicitly if your code reads it.

The rest of this README uses Vitest in its examples.

## API

### `createMock<T>(partial?, options?)`

Creates a deeply mocked object of type `T`.

#### Parameters

- **`partial`** (optional): A partial implementation of the type to mock
  - Type: `PartialFuncReturn<T>`
  - Default: `{}`
  - Only provide the properties/methods you want to explicitly mock

- **`options`** (optional): Configuration options
  - Type: `MockOptions`
  - Properties:
    - `name?: string` - Name for the mock (useful for debugging), default: `'mock'`
    - `strict?: boolean` - Enable strict mode, default: `false`

#### Returns

A `DeepMocked<T>` object where all methods are Vitest mocks and all properties are accessible.

### Types

#### `DeepMocked<T>`

Recursively transforms a type so that all methods become Vitest mocks while preserving type information. Uses depth-limited recursion (5 levels) to avoid TypeScript complexity explosion on deeply nested types.

- **Functions**: Become `Mock<T>` with return types recursively deep-mocked
- **Promises**: Unwrapped correctly — `Promise<T>` becomes `Promise<DeepMocked<T>>`
- **Objects**: Recursively deep-mocked
- **Primitives**: Left as-is
- **Excluded properties**: `then` and `asymmetricMatch` are excluded to prevent interference with Promise detection and Vitest matchers
- **Depth fallback**: At very deep nesting levels, function signatures gracefully degrade to permissive typing to avoid TypeScript complexity limits
- **Arrays and built-ins**: arrays, `Date`, `Map`, `Set`, `RegExp`, `Error` and their weak variants keep their real types (they're never deep-mocked)
- **Known limitations**: overloaded methods are typed by their last overload; generic methods lose their type parameters; constructor types aren't mocked; values your own implementations return are typed as mocks although they're returned as-is; an unstubbed async call can be awaited but its result has no working `.then()`; with Sinon, `withArgs()`/`returns()`/`callsFake()` return Sinon's own stub type, so chaining off them loses deep-mocked return types

#### `PartialFuncReturn<T>`

Allows partial mocking of an object's methods while maintaining type safety.

#### `MockOptions`

Configuration options for `createMock`:

```typescript
type MockOptions = {
	name?: string;
	strict?: boolean;
};
```

## Usage Examples

### Basic Mocking

```typescript
interface Calculator {
	add: (a: number, b: number) => number;
	subtract: (a: number, b: number) => number;
}

const calc = createMock<Calculator>({
	add: (a, b) => a + b,
});

expect(calc.add(2, 3)).toBe(5);
expect(calc.add).toHaveBeenCalledWith(2, 3);
```

### Auto-Mocking

Properties and methods not provided are automatically mocked:

```typescript
interface Service {
	method1: () => string;
	method2: () => number;
}

const service = createMock<Service>(); // No partial provided

service.method1(); // Automatically mocked
service.method2(); // Automatically mocked

expect(service.method1).toHaveBeenCalled();
expect(service.method2).toHaveBeenCalled();
```

### Deep Nested Mocking

```typescript
interface ExecutionContext {
	switchToHttp: () => {
		getRequest: () => Request;
		getResponse: () => Response;
	};
}

const context = createMock<ExecutionContext>({
	switchToHttp: () => ({
		getRequest: () => ({ headers: { authorization: 'Bearer token' } }),
	}),
});

const request = context.switchToHttp().getRequest();
expect(request.headers.authorization).toBe('Bearer token');
```

Values returned by your own implementations are returned exactly as you wrote them (not wrapped in mocks), so `toBe` against them keeps working. The types can't tell those apart from auto-mocked return values, so they still describe them as mocks: don't call mock methods on a function or object your implementation returned.

### Nested Partials

Plain objects nested in a partial are deep-mocked like the root: their methods become mocks that keep your implementation, and keys you leave out are auto-mocked.

```typescript
interface Service {
	repo: {
		find: (id: number) => User | undefined;
		save: (user: User) => void;
	};
}

const service = createMock<Service>({
	repo: { find: (id) => ({ id, name: 'Ada' }) },
});

service.repo.find(1); // { id: 1, name: 'Ada' }
expect(service.repo.find).toHaveBeenCalledWith(1);
service.repo.save(user); // `save` wasn't provided: auto-mocked
```

`service.repo` is a mock wrapping the object you passed, not the same object (`toBe` fails), and its methods are mocks rather than your functions, so `toEqual` against the original only matches when it has no methods.

- An object you reference from two places (or from itself) becomes one mock, so stubbing it through either path affects both.
- Values are read live from your object: changes you make to it later, getters and deletes all show up. Getters run with the mock as `this`, so `this.method()` inside them calls the mock.
- Existing mocks, arrays, and class instances (and other non-plain objects) are used as-is. A class instance passed as the whole partial runs its methods as itself, so `#private` fields work.
- Values of frozen objects are used as-is too: JavaScript doesn't allow a proxy to replace them.

### Using Mock Methods

Since all methods are Vitest mocks, you can use all Vitest mock features:

```typescript
interface DataService {
	fetchData: () => Promise<string>;
}

const service = createMock<DataService>();

// Mock implementation
service.fetchData.mockResolvedValueOnce('first call');
service.fetchData.mockResolvedValueOnce('second call');

expect(await service.fetchData()).toBe('first call');
expect(await service.fetchData()).toBe('second call');

// Verify calls
expect(service.fetchData).toHaveBeenCalledTimes(2);
```

Call records match what callers receive: an unstubbed call's auto-mocked return value is what `mock.results` and `toHaveReturnedWith` see, and a strict-mode error is recorded as a throw. Returning that auto-mock is the mock's default implementation, so `getMockImplementation()` returns a function even before you stub anything, and `mockReset()` / `mockRestore()` go back to auto-mocking.

### Mocking Classes

```typescript
class UserRepository {
	findById(id: number): User | null {
		// Implementation
	}

	save(user: User): void {
		// Implementation
	}
}

const repo = createMock<UserRepository>(undefined, { name: 'UserRepository' });

repo.findById.mockReturnValueOnce({ id: 1, name: 'Alice' });

const user = repo.findById(1);
expect(user.name).toBe('Alice');
```

### Strict Mode

Strict mode throws an error when calling methods that haven't been stubbed:

```typescript
interface Service {
	doSomething: (value: string) => boolean;
}

const service = createMock<Service>({}, { strict: true });

// This will throw an error
expect(() => service.doSomething('test')).toThrow(
	'Method mock.doSomething was called without being explicitly stubbed',
);

// Stub the method first
service.doSomething.mockReturnValue(true);
expect(service.doSomething('test')).toBe(true); // Now it works
```

### Mocking with Optional Properties

```typescript
interface Config {
	apiUrl: string;
	timeout?: number;
	retries?: number;
}

const config = createMock<Config>({
	apiUrl: 'https://api.example.com',
	timeout: undefined, // Explicitly set optional property
});

expect(config.apiUrl).toBe('https://api.example.com');
expect(config.timeout).toBeUndefined();
```

### Property Assignment

Mocked properties can be reassigned:

```typescript
const service = createMock<{ value: number }>();

service.value = 42;
expect(service.value).toBe(42);

service.value = 99;
expect(service.value).toBe(99);
```

### Chaining Mock Return Values

```typescript
interface Validator {
	validate: () => boolean;
}

const validator = createMock<Validator>();

validator.validate
	.mockReturnValueOnce(true)
	.mockReturnValueOnce(false)
	.mockReturnValueOnce(true);

expect(validator.validate()).toBe(true);
expect(validator.validate()).toBe(false);
expect(validator.validate()).toBe(true);
```

### Mocking Async Functions

```typescript
interface AsyncService {
	fetchUser: (id: number) => Promise<{ id: number; name: string }>;
}

const service = createMock<AsyncService>({
	fetchUser: async (id) => ({ id, name: 'User ' + id }),
});

const user = await service.fetchUser(123);
expect(user).toEqual({ id: 123, name: 'User 123' });
expect(service.fetchUser).toHaveBeenCalledWith(123);
```

## Comparison with Other Solutions

### vs Manual Mocking

**Manual:**

```typescript
const service = {
	method1: vi.fn(),
	method2: vi.fn(),
	nested: {
		method3: vi.fn(),
	},
} as unknown as MyService;
```

**With deepmocked:**

```typescript
const service = createMock<MyService>();
```

The API is intentionally identical to `@golevelup/ts-jest` to make migration seamless.

## How It Works

`deepmocked` uses JavaScript Proxies to:

1. Intercept property access on the mocked object
2. Return mock functions from your mock library for methods
3. Recursively create nested proxies for deep mocking
4. Cache created mocks for consistent behavior
5. Allow property assignment and mock configuration

The proxy engine is shared. Each adapter only tells it how to create and recognize its library's mock functions and which of their methods to pass through, and types every mocked function as that library's mock type (`Mock<T>` for Vitest).

The Vitest adapter creates mocks with `vi` from the `vitest` package itself, so `vi.clearAllMocks()`, `vi.resetAllMocks()` and Vitest's `clearMocks` option apply to them like any other `vi.fn()`.

## TypeScript Support

This library is written in TypeScript and provides full type safety:

- Type inference for mocked methods
- Autocomplete for all properties and methods
- Type checking for partial implementations
- Proper typing for nested objects and return values

## Development

### Prerequisites

- Node.js
- pnpm

### Commands

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Rebuild the library on file changes
pnpm run dev

# Build the library
pnpm run build

# Type check
pnpm run typecheck
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [Jake Klassen](https://github.com/jakeklassen)

## Credits

This library started as a port of the excellent [`@golevelup/ts-jest`](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-jest) library. Thanks to the original authors for their work!

## Related Projects

- [Vitest](https://vitest.dev/) - Next generation testing framework
- [@golevelup/ts-jest](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-jest) - The original Jest version
- [@golevelup/ts-vitest](https://github.com/golevelup/nestjs/tree/master/packages/testing/ts-vitest) - golevelup's own Vitest version
