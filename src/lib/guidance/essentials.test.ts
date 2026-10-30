import { describe, expect, it } from 'vitest';
import { essentialEntryIds } from './essentials.js';
import { guidanceEntries } from './entries.js';
import { entryAnchor } from './guidance.js';

describe('Genius essentials selection', () => {
	it('resolves a bounded, unique selection of reviewed entries with useful correct examples', () => {
		expect(essentialEntryIds.length).toBeGreaterThanOrEqual(6);
		expect(essentialEntryIds.length).toBeLessThanOrEqual(8);
		expect(new Set(essentialEntryIds).size).toBe(essentialEntryIds.length);
		for (const id of essentialEntryIds) {
			const entry = guidanceEntries.find((entry) => entry.id === id);
			expect(entry, id).toBeDefined();
			expect(entry?.example?.correct, id).toBeTruthy();
			expect(entry?.sourceIds.length, id).toBeGreaterThan(0);
			expect(entry?.authority, id).not.toBe('lyriclint');
		}
	});
	it('has unique fragments for its in-page contents links', () => {
		const anchors = essentialEntryIds.map(entryAnchor);
		expect(new Set(anchors).size).toBe(anchors.length);
	});
});
