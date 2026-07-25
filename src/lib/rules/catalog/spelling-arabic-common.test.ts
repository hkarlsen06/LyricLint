import { describe, expect, it } from 'vitest';
import { spellingArabicCommonRule as rule } from './spelling-arabic-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.arabic-common', () => {
	it('runs for the Arabic base tag and regional variants only', () => {
		expect(checkRule(rule, '[المقطع]\nلاكن', { language: 'ar' })).toHaveLength(1);
		expect(checkRule(rule, '[المقطع]\nلاكن', { language: 'ar-EG' })).toHaveLength(1);
		expect(checkRule(rule, '[Verse]\nلاكن', { language: 'fa' })).toEqual([]);
	});

	it('offers preview fixes with the current revision', () => {
		const findings = checkRule(rule, '[المقطع]\nلاكن هاذا هاذه انشاء الله احلا', {
			language: 'ar'
		});

		expect(fixInserts(findings)).toEqual(['لكن', 'هذا', 'هذه', 'إن شاء الله', 'أحلى']);
		expect(
			findings.map((finding) => ({
				kind: finding.fixes?.[0]?.kind,
				baseRevision: finding.fixes?.[0]?.edit.baseRevision
			}))
		).toEqual(
			Array.from({ length: 5 }, () => ({
				kind: 'preview',
				baseRevision: testRevision
			}))
		);
		expect(findings[0]?.explanation).toContain('dialect');
	});

	it('reports multiple forms in source order and applies them to a fixed point', () => {
		const text = '[المقطع]\nهاذا لاكن هاذه انشاء الله احلا';
		const findings = checkRule(rule, text, { language: 'ar' });

		expect(markedText(text, findings)).toEqual(['هاذا', 'لاكن', 'هاذه', 'انشاء الله', 'احلا']);
		const fixed = applyRuleFixes(rule, text, { language: 'ar' });
		expect(fixed).toBe('[المقطع]\nهذا لكن هذه إن شاء الله أحلى');
		expect(checkRule(rule, fixed, { language: 'ar' })).toEqual([]);
	});

	it('matches complete tokens and leaves correct forms alone', () => {
		expect(checkRule(rule, '[المقطع]\nلكن هذا هذه إن شاء الله أحلى', { language: 'ar' })).toEqual(
			[]
		);
		expect(checkRule(rule, '[المقطع]\nكلاكن هاذاك', { language: 'ar' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[المقطع]\n<i>لاكن هاذا</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'ar' }))).toEqual([
			'لاكن',
			'هاذا'
		]);
		expect(checkRule(rule, '[المقطع]\n<u>لاكن</u>', { language: 'ar' })).toEqual([]);
		expect(checkRule(rule, '[لاكن]\nلكن', { language: 'ar' })).toEqual([]);
	});
});
