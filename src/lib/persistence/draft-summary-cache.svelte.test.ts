import { expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';

it('refreshes summaries after real browser commits from either database connection', async () => {
	const database = await openDatabase(`summary-browser-${crypto.randomUUID()}`);
	const other = await openDatabase(database.name);
	try {
		const repository = createDraftRepository(database);
		const draft = await repository.create({ id: 'draft', text: 'Original opening' });
		expect((await repository.list())[0].lyricPreview).toBe('Original opening');
		await repository.save({ ...draft, title: 'Renamed', text: '[Verse]\nSaved opening' });
		expect((await repository.list())[0]).toMatchObject({
			title: 'Renamed',
			lyricPreview: 'Saved opening'
		});
		await other.drafts.update(draft.id, { text: 'Updated through another connection' });
		expect((await repository.list())[0].lyricPreview).toBe('Updated through another connection');
		await other.drafts.delete(draft.id);
		expect(await repository.list()).toEqual([]);
	} finally {
		other.close();
		await database.delete();
	}
});
