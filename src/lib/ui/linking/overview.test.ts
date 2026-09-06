import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import { linkingSectionNames, linkingOverview } from './overview.js';

describe('linking overview', () => {
	it('offers repeated choruses once and distinguishes identical headers', () => {
		const parsed = parseDocument('[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight');
		const overview = linkingOverview(parsed, englishLanguagePack, []);
		expect(overview.linked).toEqual([]);
		expect(overview.available).toHaveLength(1);
		const group = overview.available[0]!;
		expect(group.headerFrom).toBe(0);
		expect(group.action).toBe('create');
		expect(group.existingGroups).toEqual([]);
		expect(
			group.occurrences.map((occurrence) => linkingSectionNames(parsed).get(occurrence.headerFrom))
		).toEqual(['Chorus 1', 'Chorus 2']);
	});

	it('retains a stored cross-name group after its lyrics diverge completely', () => {
		const parsed = parseDocument('[Intro]\nHold on tight\n\n[Outro]\nEvery road ends somewhere');
		const overview = linkingOverview(parsed, englishLanguagePack, [
			{
				lines: [1, 4],
				holes: [
					{ line: 2, column: 0, endLine: 2, endColumn: 13 },
					{ line: 5, column: 0, endLine: 5, endColumn: 25 }
				]
			}
		]);
		expect(overview.available).toEqual([]);
		expect(overview.linked).toHaveLength(1);
		expect(overview.linked[0]?.occurrences.map((occurrence) => occurrence.label)).toEqual([
			'Intro',
			'Outro'
		]);
		expect(overview.linked[0]?.action).toBe('manage');
	});

	it('retains stored membership even when the current words happen to agree', () => {
		const parsed = parseDocument('[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight');
		const overview = linkingOverview(parsed, englishLanguagePack, [
			{
				lines: [1, 4],
				holes: [
					{ line: 2, column: 8, endLine: 2, endColumn: 13 },
					{ line: 5, column: 8, endLine: 5, endColumn: 13 }
				]
			}
		]);
		expect(overview.available).toEqual([]);
		expect(overview.linked[0]?.action).toBe('manage');
	});

	it('offers a newly pasted peer while showing only current members in the linked group', () => {
		const parsed = parseDocument(
			'[Chorus 1]\nHold on tight\n\n[Chorus 2]\nHold on tight\n\n[Chorus 3]\nHold on tight'
		);
		const overview = linkingOverview(parsed, englishLanguagePack, [{ lines: [1, 4] }]);
		expect(overview.linked[0]?.occurrences.map((occurrence) => occurrence.line)).toEqual([1, 4]);
		expect(overview.available).toHaveLength(1);
		expect(overview.available[0]?.action).toBe('add');
		expect(
			overview.available[0]?.existingGroups.map((group) => group.map((member) => member.line))
		).toEqual([[1, 4]]);
		expect(overview.available[0]?.occurrences.map((occurrence) => occurrence.line)).toEqual([
			1, 4, 7
		]);
	});

	it('identifies combining existing groups separately from creating a link', () => {
		const parsed = parseDocument(
			'[Intro]\nHold on tight\n\n[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight\n\n[Outro]\nHold on tight'
		);
		const overview = linkingOverview(parsed, englishLanguagePack, [
			{ lines: [1, 10] },
			{ lines: [4, 7] }
		]);
		expect(overview.available).toHaveLength(1);
		expect(overview.available[0]?.action).toBe('combine');
		expect(
			overview.available[0]?.existingGroups.map((group) => group.map((member) => member.line))
		).toEqual([
			[1, 10],
			[4, 7]
		]);
	});

	it('discovers cross-name lyrics without merging overlapping candidate sets transitively', () => {
		const parsed = parseDocument(
			'[Intro]\nAlpha beta gamma delta\n\n[Bridge]\nAlpha beta gamma delta epsilon zeta eta theta\n\n[Outro]\nEpsilon zeta eta theta'
		);
		const overview = linkingOverview(parsed, englishLanguagePack, []);
		expect(
			overview.available.map((group) => group.occurrences.map((occurrence) => occurrence.label))
		).toEqual([
			['Intro', 'Bridge'],
			['Intro', 'Bridge', 'Outro'],
			['Bridge', 'Outro']
		]);
		expect(overview.available.map((group) => group.headerFrom)).toEqual(
			parsed.sections.flatMap((section) => (section.header ? [section.header.from] : []))
		);
	});

	it('deduplicates the same cross-name candidate set', () => {
		const parsed = parseDocument('[Intro]\nHold on tight\n\n[Outro]\nHold on tight');
		const overview = linkingOverview(parsed, englishLanguagePack, []);
		expect(overview.available).toHaveLength(1);
		expect(overview.available[0]?.occurrences.map((occurrence) => occurrence.label)).toEqual([
			'Intro',
			'Outro'
		]);
	});
});
