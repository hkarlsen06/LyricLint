import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic, RuleContext } from '$lib/core/types.js';
import { profileGuidelines, guidelinesForLanguage } from '$lib/profiles/coverage.js';
import { profileSourceRegistry } from '$lib/profiles/sources.js';
import { runRules } from './engine.js';
import { getRule, validateRuleRegistry } from './registry.js';
import { isDottedInitialism, japanesePunctuationWidth, musixmatchRules } from './musixmatch.js';

const context: RuleContext = {
	profile: 'musixmatch',
	language: 'en',
	performers: [],
	sources: profileSourceRegistry,
	ruleSetVersion: '2026.09.16.1',
	revision: 29
};

function findings(text: string, language = 'en'): Diagnostic[] {
	return runRules(parseDocument(text), { ...context, language });
}

function has(text: string, ruleId: string, language = 'en'): Diagnostic[] {
	return findings(text, language).filter((finding) => finding.ruleId === `mxm.${ruleId}`);
}

function fixedText(text: string, finding: Diagnostic): string {
	const edits = finding.fixes?.[0].edit.edits;
	if (!edits) throw new Error('Expected a preview');
	return [...edits]
		.sort((left, right) => right.from - left.from)
		.reduce(
			(current, edit) => current.slice(0, edit.from) + edit.insert + current.slice(edit.to),
			text
		);
}

describe('Musixmatch policy registry', () => {
	it('keeps all 111 documented clauses with their limits and resolvable sources', () => {
		const evidence = readFileSync('docs/platform-guidelines-comparison.md', 'utf8');
		const documented = Array.from(
			evidence.matchAll(/^\| `(MX-[A-Z]+-?\d+)`/gmu),
			(match) => match[1]
		);
		expect(profileGuidelines.map((entry) => entry.id)).toEqual(documented);
		expect(new Set(documented).size).toBe(111);
		for (const entry of profileGuidelines) {
			expect(entry.statement.length).toBeGreaterThan(20);
			expect(entry.limit.length).toBeGreaterThan(20);
			expect(entry.sourceIds.length).toBeGreaterThan(0);
			for (const id of entry.sourceIds)
				expect(profileSourceRegistry.has(id), `${entry.id}: ${id}`).toBe(true);
			for (const id of entry.ruleIds) expect(getRule(id), `${entry.id}: ${id}`).toBeDefined();
		}
	});

	it('validates an independent namespaced registry', () => {
		expect(() => validateRuleRegistry(musixmatchRules, profileSourceRegistry)).not.toThrow();
		expect(musixmatchRules).toHaveLength(26);
		expect(musixmatchRules.every((rule) => rule.id.startsWith('mxm.'))).toBe(true);
	});

	it.each(['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'])(
		'records applicable policy for %s without an English dictionary fallback',
		(language) => {
			const inventory = guidelinesForLanguage(language);
			expect(inventory.some((entry) => entry.id === 'MX-T03')).toBe(true);
			expect(inventory.some((entry) => entry.id === 'MX-W01')).toBe(true);
			if (language !== 'en') {
				expect(inventory.some((entry) => entry.id === 'MX-EN01')).toBe(false);
				expect(has('Imma stay til dawn', 'spelling.standardized', language)).toEqual([]);
			}
		}
	);

	it('isolates both diagnostic profiles while preserving Genius as the default', () => {
		const document = parseDocument('[Verse]\nImma sing with 5 friends');
		const genius = runRules(document, { ...context, profile: 'genius' });
		const mxm = runRules(document, context);
		expect(genius.some((finding) => finding.ruleId === 'numbers.spell-out')).toBe(true);
		expect(genius.every((finding) => !finding.ruleId.startsWith('mxm.'))).toBe(true);
		expect(mxm.every((finding) => finding.ruleId.startsWith('mxm.'))).toBe(true);
		expect(runRules(document, { ...context, profile: undefined })).toEqual(genius);
		expect(runRules(document, context, [])).toEqual([]);
	});

	it('cannot mutate text or input metadata while switching profile contexts repeatedly', () => {
		const text = '[Verse: A]\r\nImma sing with 5 friends [?]\r\n\r\n[Chorus]\r\nWe return (Again!)';
		const document = parseDocument(text);
		const original = JSON.stringify(document);
		const expectedGenius = runRules(document, { ...context, profile: 'genius' });
		const expectedMxm = runRules(document, context);
		for (let index = 0; index < 50; index += 1) {
			expect(runRules(document, { ...context, profile: 'genius' })).toEqual(expectedGenius);
			expect(runRules(document, context)).toEqual(expectedMxm);
			expect(JSON.stringify(document)).toBe(original);
		}
	});

	it('binds every edit to its snapshot and never offers an automatic policy guess', () => {
		const diagnostics = findings('Imma stay.\nwe sing? again\nWe say til dawn');
		const fixes = diagnostics.flatMap((finding) => finding.fixes ?? []);
		expect(fixes.length).toBeGreaterThan(2);
		for (const fix of fixes) {
			expect(fix.kind).toBe('preview');
			expect(fix.edit.baseRevision).toBe(29);
		}
	});
});

