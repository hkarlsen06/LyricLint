import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assistantDraftAccessKey } from '$lib/assistant/permissions.js';
import { createWorkspaceBackup, parseWorkspaceBackup, WorkspaceBackupError } from './backup.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from './database.js';
import { createDraftIgnoreStore } from './draft-ignores.js';
import type { DraftRecord } from './types.js';

const databases = new Map<string, LyricLintDatabase>();

function draft(id: string, text: string): DraftRecord {
	return {
		id,
		title: `Draft ${id}`,
		text,
		originalText: `Original ${id}`,
		language: 'en',
		performers: [
			{
				id: `performer-${id}`,
				displayName: 'Renée',
				normalizedKey: 'renée',
				aliases: ['R'],
				colorId: 'plum',
				order: 0
			}
		],
		createdAt: '2026-07-01T10:00:00.000Z',
		updatedAt: '2026-07-02T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: { anchor: 1, head: 3 },
		lineAnchors: [{ line: 1, time: 12.5 }],
		sectionLinks: [{ lines: [1, 4], holes: [{ line: 2, column: 0, endLine: 2, endColumn: 5 }] }]
	};
}

async function database(label: string): Promise<LyricLintDatabase> {
	const name = `backup-${label}-${crypto.randomUUID()}`;
	const opened = await openDatabase(name);
	databases.set(name, opened);
	return opened;
}

afterEach(async () => {
	for (const [name, opened] of databases) {
		closeDatabase(opened);
		await Dexie.delete(name);
	}
	databases.clear();
});

