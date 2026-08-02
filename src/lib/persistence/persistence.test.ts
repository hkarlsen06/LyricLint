import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import lyricCases from '../../../fixtures/lyrics/cases.json';
import { assistantDraftAccessKey } from '$lib/assistant/permissions.js';
import { createAutosaveController } from './autosave.js';
import { createWorkspaceBackup, parseWorkspaceBackup } from './backup.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';
import { createMediaRepository } from './media-repository.js';
import { recoverStartupDraft } from './recovery.js';
import { createSessionIgnoreStore } from './session-ignores.js';
import type {
	AutosaveSnapshot,
	DraftRecord,
	DraftRepository,
	PerformerRecord,
	SessionStorageLike
} from './types.js';

const databaseNames = new Set<string>();
const openDatabases = new Set<LyricLintDatabase>();

function databaseName(label: string): string {
	const name = `lyriclint-test-${label}-${crypto.randomUUID()}`;
	databaseNames.add(name);
	return name;
}

async function createRepository(label: string) {
	const database = await openDatabase(databaseName(label));
	openDatabases.add(database);
	return {
		database,
		repository: createDraftRepository(database)
	};
}

function closeTestDatabase(database: LyricLintDatabase): void {
	closeDatabase(database);
	openDatabases.delete(database);
}

function performer(displayName = 'Renée'): PerformerRecord {
	return {
		id: crypto.randomUUID(),
		displayName,
		normalizedKey: displayName.toLocaleLowerCase('en'),
		aliases: [],
		colorId: 'blue',
		order: 0
	};
}

function draft(overrides: Partial<DraftRecord> & Pick<DraftRecord, 'id' | 'text'>): DraftRecord {
	return {
		title: 'Recovered draft',
		language: 'en',
		performers: [performer()],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		ruleSetVersion: '2026.1',
		...overrides
	};
}

afterEach(async () => {
	vi.useRealTimers();
	for (const database of openDatabases) {
		closeDatabase(database);
	}
	openDatabases.clear();

	await Promise.all([...databaseNames].map((name) => Dexie.delete(name)));
	databaseNames.clear();
});

