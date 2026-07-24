import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import lyricCases from '../../../fixtures/lyrics/cases.json';
import { createAutosaveController } from './autosave.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';
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
		const { repository } = await createRepository('delete-all');
		await repository.create({ id: 'draft-a', text: 'A' });
		await repository.create({ id: 'draft-b', text: 'B' });
		await repository.setCurrent('draft-b');

		await repository.deleteAll();

		expect(await repository.list()).toEqual([]);
		expect(await repository.getCurrent()).toBeUndefined();
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

	it('reports a failed local write without exposing an error payload', async () => {
		const { repository } = await createRepository('failed-save');
		const failingRepository: DraftRepository = {
			...repository,
			async save(record: DraftRecord) {
				throw new Error(record.text);
			}
		};
		const autosave = createAutosaveController(failingRepository);

		autosave.schedule({
			revision: 1,
			draft: draft({ id: 'failed-draft', text: 'private lyric content' })
		});
		await autosave.flush();

		expect(autosave.status()).toBe('failed');
		expect(Object.keys(autosave)).toEqual(['schedule', 'flush', 'cancel', 'status']);
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

	it('creates and selects a blank draft only when no draft is recoverable', async () => {
		const { repository } = await createRepository('recover-blank');

		const recovered = await recoverStartupDraft(repository);

		expect(recovered.text).toBe('');
		expect(recovered.title).toBe('Untitled draft');
		expect(await repository.getCurrent()).toBe(recovered.id);
		expect((await repository.list()).map(({ id }) => id)).toEqual([recovered.id]);
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