describe('workspace backup', () => {
	it('stays disconnected when the remembered handle cannot be read', async () => {
		const db = await database('handle-read-failure');
		vi.spyOn(db.backupHandles, 'get').mockRejectedValueOnce(new Error('storage refused'));
		const backup = createWorkspaceBackup(db);

		backup.schedule();
		await expect(backup.flush()).resolves.toBeUndefined();
		backup.schedule();
		await expect(backup.flush()).resolves.toBeUndefined();
		expect(backup.state()).toMatchObject({ status: 'idle' });
		expect(backup.state().linkedFileName).toBeUndefined();

		backup.destroy();
	});

	it('adds imported drafts without changing local workspace data', async () => {
		const source = await database('source');
		await source.drafts.bulkAdd([draft('a', '[Verse]\nOne'), draft('b', '[Chorus]\nTwo')]);
		await source.appMetadata.bulkAdd([
			{
				key: 'currentDraftId',
				value: 'b',
				updatedAt: '2026-07-02T10:00:00.000Z'
			},
			{
				key: 'recentLanguages',
				value: '["no","en"]',
				updatedAt: '2026-07-02T10:00:00.000Z'
			},
			{
				key: 'sourceOnly',
				value: 'import me',
				updatedAt: '2026-07-02T10:00:00.000Z'
			}
		]);
		await source.mediaHandles.bulkAdd([
			{
				draftId: 'a',
				name: 'song.mp3',
				size: 1234,
				position: 42,
				attachedAt: '2026-07-02T10:00:00.000Z'
			},
			{
				draftId: 'b',
				name: 'Video',
				source: 'youtube',
				videoId: 'dQw4w9WgXcQ',
				position: 18,
				attachedAt: '2026-07-02T10:00:00.000Z'
			}
		]);
		const sourceIgnores = await createDraftIgnoreStore(source);
		sourceIgnores.ignore('a', 'diagnostic:a');

		const sourceBackup = createWorkspaceBackup(source, {
			now: () => '2026-07-27T12:00:00.000Z',
			ignoreStore: sourceIgnores
		});
		const json = await sourceBackup.serialize();
		const parsed = parseWorkspaceBackup(json);
		expect(parsed.createdAt).toBe('2026-07-27T12:00:00.000Z');
		expect(parsed.drafts).toEqual([draft('a', '[Verse]\nOne'), draft('b', '[Chorus]\nTwo')]);
		expect(parsed.appMetadata.map(({ key }) => key).sort()).toEqual([
			'currentDraftId',
			'recentLanguages',
			'sourceOnly'
		]);
		expect(parsed.media).toHaveLength(2);
		expect(parsed.ignoredDiagnostics).toEqual([{ draftId: 'a', keys: ['diagnostic:a'] }]);

		const destination = await database('destination');
		await destination.drafts.bulkAdd([draft('a', 'local collision'), draft('local', 'keep me')]);
		await destination.appMetadata.bulkAdd([
			{
				key: 'currentDraftId',
				value: 'local',
				updatedAt: '2026-07-20T10:00:00.000Z'
			},
			{
				key: 'recentLanguages',
				value: '["fr","en"]',
				updatedAt: '2026-07-20T10:00:00.000Z'
			},
			{
				key: 'localOnly',
				value: 'keep me',
				updatedAt: '2026-07-20T10:00:00.000Z'
			}
		]);
		await destination.mediaHandles.add({
			draftId: 'a',
			name: 'local.mp3',
			position: 7,
			attachedAt: '2026-07-20T10:00:00.000Z'
		});
		const destinationIgnores = await createDraftIgnoreStore(destination);
		destinationIgnores.ignore('a', 'diagnostic:local');
		const destinationBackup = createWorkspaceBackup(destination, {
			now: () => '2026-07-27T13:00:00.000Z',
			ignoreStore: destinationIgnores
		});

		await expect(
			destinationBackup.restore(
				new File([json], 'LyricLint backup.json', { type: 'application/json' })
			)
		).resolves.toBe(2);

		const drafts = await destination.drafts.toArray();
		const importedCollision = drafts.find((record) => record.text === '[Verse]\nOne');
		expect(drafts).toHaveLength(4);
		expect(await destination.drafts.get('a')).toEqual(draft('a', 'local collision'));
		expect(await destination.drafts.get('local')).toEqual(draft('local', 'keep me'));
		expect(importedCollision?.id).not.toBe('a');
		expect(await destination.drafts.get('b')).toEqual(draft('b', '[Chorus]\nTwo'));

		expect(await destination.appMetadata.get('currentDraftId')).toMatchObject({ value: 'local' });
		expect(await destination.appMetadata.get('recentLanguages')).toMatchObject({
			value: '["fr","en","no"]'
		});
		expect(await destination.appMetadata.get('localOnly')).toMatchObject({ value: 'keep me' });
		expect(await destination.appMetadata.get('sourceOnly')).toMatchObject({ value: 'import me' });

		expect(await destination.mediaHandles.get('a')).toMatchObject({
			name: 'local.mp3',
			position: 7
		});
		expect(await destination.mediaHandles.get(importedCollision?.id as string)).toMatchObject({
			name: 'song.mp3',
			position: 42
		});
		expect(await destination.mediaHandles.get('b')).toMatchObject({
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			position: 18
		});
		expect(destinationIgnores.list('a')).toEqual(['diagnostic:local']);
		expect(destinationIgnores.list(importedCollision?.id as string)).toEqual(['diagnostic:a']);
		// On disk by the time `restore` resolves, and written by the restore's own
		// transaction rather than by the store behind it: the caller reloads the
		// page the moment this returns, and a put still queued at unload aborts.
		expect(await destination.draftIgnores.get(importedCollision?.id as string)).toMatchObject({
			keys: ['diagnostic:a']
		});
		expect(await destination.draftIgnores.get('a')).toMatchObject({
			keys: ['diagnostic:local']
		});
		// The restore wrote through the store, so a reload's fresh hydration —
		// a new store over the same database — sees the imported ignores too.
		const rehydrated = await createDraftIgnoreStore(destination);
		expect(rehydrated.list(importedCollision?.id as string)).toEqual(['diagnostic:a']);
		sourceBackup.destroy();
		destinationBackup.destroy();
	});

	/*
	 * `assistantDraftAccess:<id>` names a draft, and an import may not land its
	 * drafts under the ids they were written with — so imported verbatim, a read
	 * decision answered for whichever local draft happened to hold the old id,
	 * and one whose draft never made it into the import stayed as an orphan
	 * nothing sweeps, because deleting a draft clears only its own key.
	 */
	it('remaps an imported assistant read decision and drops one with no draft', async () => {
		const source = await database('assistant-access-source');
		await source.drafts.add(draft('a', '[Verse]\nOne'));
		await source.appMetadata.bulkAdd([
			{
				key: assistantDraftAccessKey('a'),
				value: '{"decision":"granted","decidedAt":"2026-07-02T10:00:00.000Z"}',
				updatedAt: '2026-07-02T10:00:00.000Z'
			},
			{
				key: assistantDraftAccessKey('gone'),
				value: '{"decision":"denied","decidedAt":"2026-07-02T10:00:00.000Z"}',
				updatedAt: '2026-07-02T10:00:00.000Z'
			}
		]);
		const sourceBackup = createWorkspaceBackup(source, { now: () => '2026-07-27T12:00:00.000Z' });
		const json = await sourceBackup.serialize();

		// The destination already holds a draft `a`, so the import lands under a
		// fresh id and the decision has to follow it.
		const destination = await database('assistant-access-destination');
		await destination.drafts.add(draft('a', 'local collision'));
		const destinationBackup = createWorkspaceBackup(destination, {
			now: () => '2026-07-27T13:00:00.000Z'
		});

		await destinationBackup.restore(
			new File([json], 'LyricLint backup.json', { type: 'application/json' })
		);

		const imported = (await destination.drafts.toArray()).find(
			(record) => record.text === '[Verse]\nOne'
		);
		expect(
			await destination.appMetadata.get(assistantDraftAccessKey(imported?.id as string))
		).toMatchObject({ value: '{"decision":"granted","decidedAt":"2026-07-02T10:00:00.000Z"}' });
		expect(await destination.appMetadata.get(assistantDraftAccessKey('a'))).toBeUndefined();
		expect(await destination.appMetadata.get(assistantDraftAccessKey('gone'))).toBeUndefined();

		sourceBackup.destroy();
		destinationBackup.destroy();
	});

	it('rejects malformed data before importing anything', async () => {
		const db = await database('invalid');
		await db.drafts.add(draft('safe', 'keep me'));
		const backup = createWorkspaceBackup(db);
		const invalid = JSON.stringify({
			format: 'lyriclint-workspace',
			version: 1,
			createdAt: '2026-07-27T12:00:00.000Z',
			drafts: [{ id: 'broken' }],
			appMetadata: [],
			media: [],
			ignoredDiagnostics: []
		});

		await expect(
			backup.restore(new File([invalid], 'broken.json', { type: 'application/json' }))
		).rejects.toBeInstanceOf(WorkspaceBackupError);
		expect((await db.drafts.toArray()).map(({ id }) => id)).toEqual(['safe']);
		backup.destroy();
	});
});
