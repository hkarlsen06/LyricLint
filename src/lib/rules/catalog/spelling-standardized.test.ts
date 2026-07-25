import { describe, expect, it } from 'vitest';
import { spellingStandardizedRule as rule } from './spelling-standardized.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.standardized', () => {
	it('reports every reviewed alternate on a line in offset order', () => {
		const text = '[Verse]\nImma tho whoa dawg';
		const found = checkRule(rule, text);

		expect(markedText(text, found)).toEqual(['Imma', 'tho', 'whoa', 'dawg']);
		expect(fixInserts(found)).toEqual(["I'ma", 'though', 'woah', 'dog']);
		expect(found.every((finding) => finding.fixes?.[0]?.kind === 'safe')).toBe(true);
		expect(found.every((finding) => finding.fixes?.[0]?.edit.baseRevision === testRevision)).toBe(
			true
		);
		expect(applyRuleFixes(rule, text)).toBe("[Verse]\nI'ma though woah dog");
	});

	it('reports curated common misspellings of reviewed spellings', () => {
		const text = '[Verse]\ney okey yall whoah bougy choper naieve clichè asap';
		const found = checkRule(rule, text);

		expect(markedText(text, found)).toEqual([
			'ey',
			'okey',
			'yall',
			'whoah',
			'bougy',
			'choper',
			'naieve',
			'clichè',
			'asap'
		]);
		expect(fixInserts(found)).toEqual([
			'ayy',
			'okay',
			"y'all",
			'woah',
			'bougie',
			'chopper',
			'naive',
			'cliché',
			'ASAP'
		]);
		expect(applyRuleFixes(rule, text)).toBe(
			"[Verse]\nayy okay y'all woah bougie chopper naive cliché ASAP"
		);
	});

	it('carries the casing of the matched alternate into the replacement', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nIMMA GO'))).toEqual(["I'MA"]);
		expect(fixInserts(checkRule(rule, '[Verse]\nTho, whoa'))).toEqual(['Though', 'woah']);
		// The preferred form starts with an apostrophe, so the capital lands on
		// the first letter rather than the first character.
		expect(fixInserts(checkRule(rule, '[Verse]\nCause I said'))).toEqual(["'Cause"]);
	});

	it('resolves line-position-dependent spellings from the whole line', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nok\nWell, ok then'))).toEqual(['Okay', 'okay']);
	});

	it('only matches complete words', () => {
		expect(checkRule(rule, '[Verse]\nImmature')).toEqual([]);
		expect(checkRule(rule, "[Verse]\nlil' homie")).toEqual([]);
		expect(checkRule(rule, "[Verse]\n'cause I said")).toEqual([]);

		const alreadyPreferred = '[Verse]\nayy and ay and aye';
		expect(markedText(alreadyPreferred, checkRule(rule, alreadyPreferred))).toEqual(['ay', 'aye']);
	});

	it('reads inside supported markup but skips lines carrying unsupported markup', () => {
		const supported = '[Verse]\n<i>Imma go</i>';
		expect(markedText(supported, checkRule(rule, supported))).toEqual(['Imma']);
		expect(checkRule(rule, '[Verse]\n<u>Imma go</u>')).toEqual([]);
	});

	it('never rewrites a section header', () => {
		expect(checkRule(rule, '[Imma]\nGo now')).toEqual([]);
	});

	it('keeps UTF-16 ranges exact after an astral character', () => {
		const text = '[Verse]\n🌙 Imma go';
		const found = checkRule(rule, text);

		expect(found[0]?.from).toBe(11);
		expect(markedText(text, found)).toEqual(['Imma']);
	});

	it('offers a preview fix when a gated spelling has enough context', () => {
		expect(checkRule(rule, '[Verse]\nMy cuz came')).toEqual([]);

		const [gated] = checkRule(rule, '[Verse]\nCuz I said so');
		expect(gated?.message).toBe("If “Cuz” means “because,” use “'Cause”.");
		expect(gated?.explanation).toBe(
			'“Cuz” can also mean “cousin,” so check the lyric before replacing it.'
		);
		expect(gated?.fixes).toMatchObject([
			{
				kind: 'preview',
				label: "Replace with 'Cause",
				edit: { edits: [{ insert: "'Cause" }] }
			}
		]);
	});

	it('keeps the named-song exception and requires money context for CREAM', () => {
		expect(checkRule(rule, '[Verse]\nWu-Tang CREAM song')).toEqual([]);

		const [gated] = checkRule(rule, '[Verse]\nCREAM gets the money');
		expect(gated?.message).toContain('“cream”');
		expect(gated?.fixes).toBeUndefined();
	});

	it('gates the American “til” spelling on the selected language', () => {
		expect(checkRule(rule, '[Verse]\nStay til dawn')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nStay til dawn', { language: 'en-US' })).toHaveLength(1);
	});

	it('keeps the A$AP performer name when a member follows', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nA.S.A.P. Rocky came'))).toEqual(['A$AP']);
		expect(fixInserts(checkRule(rule, '[Verse]\nGet here A.S.A.P.'))).toEqual(['ASAP']);
	});

	it('stays silent on forms whose alternates are all accepted', () => {
		expect(checkRule(rule, '[Verse]\nshawty shorty alright')).toEqual([]);
	});

	it('does not confuse similar real words or intentional pronunciation variants for typos', () => {
		expect(checkRule(rule, '[Verse]\nhey skirt outta boogie Dogg shortie till garden hoe')).toEqual(
			[]
		);
	});
});
