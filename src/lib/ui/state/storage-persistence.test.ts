import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	configureStoragePersistence,
	ensurePersistentStorage,
	requestPersistentStorage,
	storagePersistence,
	type PersistentStorageApi
} from './storage-persistence.svelte.js';

function fakeApi(overrides: Partial<PersistentStorageApi> = {}): PersistentStorageApi {
	return {
		persisted: vi.fn(async () => false),
		persist: vi.fn(async () => true),
		permissionState: vi.fn(async () => 'prompt' as const),
		...overrides
	};
}

describe('storage persistence', () => {
	afterEach(() => configureStoragePersistence());

	it('reports unsupported where the browser has no storage API', async () => {
		// This suite runs server-side, so the resolved browser API is absent —
		// which is exactly the unsupported branch.
		await ensurePersistentStorage();
		expect(storagePersistence()).toBe('unsupported');
	});

	it('reads an already-persistent bucket without asking anything', async () => {
		const api = fakeApi({ persisted: vi.fn(async () => true) });
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(storagePersistence()).toBe('persistent');
		expect(api.persist).not.toHaveBeenCalled();
		expect(api.permissionState).not.toHaveBeenCalled();
	});

	it('takes a silent grant where the permission is already granted', async () => {
		const api = fakeApi({ permissionState: vi.fn(async () => 'granted' as const) });
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(api.persist).toHaveBeenCalledOnce();
		expect(storagePersistence()).toBe('persistent');
	});

	it('reads a refused persist as denied even under a granted permission', async () => {
		const api = fakeApi({
			permissionState: vi.fn(async () => 'granted' as const),
			persist: vi.fn(async () => false)
		});
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(storagePersistence()).toBe('denied');
	});

	it('never calls persist uninvited where the browser would prompt', async () => {
		const api = fakeApi();
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(storagePersistence()).toBe('prompt');
		expect(api.persist).not.toHaveBeenCalled();
	});

	it('treats an unanswerable permission query as a prompt, not a licence', async () => {
		// Safari cannot be queried for this permission name, and a browser whose
		// prompting behaviour is unknown must not be asked without a press.
		const api = fakeApi({ permissionState: vi.fn(async () => 'unknown' as const) });
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(storagePersistence()).toBe('prompt');
		expect(api.persist).not.toHaveBeenCalled();
	});

	it('records a denied permission without asking', async () => {
		const api = fakeApi({ permissionState: vi.fn(async () => 'denied' as const) });
		configureStoragePersistence(api);

		await ensurePersistentStorage();

		expect(storagePersistence()).toBe('denied');
		expect(api.persist).not.toHaveBeenCalled();
	});

	it('spends the explicit request and reports the outcome', async () => {
		const api = fakeApi();
		configureStoragePersistence(api);

		await expect(requestPersistentStorage()).resolves.toBe(true);
		expect(storagePersistence()).toBe('persistent');

		configureStoragePersistence(fakeApi({ persist: vi.fn(async () => false) }));
		await expect(requestPersistentStorage()).resolves.toBe(false);
		expect(storagePersistence()).toBe('denied');
	});
});
