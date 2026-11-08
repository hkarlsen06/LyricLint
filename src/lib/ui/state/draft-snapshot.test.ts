import { describe, expect, test } from 'vitest';
import type { DraftRecord } from '#lib/core/types.js';
import { CONVERSION_LIMITS } from '#lib/conversion/model.js';
import { legacyWriting } from '#lib/persistence/writing.js';
import { draftSnapshot } from './draft-snapshot.js';

function plainMusixmatch(text: string): DraftRecord {
	return {
		id: 'plain-mm',
		title: 'Literal Musixmatch',
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-11-08T00:00:00Z',
		updatedAt: '2026-11-08T00:00:00Z',
		ruleSetVersion: 'test',
		writing: legacyWriting('musixmatch')
	};
}

describe('opening the saved main writing format', () => {
	test('initializes an ordinary plain Musixmatch draft without treating brackets as Genius', () => {
		const original = plainMusixmatch('[Verse]\n[moon](123) <b>literal</b>');
		const { snapshot, notice } = draftSnapshot(original);
		expect(notice).toBeUndefined();
		expect(snapshot.text).toBe(original.text);
		expect(snapshot.conversion?.profile).toBe('musixmatch');
		expect(snapshot.parsed.profile).toBe('musixmatch');
		expect(snapshot.parsed.annotations).toEqual([]);
		expect(snapshot.parsed.sections[0]?.header).toBeUndefined();
		expect(snapshot.parsed.sections[0]?.lines.map((line) => line.text)).toEqual([
			'[Verse]',
			'[moon](123) <b>literal</b>'
		]);
		expect(original.conversion).toBeUndefined();
	});

	test.each([
		['text', '[Verse]\n' + 'x'.repeat(CONVERSION_LIMITS.text)],
		['physical line', '[Verse]\n' + 'x\n'.repeat(CONVERSION_LIMITS.records / 2)]
	])(
		'keeps the exact Musixmatch source when the %s limit refuses rich initialization',
		(_, text) => {
			const original = plainMusixmatch(text);
			const { snapshot, notice } = draftSnapshot(original);
			expect(notice).toMatch(/limit|too many/u);
			expect(notice).toContain('Musixmatch lyrics remain editable');
			expect(snapshot.text).toBe(text);
			expect(snapshot.conversion).toBeUndefined();
			expect(snapshot.parsed.profile).toBe('musixmatch');
			expect(snapshot.parsed.sections[0]?.header).toBeUndefined();
			expect(snapshot.parsed.sections[0]?.lines[0]?.text).toBe('[Verse]');
			expect(snapshot.parsed.syntaxIssues).toEqual([]);
			expect(original.writing?.profile).toBe('musixmatch');
			expect(original.text).toBe(text);
		}
	);

	test('keeps the legacy plain Genius default', () => {
		const original = plainMusixmatch('[Verse]\n[moon](123)');
		delete original.writing;
		const { snapshot, notice } = draftSnapshot(original);
		expect(notice).toBeUndefined();
		expect(snapshot.conversion).toBeUndefined();
		expect(snapshot.parsed.sections[0]?.header?.name).toBe('Verse');
		expect(snapshot.parsed.annotations).toHaveLength(1);
	});
});
