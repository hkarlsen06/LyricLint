import { describe, expect, it } from 'vitest';
import type { Diagnostic, Severity } from '$lib/core/types.js';
import { orderDiagnostics } from './order.js';

function diagnostic(
	ruleId: string,
	severity: Severity,
	from: number,
	message = `${ruleId}@${from}`
): Diagnostic {
	return {
		ruleId,
		severity,
		message,
		explanation: '',
		sourceIds: [],
		from,
		to: from + 3
	};
}

const ids = (diagnostics: readonly Diagnostic[]) => diagnostics.map((one) => one.message);

describe('the panel reading order', () => {
	it('reads worst first, then down the document', () => {
		const ordered = orderDiagnostics([
			diagnostic('section.header-prose', 'suggestion', 40, 'suggestion late'),
			diagnostic('syntax.unbalanced-brackets', 'error', 90, 'error late'),
			diagnostic('section.header-missing', 'warning', 10, 'warning early'),
			diagnostic('section.header-unrecognized', 'manual-review', 0, 'manual first')
		]);

		expect(ids(ordered)).toEqual([
			'error late',
			'warning early',
			'suggestion late',
			'manual first'
		]);
	});

	/*
	 * Harper answers about 250ms behind the rule engine, so every edit publishes
	 * twice and the second publish re-sorts the union. Ranked below every native
	 * finding, a late arrival can only ever be appended under the card the reader
	 * is on — never inserted above the one `leadAfterFix` has just expanded, which
	 * is what used to slide the open card down a row under the pointer.
	 */
	it('puts every Harper finding under every reviewed one, whatever it says or where', () => {
		const native = diagnostic('capitalization.line-start', 'suggestion', 500, 'native suggestion');
		const harperError = diagnostic('grammar.harper', 'error', 0, 'harper error at the top');
		const harperSpelling = diagnostic('spelling.harper', 'warning', 10, 'harper warning');

		expect(ids(orderDiagnostics([harperError, native, harperSpelling]))).toEqual([
			'native suggestion',
			'harper error at the top',
			'harper warning'
		]);
	});

	it('orders Harper findings among themselves the same way', () => {
		const ordered = orderDiagnostics([
			diagnostic('style.harper', 'suggestion', 5, 'harper suggestion'),
			diagnostic('grammar.harper', 'warning', 90, 'harper warning late'),
			diagnostic('spelling.harper', 'warning', 20, 'harper warning early')
		]);

		expect(ids(ordered)).toEqual([
			'harper warning early',
			'harper warning late',
			'harper suggestion'
		]);
	});

	/*
	 * The property the rank exists to protect: the order is a function of the
	 * findings alone, so it cannot depend on which provider answered first. The
	 * same set shuffled any way round lists identically.
	 */
	it('is the same order whichever provider arrived first', () => {
		const findings = [
			diagnostic('grammar.harper', 'error', 12, 'harper'),
			diagnostic('section.header-prose', 'warning', 60, 'native late'),
			diagnostic('section.header-missing', 'warning', 0, 'native early')
		];

		expect(ids(orderDiagnostics(findings))).toEqual(ids(orderDiagnostics([...findings].reverse())));
		expect(ids(orderDiagnostics(findings))).toEqual(['native early', 'native late', 'harper']);
	});
});
