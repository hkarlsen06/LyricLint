import { describe, expect, test } from 'vitest';
import { parseScribe, serializeScribe } from '$lib/scribe/format.js';
import { createTestWorkbench, performer } from '../test-utils.js';

function file(name: string, contents: string): File {
	return { name, text: async () => contents } as File;
}

describe('Workbench Scribe projects', () => {
	test('exports the current editable project as .lls rather than only its lyrics', () => {
		const exportLog: Array<{ text: string; filename: string }> = [];
		const alice = performer('alice', 'Alice', 0);
		const { controller, calls } = createTestWorkbench({
			text: '[Chorus: Alice]\nLine\n\n[Chorus: Alice]\nLine',
			performers: [alice],
			sectionLinks: [{ lines: [1, 4] }],
			exportLog
		});
		calls.lineAnchors = [{ line: 2, time: 4.25 }];
		controller.onLineAnchorsChanged();

		controller.exportScribe();

		expect(exportLog).toHaveLength(1);
		expect(exportLog[0]?.filename).toBe('Test draft.lls');
		expect(parseScribe(exportLog[0]!.text)).toMatchObject({
			document: {
				title: 'Test draft',
				language: 'en',
				lyrics: '[Chorus: Alice]\nLine\n\n[Chorus: Alice]\nLine'
			},
			performers: [alice],
			sectionLinks: [{ lines: [1, 4] }],
			lineAnchors: [{ line: 2, time: 4.25 }]
		});
	});

	test('imports a validated project as a new local draft and opens it', async () => {
		const { controller, repository } = createTestWorkbench({ text: '[Verse]\nCurrent work' });
		const source = serializeScribe({
			title: 'Imported song',
			language: 'no',
			lyrics: '[Refreng]\nImportert',
			selection: { anchor: 0, head: 10 },
			performers: [],
			sectionLinks: [],
			lineAnchors: [{ line: 2, time: 8 }],
			ignoredDiagnostics: []
		});

		expect(await controller.importScribe(file('Imported song.lls', source))).toBe(true);
		expect(controller.draftId).toBe('generated-1');
		expect(controller.title).toBe('Imported song');
		expect(controller.language).toBe('no');
		expect(controller.snapshot.text).toBe('[Refreng]\nImportert');
		expect(await repository.get('draft-1')).toMatchObject({ text: '[Verse]\nCurrent work' });
		expect(await repository.get('generated-1')).toMatchObject({
			title: 'Imported song',
			lineAnchors: [{ line: 2, time: 8 }]
		});
	});

	test('rejects renamed or malformed files before changing the active draft', async () => {
		const { controller, repository, feedback } = createTestWorkbench({
			text: '[Verse]\nKeep this'
		});
		const originalId = controller.draftId;

		expect(await controller.importScribe(file('not-a-scribe.json', '{}'))).toBe(false);
		expect(await controller.importScribe(file('broken.lls', '{'))).toBe(false);

		expect(controller.draftId).toBe(originalId);
		expect(controller.snapshot.text).toBe('[Verse]\nKeep this');
		expect(await repository.list()).toHaveLength(1);
		expect(feedback.toasts.at(-1)?.message).toBe('This file is not valid JSON.');
	});
});
