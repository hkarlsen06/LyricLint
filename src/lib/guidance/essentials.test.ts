import { describe, expect, it } from 'vitest';
import { essentialEntryIds, essentialCompanions } from './essentials.js';
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

	it('keeps the readability, echo, and brand-name qualifications beside their general advice', () => {
		for (const [id, companions] of Object.entries(essentialCompanions)) {
			expect(essentialEntryIds).toContain(id);
			for (const companion of companions)
				expect(guidanceEntries.find((entry) => entry.id === companion)?.statement).toBeTruthy();
		}
		expect(essentialCompanions['guidance.spelling.elision-apostrophe']).toContain(
			'guidance.spelling.readability-limit'
		);
		expect(essentialCompanions['guidance.ad-libs.include-every']).toContain(
			'guidance.ad-libs.echo-effects'
		);
		expect(essentialCompanions['guidance.punctuation.unmarked-question']).toContain(
			'guidance.punctuation.brand-name-marks'
		);
	});
});