describe('draft repository', () => {
	it('supports create, list, rename, duplicate, delete, and current-draft operations', async () => {
		const { repository } = await createRepository('crud');
		const roster = [performer('Avery')];
		const original = await repository.create({
			id: 'draft-a',
			title: 'First',
			text: '[Verse]\r\nExact text',
			originalText: 'Imported provenance',
			language: 'en',
			performers: roster,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			ruleSetVersion: '1',
			editorSelection: { anchor: 4, head: 8 }
		});
		await repository.create({
			id: 'draft-b',
			title: 'Second',
			text: 'newer',
			updatedAt: '2026-01-02T00:00:00.000Z'
		});

		expect((await repository.list()).map(({ id }) => id)).toEqual(['draft-b', 'draft-a']);

		await repository.rename(original.id, 'Renamed');
		expect((await repository.get(original.id))?.title).toBe('Renamed');

		const duplicate = await repository.duplicate(original.id);
		expect(duplicate.id).not.toBe(original.id);
		expect(duplicate.text).toBe(original.text);
		expect(duplicate.performers).toEqual(original.performers);
		expect(duplicate.performers).not.toBe(original.performers);
		expect(duplicate.originalText).toBe(original.originalText);

		await repository.setCurrent(duplicate.id);
		expect(await repository.getCurrent()).toBe(duplicate.id);

		await repository.delete(duplicate.id);
		expect(await repository.get(duplicate.id)).toBeUndefined();
		expect(await repository.getCurrent()).toBeUndefined();
	});

	it('keeps import provenance immutable and strips non-contract fields when saving', async () => {
		const { database, repository } = await createRepository('snapshot-boundary');
		const created = await repository.create({
			id: 'draft-a',
			text: 'canonical',
			originalText: 'original import'
		});
		const unsafeSnapshot: DraftRecord & { diagnostics: string[] } = {
			...created,
			text: 'changed',
			originalText: 'attempted replacement',
			diagnostics: ['must not persist']
		};

		await repository.save(unsafeSnapshot);

		const stored = await database.drafts.get(created.id);
		expect(stored?.text).toBe('changed');
		expect(stored?.originalText).toBe('original import');
		expect(stored).not.toHaveProperty('diagnostics');
	});

	it('deleteAll removes every draft and the current pointer', async () => {
		const { database, repository } = await createRepository('delete-all');
		await repository.create({ id: 'draft-a', text: 'A' });
		await repository.create({ id: 'draft-b', text: 'B' });
		await repository.setCurrent('draft-b');
		await database.appMetadata.put({
			key: assistantDraftAccessKey('draft-a'),
			value: '{"decision":"granted","decidedAt":"2026-01-01T00:00:00.000Z"}',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});

		await repository.deleteAll();

		expect(await repository.list()).toEqual([]);
		expect(await repository.getCurrent()).toBeUndefined();
		expect(await database.appMetadata.get(assistantDraftAccessKey('draft-a'))).toBeUndefined();
	});

	// The tools panel promises "Delete all local data" leaves nothing behind, and
	// attached audio is local data. The sweep belongs to the repository rather
	// than to its callers: a guarantee kept by every call site remembering to make
	// a second call is one that will eventually be broken.
	it('takes attached audio with the draft it belongs to', async () => {
		const { database, repository } = await createRepository('media-delete');
		const media = createMediaRepository(database);
		await repository.create({ id: 'draft-a', text: 'A' });
		await repository.create({ id: 'draft-b', text: 'B' });
		await media.attach({ draftId: 'draft-a', name: 'a.mp3' });
		await media.attach({ draftId: 'draft-b', name: 'b.mp3' });

		await repository.delete('draft-a');

		expect(await media.get('draft-a')).toBeUndefined();
		expect((await media.get('draft-b'))?.name).toBe('b.mp3');
	});

	it('takes the assistant read decision with the draft it belongs to', async () => {
		const { database, repository } = await createRepository('assistant-access-delete');
		await repository.create({ id: 'draft-a', text: 'A' });
		await repository.create({ id: 'draft-b', text: 'B' });
		await database.appMetadata.bulkPut([
			{
				key: assistantDraftAccessKey('draft-a'),
				value: '{"decision":"granted","decidedAt":"2026-01-01T00:00:00.000Z"}',
				updatedAt: '2026-01-01T00:00:00.000Z'
			},
			{
				key: assistantDraftAccessKey('draft-b'),
				value: '{"decision":"denied","decidedAt":"2026-01-01T00:00:00.000Z"}',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		]);

		await repository.delete('draft-a');

		expect(await database.appMetadata.get(assistantDraftAccessKey('draft-a'))).toBeUndefined();
		expect(await database.appMetadata.get(assistantDraftAccessKey('draft-b'))).toBeDefined();
	});

	// Every source's id has to survive the trip, and `trackId` is the field a
	// hand-written copier drops in silence — which is exactly how it was lost from
	// the in-memory double the day Spotify was added.
	it('keeps each source and its id whole across a reopen', async () => {
		const { database, repository } = await createRepository('media-sources');
		const media = createMediaRepository(database);
		await repository.create({ id: 'draft-yt', text: 'A' });
		await repository.create({ id: 'draft-sp', text: 'B' });
		await repository.create({ id: 'draft-am', text: 'C' });

		await media.attach({
			draftId: 'draft-yt',
			name: 'youtu.be/dQw4w9WgXcQ',
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			position: 12
		});
		await media.attach({
			draftId: 'draft-sp',
			name: 'Mul — Sensommer',
			source: 'spotify',
			trackId: '4cOdK2wGLETKBW3PvgPWqT',
			position: 34
		});
		await media.attach({
			draftId: 'draft-am',
			name: 'Kygo — Stole the Show',
			source: 'apple',
			songId: '1091453645',
			position: 56
		});

		expect(await media.get('draft-yt')).toMatchObject({
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			position: 12
		});
		expect(await media.get('draft-sp')).toMatchObject({
			source: 'spotify',
			trackId: '4cOdK2wGLETKBW3PvgPWqT',
			position: 34
		});
		expect(await media.get('draft-am')).toMatchObject({
			source: 'apple',
			songId: '1091453645',
			position: 56
		});
	});

	// A song chosen for a draft with no words yet is deliberate work, and the
	// startup sweep used to throw it away: the blank draft was deleted, `delete`
	// cleared its media record in the same transaction, and the attachment was
	// gone with no sign there had been one.
	it('keeps a wordless draft that has audio attached, and sweeps one that has not', async () => {
		const { database, repository } = await createRepository('media-blank-draft');
		const media = createMediaRepository(database);
		await repository.create({ id: 'draft-scored', text: '' });
		await repository.create({ id: 'draft-bare', text: '' });
		await media.attach({
			draftId: 'draft-scored',
			name: 'Mul — Sensommer',
			source: 'spotify',
			trackId: '4cOdK2wGLETKBW3PvgPWqT'
		});

		const recovered = await recoverStartupDraft(repository, media);

		expect(recovered.id).toBe('draft-scored');
		expect(await media.get('draft-scored')).toBeDefined();
		// The draft with nothing at all in it is still swept, which is the rule
		// this exception is carved out of.
		expect(await repository.get('draft-bare')).toBeUndefined();
	});

	it('deleteAll leaves no attached audio behind either', async () => {
		const { database, repository } = await createRepository('media-delete-all');
		const media = createMediaRepository(database);
		await repository.create({ id: 'draft-a', text: 'A' });
		await media.attach({ draftId: 'draft-a', name: 'a.mp3', size: 4096 });

		await repository.deleteAll();

		expect(await media.get('draft-a')).toBeUndefined();
	});

	it('remembers a track for a draft across sessions', async () => {
		const name = databaseName('media-reopen');
		const firstDatabase = await openDatabase(name);
		openDatabases.add(firstDatabase);
		await createMediaRepository(firstDatabase).attach({
			draftId: 'draft-a',
			name: 'sensommer.mp3',
			size: 8_000_000
		});
		closeTestDatabase(firstDatabase);

		const reopenedDatabase = await openDatabase(name);
		openDatabases.add(reopenedDatabase);
		const reopened = await createMediaRepository(reopenedDatabase).get('draft-a');

		expect(reopened?.name).toBe('sensommer.mp3');
		expect(reopened?.size).toBe(8_000_000);
	});

	// A video is a discriminant and an id where a file is a handle and a size, and
	// both live in the same `version(2)` table. Neither field is indexed, so the
	// live schema takes them without a migration — which is the whole reason the
	// discriminant is optional rather than required.
	it('remembers a video for a draft across sessions, beside the files', async () => {
		const name = databaseName('media-video-reopen');
		const firstDatabase = await openDatabase(name);
		openDatabases.add(firstDatabase);
		const media = createMediaRepository(firstDatabase);
		await media.attach({ draftId: 'draft-a', name: 'a.mp3', size: 4096, source: 'file' });
		await media.attach({
			draftId: 'draft-b',
			name: 'youtu.be/dQw4w9WgXcQ',
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			position: 143
		});
		// The title arrives after the record does, and must not take the id with it.
		await media.saveName('draft-b', 'Sensommer');
		closeTestDatabase(firstDatabase);

		const reopenedDatabase = await openDatabase(name);
		openDatabases.add(reopenedDatabase);
		const reopened = createMediaRepository(reopenedDatabase);

		expect(await reopened.get('draft-a')).toMatchObject({ source: 'file', size: 4096 });
		expect(await reopened.get('draft-b')).toMatchObject({
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			name: 'Sensommer',
			position: 143
		});
	});

	it('deleteAll leaves no remembered video behind either', async () => {
		const { database, repository } = await createRepository('media-video-delete-all');
		const media = createMediaRepository(database);
		await repository.create({ id: 'draft-a', text: 'A' });
		await media.attach({
			draftId: 'draft-a',
			name: 'youtu.be/dQw4w9WgXcQ',
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ'
		});

		await repository.deleteAll();

		expect(await media.get('draft-a')).toBeUndefined();
	});

	it('persists a bounded, deduplicated recent-language history across sessions', async () => {
		const name = databaseName('recent-languages');
		const firstDatabase = await openDatabase(name);
		openDatabases.add(firstDatabase);
		const firstRepository = createDraftRepository(firstDatabase);

		for (const language of ['en', 'no', 'fr', 'de', 'es', 'ja', 'fr']) {
			await firstRepository.rememberLanguage(language);
		}
		expect(await firstRepository.getRecentLanguages()).toEqual(['fr', 'ja', 'es', 'de', 'no']);
		closeTestDatabase(firstDatabase);

		const reopenedDatabase = await openDatabase(name);
		openDatabases.add(reopenedDatabase);
		const reopenedRepository = createDraftRepository(reopenedDatabase);
		expect(await reopenedRepository.getRecentLanguages()).toEqual(['fr', 'ja', 'es', 'de', 'no']);

		await reopenedRepository.deleteAll();
		expect(await reopenedRepository.getRecentLanguages()).toEqual(['fr', 'ja', 'es', 'de', 'no']);
	});
});

describe('assistant message persistence', () => {
	it('keeps tool turns and their opaque provider items across a reopen', async () => {
		const name = databaseName('assistant-tool-turns');
		const first = await openDatabase(name);
		openDatabases.add(first);
		await first.assistantMessages.add({
			id: 'message-a',
			chatId: 'chat-a',
			role: 'assistant',
			createdAt: '2026-01-01T00:00:00.000Z',
			status: 'pending',
			content: '',
			toolTurns: [
				{
					calls: [
						{
							callId: 'call-a',
							name: 'propose_edits',
							proposals: [
								{
									id: 'proposal-a',
									anchor: { exact: 'Dont', before: '', after: ' stop' },
									replacement: "Don't",
									note: 'Use the contraction.',
									status: 'pending'
								}
							]
						}
					],
					providerItems: '[{"type":"reasoning","encrypted_content":"opaque"}]'
				}
			]
		});
		closeTestDatabase(first);

		const reopened = await openDatabase(name);
		openDatabases.add(reopened);
		const message = await reopened.assistantMessages.get('message-a');

		expect(message?.toolTurns?.[0]?.providerItems).toContain('encrypted_content');
		expect(message?.toolTurns?.[0]?.calls[0]).toMatchObject({
			name: 'propose_edits',
			proposals: [{ id: 'proposal-a', status: 'pending' }]
		});
	});
});

describe('autosave and recovery', () => {
	it('round-trips the Unicode/CRLF fixture and latest selection after flush and reopen', async () => {
		const fixture = lyricCases.find(({ id }) => id === 'autosave-recovery-unicode');
		expect(fixture).toBeDefined();
		if (fixture === undefined) {
			return;
		}

		const name = databaseName('unicode');
		const firstDatabase = await openDatabase(name);
		openDatabases.add(firstDatabase);
		const firstRepository = createDraftRepository(firstDatabase);
		const savedDraft = draft({
			id: 'unicode-draft',
			text: fixture.input,
			editorSelection: { anchor: 19, head: 42 }
		});
		const autosave = createAutosaveController(firstRepository, { debounceMs: 50 });

		autosave.schedule({ revision: 1, draft: savedDraft });
		expect(autosave.status()).toBe('scheduled');
		await autosave.flush();
		expect(autosave.status()).toBe('saved');
		closeTestDatabase(firstDatabase);

		const reopenedDatabase = await openDatabase(name);
		openDatabases.add(reopenedDatabase);
		const recovered = await createDraftRepository(reopenedDatabase).get(savedDraft.id);
		expect(recovered?.text).toBe(fixture.input);
		expect(recovered?.editorSelection).toEqual(savedDraft.editorSelection);
		expect(new TextEncoder().encode(recovered?.text)).toEqual(
			new TextEncoder().encode(fixture.input)
		);
	});

	/*
	 * Three separate hand-written copiers stand between a draft and the disk —
	 * `copySnapshot` in the autosave, and `copyDraft` and `createRecord` in the
	 * repository — and every one of them lists the fields it keeps. A field added
	 * to `DraftRecord` and missed by any of them is dropped in silence: that is how
	 * `lineAnchors` came to be stripped by the autosave, so a whole synced song was
	 * gone on reload while every layer above it looked correct.
	 *
	 * This is the guard for the next one. It populates every optional field and
	 * asserts the record comes back whole, so a copier that forgets one fails here
	 * rather than in somebody's lost work.
	 */
	it('writes every field of a draft, including the ones only some copiers know about', async () => {
		const name = databaseName('whole-record');
		const database = await openDatabase(name);
		openDatabases.add(database);
		const repository = createDraftRepository(database);
		const complete = {
			...draft({ id: 'whole-draft', text: '[Verse]\nFirst line\nSecond line' }),
			originalText: '[Verse]\noriginal',
			editorSelection: { anchor: 3, head: 7 },
			lineAnchors: [
				{ line: 2, time: 12.5 },
				{ line: 3, time: 30 }
			],
			// Holes and all: a link is two facts now, and the three hand-written
			// copiers between a draft and the disk each list the fields they keep.
			// Both of them spelled out `{ lines: [...link.lines] }`, so a link that
			// gained a second field was dropped in silence by both.
			sectionLinks: [
				{
					lines: [1, 3],
					holes: [
						{ line: 2, column: 4, endLine: 2, endColumn: 9 },
						{ line: 4, column: 4, endLine: 4, endColumn: 7 }
					]
				}
			]
		} satisfies Required<DraftRecord>;
		const autosave = createAutosaveController(repository, { debounceMs: 10 });

		const created = await repository.create(complete);
		expect(created).toEqual(complete);
		expect(Object.keys(created).sort()).toEqual(Object.keys(complete).sort());

		autosave.schedule({ revision: 1, draft: complete });
		await autosave.flush();

		const backup = createWorkspaceBackup(database, {
			now: () => '2026-01-02T00:00:00.000Z'
		});
		const parsed = parseWorkspaceBackup(await backup.serialize()).drafts[0];
		expect(parsed).toEqual(complete);
		expect(Object.keys(parsed).sort()).toEqual(Object.keys(complete).sort());
		backup.destroy();

		closeTestDatabase(database);

		const reopened = await openDatabase(name);
		openDatabases.add(reopened);
		const recovered = await createDraftRepository(reopened).get(complete.id);

		expect(recovered).toEqual(complete);
		// Named separately so a failure says which field went missing rather than
		// printing two whole records side by side.
		expect(Object.keys(recovered ?? {}).sort()).toEqual(Object.keys(complete).sort());
	});

	it('serializes writes so a slow older revision cannot overwrite the newest snapshot', async () => {
		const { repository } = await createRepository('revision-order');
		vi.useFakeTimers();
		let releaseFirstSave: (() => void) | undefined;
		const firstSaveGate = new Promise<void>((resolve) => {
			releaseFirstSave = resolve;
		});
		let saveCount = 0;
		const delayedRepository: DraftRepository = {
			...repository,
			async save(record) {
				saveCount += 1;
				if (saveCount === 1) {
					await firstSaveGate;
				}
				await repository.save(record);
			}
		};
		const autosave = createAutosaveController(delayedRepository, { debounceMs: 10 });
		const first = draft({ id: 'ordered-draft', text: 'A' });
		const second = draft({
			id: 'ordered-draft',
			text: 'B',
			editorSelection: { anchor: 1, head: 1 }
		});

		autosave.schedule({ revision: 1, draft: first });
		await vi.advanceTimersByTimeAsync(10);
		expect(autosave.status()).toBe('saving');

		const secondSnapshot: AutosaveSnapshot = { revision: 2, draft: second };
		autosave.schedule(secondSnapshot);
		secondSnapshot.draft.text = 'mutated after schedule';
		const flush = autosave.flush();
		expect(saveCount).toBe(1);

		vi.useRealTimers();
		releaseFirstSave?.();
		await flush;

		expect(saveCount).toBe(2);
		expect((await repository.get('ordered-draft'))?.text).toBe('B');
		expect((await repository.get('ordered-draft'))?.editorSelection).toEqual({
			anchor: 1,
			head: 1
		});
		expect(autosave.status()).toBe('saved');
	});

	it('keeps independently debounced pending saves for different drafts', async () => {
		const { repository } = await createRepository('cross-draft-pending');
		vi.useFakeTimers();
		const savedIds: string[] = [];
		const recordingRepository: DraftRepository = {
			...repository,
			save(record) {
				savedIds.push(record.id);
				return Promise.resolve();
			}
		};
		const autosave = createAutosaveController(recordingRepository, { debounceMs: 10 });

		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'draft-a', text: 'A' })
		});
		await vi.advanceTimersByTimeAsync(5);
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'draft-b', text: 'B' })
		});

		await vi.advanceTimersByTimeAsync(5);
		expect(savedIds).toEqual(['draft-a']);
		await vi.advanceTimersByTimeAsync(5);
		expect(savedIds).toEqual(['draft-a', 'draft-b']);

		vi.useRealTimers();
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'draft-c', text: 'C' })
		});
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'draft-d', text: 'D' })
		});
		await autosave.flush();
		expect(savedIds).toEqual(['draft-a', 'draft-b', 'draft-c', 'draft-d']);
	});

	it('retains a failed write and retries it once on a later flush', async () => {
		const { repository } = await createRepository('failed-save');
		let saveCount = 0;
		const failingRepository: DraftRepository = {
			...repository,
			async save(record: DraftRecord) {
				saveCount += 1;
				if (record.id === 'failed-draft' && saveCount === 1) {
					throw new Error(record.text);
				}
				await repository.save(record);
			}
		};
		const autosave = createAutosaveController(failingRepository);

		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'failed-draft', text: 'private lyric content' })
		});
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'other-draft', text: 'must still save' })
		});
		await autosave.flush();

		expect(saveCount).toBe(2);
		expect(autosave.status()).toBe('failed');
		expect(await repository.get('failed-draft')).toBeUndefined();
		expect((await repository.get('other-draft'))?.text).toBe('must still save');

		await autosave.flush();

		expect(saveCount).toBe(3);
		expect((await repository.get('failed-draft'))?.text).toBe('private lyric content');
		expect(autosave.status()).toBe('saved');
		expect(Object.keys(autosave)).toEqual(['schedule', 'flush', 'cancel', 'cancelDraft', 'status']);
	});

	it('cancelDraft drops only that draft so a delayed save cannot recreate it', async () => {
		const { repository } = await createRepository('cancel-draft');
		await repository.create(draft({ id: 'deleted-draft', text: 'persisted' }));
		await repository.delete('deleted-draft');
		vi.useFakeTimers();
		const autosave = createAutosaveController(repository, { debounceMs: 10 });

		autosave.schedule({
			revision: 2,
			draft: draft({ id: 'deleted-draft', text: 'must not return' })
		});
		autosave.cancelDraft?.('deleted-draft');
		await vi.advanceTimersByTimeAsync(10);
		await autosave.flush();
		vi.useRealTimers();

		expect(await repository.get('deleted-draft')).toBeUndefined();
		expect(autosave.status()).toBe('idle');
	});

	it('emits every autosave status transition through onStatusChange', async () => {
		const { repository } = await createRepository('status-changes');
		const statuses: string[] = [];
		let shouldFail = true;
		const retryingRepository: DraftRepository = {
			...repository,
			async save(record) {
				if (shouldFail) {
					shouldFail = false;
					throw new Error('quota exceeded');
				}
				await repository.save(record);
			}
		};
		const autosave = createAutosaveController(retryingRepository, {
			onStatusChange(status) {
				statuses.push(status);
			}
		});

		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'status-draft', text: 'status' })
		});
		await autosave.flush();
		await autosave.flush();

		expect(statuses).toEqual(['scheduled', 'saving', 'failed', 'saving', 'saved']);
		expect(autosave.status()).toBe('saved');
	});

	it('ignores lower revisions for a draft while accepting equal and higher revisions', async () => {
		const { repository } = await createRepository('revision-guard');
		const autosave = createAutosaveController(repository);

		autosave.schedule({
			revision: 2,
			draft: draft({ id: 'revision-draft', text: 'revision two' })
		});
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'revision-draft', text: 'stale revision one' })
		});
		autosave.schedule({
			revision: 2,
			draft: draft({ id: 'revision-draft', text: 'equal revision replacement' })
		});
		await autosave.flush();
		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'revision-draft', text: 'stale after save' })
		});
		await autosave.flush();

		expect((await repository.get('revision-draft'))?.text).toBe('equal revision replacement');
	});

	it('restores the current draft before a newer draft', async () => {
		const { repository } = await createRepository('recover-current');
		await repository.create(
			draft({
				id: 'current',
				text: 'current',
				updatedAt: '2026-01-01T00:00:00.000Z'
			})
		);
		await repository.create(
			draft({
				id: 'newest',
				text: 'newest',
				updatedAt: '2026-01-02T00:00:00.000Z'
			})
		);
		await repository.setCurrent('current');

		const recovered = await recoverStartupDraft(repository);

		expect(recovered.id).toBe('current');
		expect((await repository.list()).length).toBe(2);
	});

	it('falls back to the newest recoverable draft without creating a blank one', async () => {
		const { repository } = await createRepository('recover-newest');
		await repository.create(
			draft({
				id: 'older',
				text: 'older',
				updatedAt: '2026-01-01T00:00:00.000Z'
			})
		);
		await repository.create(
			draft({
				id: 'newest',
				text: 'newest',
				updatedAt: '2026-01-02T00:00:00.000Z'
			})
		);
		await repository.setCurrent('missing');
		const create = vi.spyOn(repository, 'create');

		const recovered = await recoverStartupDraft(repository);

		expect(recovered.id).toBe('newest');
		expect(create).not.toHaveBeenCalled();
		expect(await repository.getCurrent()).toBe('newest');
	});

	it('hands back a blank draft without writing one when nothing is recoverable', async () => {
		const { repository } = await createRepository('recover-blank');

		const recovered = await recoverStartupDraft(repository);

		expect(recovered.text).toBe('');
		expect(recovered.title).toBe('Untitled transcription');
		// A draft with nothing in it has nothing to recover, so nothing is stored
		// for it until the first save that gives it text.
		expect(await repository.list()).toEqual([]);
		expect(await repository.getCurrent()).toBeUndefined();
	});

	it('sweeps blank records left behind by earlier sessions', async () => {
		const { repository } = await createRepository('recover-sweep');
		await repository.create(
			draft({ id: 'blank-newest', text: '   \n', updatedAt: '2026-01-03T00:00:00.000Z' })
		);
		await repository.create(
			draft({ id: 'written', text: 'a line', updatedAt: '2026-01-02T00:00:00.000Z' })
		);
		await repository.create(
			draft({ id: 'blank-current', text: '', updatedAt: '2026-01-01T00:00:00.000Z' })
		);
		await repository.setCurrent('blank-current');

		const recovered = await recoverStartupDraft(repository);

		expect(recovered.id).toBe('written');
		expect((await repository.list()).map(({ id }) => id)).toEqual(['written']);
		expect(await repository.getCurrent()).toBe('written');
	});
});

