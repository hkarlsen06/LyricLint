import { describe, expect, test } from 'vitest';
import {
	beginWriting,
	expireExportCopy,
	legacyWriting,
	newWriting,
	otherProfile,
	parseWriting,
	withExportCopy
} from './writing.js';
import type { ProfileId } from '../profiles/types.js';
import { CONVERSION_LIMITS } from '../conversion/model.js';

const profiles: ProfileId[] = ['genius', 'musixmatch'];

describe('one main draft with an independent export', () => {
	test.each(profiles)('keeps %s ownership when an export is edited and expires', (profile) => {
		const initial = newWriting(profile);
		const original = beginWriting(initial);
		const edited = withExportCopy(original, 'A separately formatted export\n');
		expect(edited.export).toEqual({
			profile: otherProfile(profile),
			text: 'A separately formatted export\n'
		});
		expect(original).toEqual({ schema: 1, phase: 'writing', profile });
		expect(expireExportCopy(edited)).toEqual(original);
		expect(expireExportCopy(edited).phase).toBe('writing');
		expect(initial.phase).toBe('new');
	});

	test.each(profiles)(
		'copies the complete saved %s state without sharing export objects',
		(profile) => {
			const stored = withExportCopy(legacyWriting(profile), 'Exact exported words');
			const read = parseWriting(JSON.parse(JSON.stringify(stored)), profile);
			expect(read).toEqual(stored);
			if (read.phase !== 'writing' || !read.export) throw new Error('Missing export');
			read.export.text = 'Edited again';
			expect(stored.export?.text).toBe('Exact exported words');
		}
	);

	test('keeps a deliberately emptied export rather than treating it as absent', () => {
		const stored = withExportCopy(legacyWriting('genius'), '');
		expect(parseWriting(stored)).toEqual(stored);
		expect(stored.export).toEqual({ profile: 'musixmatch', text: '' });
	});

	test('refuses oversized saved output without changing the original state', () => {
		const original = legacyWriting('genius');
		expect(() => withExportCopy(original, 'x'.repeat(CONVERSION_LIMITS.text + 1))).toThrow(
			/exceeds/u
		);
		expect(original.export).toBeUndefined();
	});

	test('pins the saved legacy representation rather than inferring Genius from its ancestry', () => {
		expect(legacyWriting('musixmatch')).toEqual({
			schema: 1,
			phase: 'writing',
			profile: 'musixmatch'
		});
		expect(legacyWriting()).toEqual({ schema: 1, phase: 'writing', profile: 'genius' });
	});

	test.each([
		null,
		{ schema: 2, phase: 'writing', profile: 'genius' },
		{ schema: 1, phase: 'writing', profile: 'other' },
		{ schema: 1, phase: 'new', profile: 'genius', export: { profile: 'musixmatch', text: 'x' } },
		{ schema: 1, phase: 'writing', profile: 'genius', export: { profile: 'genius', text: 'x' } },
		{ schema: 1, phase: 'writing', profile: 'genius', export: { profile: 'musixmatch', text: 1 } }
	])('refuses an unreadable or mismatched state before any source can be replaced', (value) => {
		expect(() => parseWriting(value)).toThrow();
	});

	test('refuses a writing format that contradicts the retained conversion envelope', () => {
		expect(() => parseWriting(legacyWriting('musixmatch'), 'genius')).toThrow(/do not match/u);
	});
});
