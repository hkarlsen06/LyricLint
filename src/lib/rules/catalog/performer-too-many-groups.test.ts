import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { performerTooManyGroupsRule as rule } from './performer-too-many-groups.js';

describe('performer.too-many-groups', () => {
	it('marks the complete five-group legend', () => {
		const text = '[Verse: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine';
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E']);
		expect(findings.map((finding) => finding.message)).toEqual([
			'This section has more voice groups than the four formatting slots.'
		]);
		expect(findings[0]?.fixes).toBeUndefined();
	});

	it('reports each overfull section independently', () => {
		const text =
			'[Verse: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nOne\n\n[Chorus: F, <i>G</i>, <b>H</b>, <i><b>I</b></i> & J]\nTwo';
		expect(checkRule(rule, text)).toHaveLength(2);
	});

	it('accepts four groups and treats joint plain names as one group', () => {
		expect(checkRule(rule, '[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nLine')).toEqual([]);
		expect(checkRule(rule, '[Verse: A & B, <i>C</i>]\nLine')).toEqual([]);
	});
});