class MemorySessionStorage implements SessionStorageLike {
	private readonly entries = new Map<string, string>();

	get length(): number {
		return this.entries.size;
	}

	getItem(key: string): string | null {
		return this.entries.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.entries.keys()][index] ?? null;
	}

	setItem(key: string, value: string): void {
		this.entries.set(key, value);
	}

	removeItem(key: string): void {
		this.entries.delete(key);
	}

	keys(): string[] {
		return [...this.entries.keys()];
	}
}

describe('session ignores', () => {
	it('survives a same-tab reload, isolates drafts, restores, and expires with fresh storage', () => {
		const sameTabStorage = new MemorySessionStorage();
		const firstLoad = createSessionIgnoreStore(sameTabStorage);

		firstLoad.ignore('draft:A', 'rule:markup');
		expect(firstLoad.isIgnored('draft:A', 'rule:markup')).toBe(true);
		expect(firstLoad.isIgnored('draft:B', 'rule:markup')).toBe(false);
		expect(sameTabStorage.keys()[0]).toContain(encodeURIComponent('draft:A'));
		expect(sameTabStorage.keys()[0]).toContain(encodeURIComponent('rule:markup'));

		const reloaded = createSessionIgnoreStore(sameTabStorage);
		expect(reloaded.list('draft:A')).toEqual(['rule:markup']);

		reloaded.restore('draft:A', 'rule:markup');
		expect(reloaded.isIgnored('draft:A', 'rule:markup')).toBe(false);

		reloaded.ignore('draft:A', 'rule:first');
		reloaded.ignore('draft:A', 'rule:second');
		reloaded.ignore('draft:B', 'rule:first');
		reloaded.clearDraft('draft:A');
		expect(reloaded.list('draft:A')).toEqual([]);
		expect(reloaded.list('draft:B')).toEqual(['rule:first']);

		const newSession = createSessionIgnoreStore(new MemorySessionStorage());
		expect(newSession.isIgnored('draft:B', 'rule:first')).toBe(false);
	});
});
