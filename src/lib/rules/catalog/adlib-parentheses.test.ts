import { describe, expect, it } from 'vitest';
import { adlibParenthesesRule as rule } from './adlib-parentheses.js';
import {
	applyEdits,
	applyRuleFixes,
	checkRule,
	markedText,
	testRevision
} from '../rule-test-utils.js';

function applyFix(text: string, fixIndex: number): string {
	const [finding] = checkRule(rule, text);
	return applyEdits(text, finding?.fixes?.[fixIndex]?.edit.edits ?? []);
}

describe('adlib.parentheses', () => {
	it('capitalizes an ad-lib that is already parenthesized', () => {
		const text = '[Verse]\n(yeah)';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['yeah']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: 'Capitalize as Yeah',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\n(Yeah)');
	});

	it('never flags a lowercase ad-lib the parentheses have not been written around', () => {
		// The old wrap offer fired here, and it was retired: a rapper performing
		// `ayy` as the end of the line is at least as common as a backing vocal
		// there, so the guess was wrong about as often as it was right and only
		// the transcriber can hear which happened. Lowercase after its comma,
		// the line is valid exactly as written.
		expect(checkRule(rule, '[Verse]\nI never surrendered, yeah')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWe run, ayy')).toEqual([]);
		expect(checkRule(rule, "[Verse]\nWe run, let's go")).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWe run, <i>yeah</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nYeah I know')).toEqual([]);
	});

	it('offers both readings of a capitalized trailing ad-lib', () => {
		// `, Ayy` is conventional in neither reading — part of the line it stays
		// lowercase, behind the lead it takes parentheses — so the capital is
		// what earns the finding, and the transcriber picks the repair.
		const text = '[Verse]\nWe run, Ayy';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Ayy']);
		expect(finding?.fixes?.map((fix) => fix.label)).toEqual(['Replace with ayy', 'Wrap as (Ayy)']);
		expect(finding?.fixes?.every((fix) => fix.kind === 'preview')).toBe(true);
		expect(applyFix(text, 0)).toBe('[Verse]\nWe run, ayy');
		expect(applyFix(text, 1)).toBe('[Verse]\nWe run (Ayy)');
	});

	it('takes the stranded comma with the ad-lib the wrap encloses', () => {
		expect(applyFix('[Verse]\nI never surrendered, Yeah', 1)).toBe(
			'[Verse]\nI never surrendered (Yeah)'
		);
		expect(applyFix('[Verse]\nWe run , Yeah', 1)).toBe('[Verse]\nWe run (Yeah)');
		expect(applyFix('[Verse]\n, Yeah', 1)).toBe('[Verse]\n(Yeah)');
	});

	it('wraps outside the markup when the ad-lib is the whole of a performer wrapper', () => {
		// The parentheses stay outside the formatting — the reviewed guide's own
		// form — so this wrap must not write the shape
		// `performer.parenthetical-boundary` exists to flag.
		const text = '[Verse]\nWe run, <i>Yeah</i>';
		expect(applyFix(text, 0)).toBe('[Verse]\nWe run, <i>yeah</i>');
		expect(applyFix(text, 1)).toBe('[Verse]\nWe run (<i>Yeah</i>)');
	});

	it('separates the ad-lib from markup that closes right before the comma', () => {
		expect(applyFix('[Verse]\n<i>We run</i>, Yeah', 1)).toBe('[Verse]\n<i>We run</i> (Yeah)');
	});

	it('leaves trailing whitespace outside the wrap', () => {
		expect(applyFix('[Verse]\nWe run, Yeah   ', 1)).toBe('[Verse]\nWe run (Yeah)   ');
	});

	it('reads only the titlecased form', () => {
		// All caps is a shout, not a stray capital, and the word after the comma
		// in `Yeah, Yeah` is the line's own refrain — neither is offered anything.
		expect(checkRule(rule, '[Verse]\nWe run, AYY')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nYeah, Yeah')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>Yeah</i>, Yeah')).toEqual([]);
		expect(
			markedText("[Verse]\nWe run, Let's go", checkRule(rule, "[Verse]\nWe run, Let's go"))
		).toEqual(["Let's go"]);
	});

	it('still reads an ad-lib whose preceding word merely ends the same way', () => {
		const text = '[Verse]\nOkayeah, Yeah';
		expect(markedText(text, checkRule(rule, text))).toEqual(['Yeah']);
	});

	it('only reads an ad-lib that ends the line', () => {
		expect(checkRule(rule, '[Verse]\nWe run, Yeah we do')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWe run, Yeahs')).toEqual([]);
	});

	it('skips unsupported markup and ignores headers', () => {
		expect(checkRule(rule, '[Verse]\n<u>We run, Yeah</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse, Yeah]\nWe run')).toEqual([]);
	});
});