describe('Musixmatch transcription and structure', () => {
	it('keeps uncertain words and censorship visible without manufacturing text', () => {
		expect(has('We hear [?] tonight', 'transcription.unknown')).toHaveLength(1);
		expect(has('We hear (?) tonight', 'transcription.unknown')).toHaveLength(1);
		expect(has('Are you here?', 'transcription.unknown')).toEqual([]);
		expect(has('We hear [?] tonight', 'transcription.unknown', 'no')).toEqual([]);
		for (const text of ['We hear **** tonight', 'We hear f*** tonight']) {
			const [finding] = has(text, 'transcription.censor-mask');
			expect(finding?.severity).toBe('manual-review');
			expect(finding?.fixes).toBeUndefined();
		}
	});

	it('flags metadata and uncertain sound descriptions without deleting potential vocals', () => {
		expect(has('[Verse]\nWe sing', 'transcription.labels')).toHaveLength(1);
		const [finding] = has('*Door shuts*\nWe sing', 'transcription.sound-description');
		expect(finding.fixes).toBeUndefined();
		expect(has('We sing again', 'transcription.labels')).toEqual([]);
	});

	it('reports repeat placeholders without guessing their source text', () => {
		expect(has('[Chorus x2]\nWe return', 'transcription.repeat-placeholder')).toHaveLength(1);
		expect(has('Chorus x2', 'transcription.repeat-placeholder')).toHaveLength(1);
		expect(has('We return\nWe return', 'transcription.repeat-placeholder')).toEqual([]);
	});

	it.each(['\n', '\r\n', '\r'])(
		'counts physical lyric blocks with %j endings without inventing breaks',
		(ending) => {
			const text = Array.from({ length: 11 }, (_, index) => `Line ${index}`).join(ending);
			const [finding] = has(text, 'format.stanza-length');
			expect(finding.from).toBe(0);
			expect(finding.to).toBe(text.length);
			expect(finding.fixes).toBeUndefined();
			expect(
				has(text.replace(`Line 5${ending}`, `Line 5${ending}${ending}`), 'format.stanza-length')
			).toEqual([]);
		}
	);

	it('keeps instrumental placement, recording evidence and Japanese policy conflict separate', () => {
		const text = 'First voice\n\n#INSTRUMENTAL\nNext voice';
		const english = has(text, 'structure.instrumental');
		expect(english).toHaveLength(2);
		expect(english[0].fixes).toBeUndefined();
		const spacing = english.find((finding) => finding.fixes)!;
		expect(fixedText(text, spacing)).toBe('First voice\n\n#INSTRUMENTAL\n\nNext voice');
		const japanese = has(text, 'structure.instrumental', 'ja');
		expect(japanese).toHaveLength(2);
		expect(japanese.every((finding) => !finding.fixes)).toBe(true);
		expect(japanese.some((finding) => finding.sourceIds.includes('MXM-JA-Q'))).toBe(true);
		expect(has('#INSTRUMENTAL', 'structure.instrumental')[0].message).toContain(
			'between lyric sections'
		);
	});
});

