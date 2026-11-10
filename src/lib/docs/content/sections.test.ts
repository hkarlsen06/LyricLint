import { describe, expect, it } from 'vitest';
import { reviewedLanguagePacks } from '#lib/languages/registry.js';
import { languageNotes } from './sections.svelte';

describe('reviewed language table', () => {
	it('writes a note for every pack whose term list would misdescribe its policy', () => {
		const misdescribed = reviewedLanguagePacks
			.filter((pack) => pack.policy !== 'localized' && !languageNotes.has(pack.tag))
			.map((pack) => `${pack.tag} (${pack.policy})`);
		expect(misdescribed).toEqual([]);
	});
});
