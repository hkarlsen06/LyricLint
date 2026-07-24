import { parseDocument } from '$lib/core/parser.js';
import type { PerformerRecord } from '$lib/core/types.js';
import { extractPerformers, normalizePerformerKey } from './index.js';
import { describe, expect, it } from 'vitest';

function performer(displayName: string, id = 'known'): PerformerRecord {
	return {
		id,
		displayName,
		normalizedKey: normalizePerformerKey(displayName),
		aliases: [],
		colorId: 'plum',
		order: 0
	};
}

describe('performer import safety', () => {
	it('treats “Hall and Oates” as one exact identity', () => {
		const input = '[Chorus: Hall and Oates]\nPrivate Eyes';
		const known = performer('Hall and Oates');
		const parsed = parseDocument(input);
		const extraction = extractPerformers(parsed, [known]);

		expect(extraction.rosterAdditions).toEqual([]);
		expect(extraction.voiceGroups).toHaveLength(1);
		expect(extraction.voiceGroups[0]?.performerIds).toEqual([known.id]);
		expect(extraction.voiceGroups[0]?.rawNameText).toBe('Hall and Oates');
		expect(parsed.text).toBe(input);
	});

	it('preserves a stale differently-cased legend and surfaces a merge suggestion', () => {
		const input = '[Verse: BLAIR]\nA line';
		const known = performer('Blair');
		const parsed = parseDocument(input);
		const extraction = extractPerformers(parsed, [known]);

		expect(extraction.rosterAdditions.map((record) => record.displayName)).toEqual(['BLAIR']);
		expect(extraction.voiceGroups[0]?.performerIds).not.toEqual([known.id]);
		expect(extraction.suggestions).toEqual([
			expect.objectContaining({
				importedName: 'BLAIR',
				performerId: known.id,
				reason: 'case'
			})
		]);
		expect(parsed.text).toBe(input);
		expect(input).toBe('[Verse: BLAIR]\nA line');
	});
});
