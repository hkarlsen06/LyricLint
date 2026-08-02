import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { soundEffectAsterisksRule as rule } from './sound-effect-asterisks.js';

describe('sound-effect.asterisks', () => {
	it('marks a braced sound and replaces its wrapper', () => {
		const text = '[Verse]\nA door slams {laughs}';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['{laughs}']);
		expect(finding).toMatchObject({
			message: 'Use asterisks around this likely sound effect.',
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with *laughs*',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse]\nA door slams *laughs*'
		);
	});

	it('treats a sound-shaped header as notation and replaces the complete header', () => {
		const text = '[applause]\nA line';
		const [finding] = checkRule(rule, text);
		expect(markedText(text, [finding!])).toEqual(['[applause]']);
		expect(finding?.message).toBe(
			'This header looks like a sound effect that should use asterisks.'
		);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('*applause*\nA line');
	});

	it('accepts asterisk notation, unknown brace words, and unsafe markup', () => {
		expect(checkRule(rule, '[Verse]\n*laughs*')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n{roses}')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<u>{laughs}</u>')).toEqual([]);
	});
});
