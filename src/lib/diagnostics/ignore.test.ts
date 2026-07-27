import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '$lib/core/types.js';
import { diagnosticIgnoreKey, matchIgnoredDiagnostics } from './ignore.js';
import { diagnosticKey } from './order.js';

function diagnostic(from: number): Diagnostic {
	return {
		ruleId: 'ad-libs.parentheses',
		severity: 'suggestion',
		message: 'Use parentheses for this ad-lib.',
		explanation: '',
		sourceIds: [],
		from,
		to: from + 3
	};
}

describe('diagnostic ignores', () => {
	it('matches only the chosen occurrence and follows it when earlier text shifts', () => {
		const text = 'hey middle hey end';
		const first = diagnostic(0);
		const second = diagnostic(11);
		const ignored = diagnosticIgnoreKey(second, text);

		expect([...matchIgnoredDiagnostics([first, second], text, [ignored]).values()]).toEqual([
			diagnosticKey(second)
		]);

		const shiftedText = `prefix ${text}`;
		const shiftedFirst = diagnostic(7);
		const shiftedSecond = diagnostic(18);
		expect([
			...matchIgnoredDiagnostics([shiftedFirst, shiftedSecond], shiftedText, [ignored]).values()
		]).toEqual([diagnosticKey(shiftedSecond)]);
	});
});