describe('Musixmatch formatting and language exceptions', () => {
	it('preserves initials and ellipses while offering terminal punctuation as an explicit preview', () => {
		expect(isDottedInitialism('We join the U.S.A.')).toBe(true);
		expect(isDottedInitialism('We go.')).toBe(false);
		expect(has('We join the U.S.A.', 'punctuation.line-ending')).toEqual([]);
		expect(has('We fade...', 'punctuation.line-ending')).toEqual([]);
		const text = 'We say "Stay,"';
		const [finding] = has(text, 'punctuation.line-ending');
		expect(fixedText(text, finding)).toBe('We say "Stay"');
	});

	it.each([
		['en', 'we return'],
		['no', 'vi kommer hjem'],
		['de', 'wir kommen heim'],
		['es', 'volvemos aquí'],
		['fr', 'nous rentrons'],
		['ja', 'hello 世界']
	])('scopes line capitals to actual cased text in %s', (language, text) => {
		expect(has(text, 'format.line-initial', language)).toHaveLength(1);
	});

	it('does not invent case for Arabic, Hangul or Japanese characters', () => {
		for (const [language, text] of [
			['ar', 'نعود إلى البيت'],
			['ko', '다시 돌아와'],
			['ja', 'また帰る']
		]) {
			expect(has(text, 'format.line-initial', language)).toEqual([]);
		}
		expect(has('iPhone rings', 'format.line-initial')).toEqual([]);
		expect(has('eBay calls', 'format.line-initial')).toEqual([]);
	});

	it('reviews sentence, expressive and parenthetical casing without destructive bulk fixes', () => {
		expect(has('We sing? again we rise', 'format.sentence-case')).toHaveLength(1);
		expect(has('WE SING AGAIN', 'format.expressive-case')).toHaveLength(1);
		expect(has('The Night Is Calling', 'format.expressive-case')).toHaveLength(1);
		expect(has('We return (Again)', 'format.parenthetical-case')).toHaveLength(1);
		expect(has('We return (I know)', 'format.parenthetical-case')).toEqual([]);
		expect(has('We return (NASA)', 'format.parenthetical-case')).toEqual([]);
		const [conflict] = has('帰る (Again)', 'format.parenthetical-case', 'ja');
		expect(conflict.sourceIds).toEqual(['MXM-MAIN', 'MXM-JA-Q']);
		expect(conflict.fixes).toBeUndefined();
	});

	it('never changes numeric roles, precision or script without semantic evidence', () => {
		for (const [language, text] of [
			['en', "At 6 o'clock"],
			['no', 'Vi er 11 her'],
			['de', 'Es ist 10 Uhr'],
			['es', 'Mil y 20 caminos'],
			['fr', 'À 10 heures'],
			['ar', 'عندي ١٢ حلما'],
			['ja', '12の夢'],
			['ko', '꿈은 12개'],
			['en', 'Call 0012345678901234567890']
		]) {
			const diagnostics = has(text, 'numbers.context', language);
			// Adjacent ideographic words are ambiguous tokens and may remain inventory-only.
			for (const finding of diagnostics) expect(finding.fixes).toBeUndefined();
			expect(parseDocument(text).text).toBe(text);
		}
		const [french] = has('À 10 heures', 'numbers.context', 'fr');
		expect(french.sourceIds).toContain('MXM-FR-I');
		expect(french.explanation).toContain('unclear');
	});

	it('keeps meaning-sensitive slang and direct speech as deliberate decisions', () => {
		const [slang] = has('Imma return', 'spelling.standardized');
		expect(fixedText('Imma return', slang)).toBe("I'ma return");
		expect(has('Cause we return', 'spelling.standardized')).toEqual([]);
		const [speech] = has('Dije, "Vuelve"', 'punctuation.direct-speech', 'es');
		expect(speech.sourceIds).toEqual(['MXM-ES-I', 'MXM-ES-Q']);
		expect(speech.fixes).toBeUndefined();
	});

	it('distinguishes Spanish vocal placement, acronym and selected accent conventions', () => {
		expect(has('(Vuelve aquí)', 'vocals.spanish-placement', 'es')).toHaveLength(1);
		expect(has('Vuelve (aquí)', 'vocals.spanish-placement', 'es')).toEqual([]);
		expect(has('Canto U.S.A.', 'spelling.spanish-acronym', 'es')).toHaveLength(1);
		expect(has('Canto USA', 'spelling.spanish-acronym', 'es')).toEqual([]);
		const [accent] = has('Sólo canto aquí', 'spelling.spanish-accents', 'es');
		expect(fixedText('Sólo canto aquí', accent)).toBe('Solo canto aquí');
		expect(has('Qué alegría aquí', 'spelling.spanish-accents', 'es')).toEqual([]);
		expect(has('a'.repeat(71), 'format.line-length', 'es')).toHaveLength(1);
		expect(has('a'.repeat(71), 'format.line-length', 'en')).toEqual([]);
	});

	it('uses French lyric punctuation with title exceptions and a narrow elision form', () => {
		const [mark] = has('Reviens!', 'punctuation.french-marks', 'fr');
		expect(mark.fixes).toBeUndefined();
		expect(mark.explanation).toContain('sung song title');
		const text = 'Tu reviens ?';
		const [spacing] = has(text, 'punctuation.french-question-space', 'fr');
		expect(fixedText(text, spacing)).toBe('Tu reviens?');
		const [elision] = has("Y'a du vent", 'spelling.french-elision', 'fr');
		expect(fixedText("Y'a du vent", elision)).toBe('Y a du vent');
		expect(has('Y a du vent', 'spelling.french-elision', 'fr')).toEqual([]);
	});

	it('changes only Japanese punctuation with a known preceding width', () => {
		const [full] = has('帰る?', 'punctuation.japanese-width', 'ja');
		expect(fixedText('帰る?', full)).toBe('帰る？');
		const [half] = has('Go？', 'punctuation.japanese-width', 'ja');
		expect(fixedText('Go？', half)).toBe('Go?');
		expect(has('帰る？', 'punctuation.japanese-width', 'ja')).toEqual([]);
		expect(has('🎵?', 'punctuation.japanese-width', 'ja')).toEqual([]);
		expect(japanesePunctuationWidth('é')).toBeUndefined();
		expect(japanesePunctuationWidth('\u0301')).toBeUndefined();
	});

	it('keeps Arabic and Korean evidence gaps explicit rather than declaring unsupported policy checked', () => {
		for (const [language, text] of [
			['ar', 'نعود إلى البيت'],
			['ko', '다시 돌아와']
		]) {
			const [gap] = has(text, 'policy.language-coverage', language);
			expect(gap.severity).toBe('manual-review');
			expect(gap.fixes).toBeUndefined();
			expect(gap.explanation).toContain('evidence gap');
		}
		expect(has('', 'policy.language-coverage', 'ar')).toEqual([]);
	});

	it('reviews repeated punctuation and interruption semantics without rewriting delivery', () => {
		expect(has('Return!!!', 'punctuation.repeated-marks')).toHaveLength(1);
		expect(has('Return!', 'punctuation.repeated-marks')).toEqual([]);
		expect(has('If I could—', 'punctuation.interruption')).toHaveLength(1);
		expect(has('I re-return', 'punctuation.interruption')).toEqual([]);
	});
});

