import { afterEach, describe, expect, it } from 'vitest';
import { randomId } from './random-id.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('randomId', () => {
	afterEach(() => {
		Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
	});

	it('is a v4 uuid where the platform provides one', () => {
		expect(randomId()).toMatch(UUID_V4);
	});

	/**
	 * An insecure context — `http://` on a LAN address, which is how the workbench
	 * is opened on a phone during development. `randomUUID` simply is not there,
	 * and an id still has to be minted or the boot sequence throws.
	 */
	it('is a v4 uuid where randomUUID is missing', () => {
		Object.defineProperty(globalThis.crypto, 'randomUUID', {
			value: undefined,
			configurable: true
		});

		const ids = Array.from({ length: 100 }, () => randomId());
		for (const id of ids) expect(id).toMatch(UUID_V4);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
