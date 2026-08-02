import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { repeatPlaceholderRule as rule } from './repeat-placeholder.js';

describe('repeat.placeholder', () => {
	it('marks a repetition count in the raw header name', () => {
		const text = '[Chorus x2: Avery]\nWords';
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['Chorus x2']);
		expect(findings.map((finding) => finding.message)).toEqual([
			'Write repeated lyrics instead of a section-count placeholder.'
		]);
		expect(findings[0]?.fixes).toBeUndefined();
	});

	it('reads a bracketed placeholder as a header and a plain placeholder as a lyric line', () => {
		const text = '[Verse]\n[Repeat Chorus]\nChorus (x2)';
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['Repeat Chorus', 'Chorus (x2)']);
		expect(findings.map((finding) => finding.message)).toEqual([
			'Write repeated lyrics instead of a section-count placeholder.',
			'Write the repeated lyrics instead of this placeholder.'
		]);
	});

	it('accepts written lyrics and repeat words embedded in ordinary lines', () => {
		expect(checkRule(rule, '[Chorus]\nWords again')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nI repeat chorus melodies')).toEqual([]);
	});
});