describe('explicit lyric language ranges', () => {
	it('evaluates a language-independent check once without dropping other language findings', () => {
		const rule = musixmatchRules.find((entry) => entry.id === 'mxm.punctuation.line-ending')!;
		const check = vi.spyOn(rule, 'check');
		try {
			const text = 'Return.\nReviens.\n帰る.';
			const findings = runRules(
				parseDocument(text),
				{
					...context,
					languageRanges: [
						{ from: 8, to: 16, language: 'fr' },
						{ from: 17, to: text.length, language: 'ja' }
					]
				},
				[rule]
			);
			expect(check).toHaveBeenCalledTimes(1);
			expect(findings.map((finding) => finding.from)).toEqual([6, 15, 19]);
		} finally {
			check.mockRestore();
		}
	});
	it('bounds evaluation by policy family while preserving unsupported and regional scope', () => {
		const text = 'x'.repeat(200);
		const calls: string[] = [];
		runRules(
			parseDocument(text),
			{
				...context,
				languageRanges: Array.from({ length: 200 }, (_, index) => ({
					from: index,
					to: index + 1,
					language: `xx-${index}`
				}))
			},
			[
				{
					id: 'scope.probe',
					version: 1,
					defaultSeverity: 'manual-review',
					sourceIds: [],
					check(_document, scoped) {
						calls.push(scoped.language);
						return [];
					}
				}
			]
		);
		expect(calls).toEqual(['en', 'und']);
		expect(has('Tu reviens ?', 'punctuation.french-question-space', 'fr_FR')).toHaveLength(1);
		expect(guidelinesForLanguage('nb_NO')).toEqual(guidelinesForLanguage('no'));
		expect(has('Imma return', 'spelling.standardized', 'xx-001')).toEqual([]);
	});
	it('places Arabic and Korean policy gaps in their own passages within an English document', () => {
		const text = 'We return\nنعود إلى البيت\n다시 돌아와';
		const arabic = text.indexOf('ن');
		const korean = text.indexOf('다');
		const findings = runRules(parseDocument(text), {
			...context,
			languageRanges: [
				{ from: arabic, to: korean - 1, language: 'ar' },
				{ from: korean, to: text.length, language: 'ko' }
			]
		}).filter((finding) => finding.ruleId === 'mxm.policy.language-coverage');
		expect(findings.map((finding) => finding.from)).toEqual([arabic, korean]);
	});
	it('uses French and Japanese punctuation policy only inside their selected spans', () => {
		const text = 'We return ?\nTu reviens ?\n帰る?';
		const frenchFrom = text.indexOf('Tu');
		const japaneseFrom = text.indexOf('帰');
		const diagnostics = runRules(parseDocument(text), {
			...context,
			languageRanges: [
				{ from: frenchFrom, to: japaneseFrom - 1, language: 'fr' },
				{ from: japaneseFrom, to: text.length, language: 'ja' }
			]
		});
		const french = diagnostics.filter(
			(item) => item.ruleId === 'mxm.punctuation.french-question-space'
		);
		const japanese = diagnostics.filter((item) => item.ruleId === 'mxm.punctuation.japanese-width');
		expect(french).toHaveLength(1);
		expect(french[0].from).toBe(text.indexOf(' ?', frenchFrom));
		expect(japanese).toHaveLength(1);
		expect(japanese[0].from).toBe(text.length - 1);
	});

	it('keeps a mixed-language phrase reviewable without a fix crossing its boundary', () => {
		const text = 'WE RETURN ENCORE';
		const diagnostics = runRules(parseDocument(text), {
			...context,
			languageRanges: [{ from: text.indexOf('ENCORE'), to: text.length, language: 'fr' }]
		});
		const [finding] = diagnostics.filter((item) => item.ruleId === 'mxm.format.expressive-case');
		expect(finding.explanation).toContain('explicit language boundary');
		expect(finding.fixes).toBeUndefined();
	});

	it('rejects conflicting span metadata instead of selecting a language by insertion order', () => {
		expect(() =>
			runRules(parseDocument('We return'), {
				...context,
				languageRanges: [
					{ from: 0, to: 6, language: 'fr' },
					{ from: 3, to: 9, language: 'ja' }
				]
			})
		).toThrow('overlapping language ranges');
	});
});
