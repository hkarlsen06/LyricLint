import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_NAME, openDatabase } from '$lib/persistence/database.js';
import {
	assistantDraftAccessKey,
	clearDraftAccess,
	getDraftAccess,
	setDraftAccess
} from './permissions.js';

afterEach(async () => {
	await Dexie.delete(DEFAULT_DATABASE_NAME);
});

describe('assistant draft access', () => {
	it('returns undefined until this draft has a decision', async () => {
		expect(await getDraftAccess('draft-a')).toBeUndefined();
	});

	it('stores a grant with the time it was decided', async () => {
		await setDraftAccess('draft-a', 'granted');

		expect(await getDraftAccess('draft-a')).toBe('granted');
		const database = await openDatabase();
		const record = await database.appMetadata.get(assistantDraftAccessKey('draft-a'));
		database.close();
		expect(JSON.parse(record!.value)).toEqual({
			decision: 'granted',
			decidedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
		});
	});

	it('stores a denial independently for each draft', async () => {
		await setDraftAccess('draft-a', 'denied');
		await setDraftAccess('draft-b', 'granted');

		expect(await getDraftAccess('draft-a')).toBe('denied');
		expect(await getDraftAccess('draft-b')).toBe('granted');
	});

	it('clears one decision so the draft can ask again', async () => {
		await setDraftAccess('draft-a', 'granted');
		await clearDraftAccess('draft-a');

		expect(await getDraftAccess('draft-a')).toBeUndefined();
	});

	it('ignores malformed metadata rather than inventing a decision', async () => {
		const database = await openDatabase();
		await database.appMetadata.put({
			key: assistantDraftAccessKey('draft-a'),
			value: '{"decision":"maybe"}',
			updatedAt: new Date().toISOString()
		});
		database.close();

		expect(await getDraftAccess('draft-a')).toBeUndefined();
	});
});
