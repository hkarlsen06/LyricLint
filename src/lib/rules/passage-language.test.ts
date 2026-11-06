import { describe, expect, it } from 'vitest';
import { parseDocument } from '#lib/core/parser.js';
import type { RuleContext } from '#lib/core/types.js';
import { sourceRegistry } from './data/sources.js';
import { runRules } from './engine.js';
import { createHarperDiagnosticProvider } from './harper.js';

const context: RuleContext = {
	profile: 'genius',
	language: 'en',
	performers: [],
	sources: sourceRegistry,
	ruleSetVersion: 'probe',
	revision: 0
};

describe('passage language checking boundary', () => {
	it.each(['fr', 'zz-Latn-custom'])(
		'does not join English grammar across a masked %s phrase',
		async (language) => {
			const [{ LocalLinter }, { binary }] = await Promise.all([
				import('harper.js'),
				import('harper.js/binary')
			]);
			const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));
			try {
				for (const text of [
					'She et moi have a beutiful plan.\nI has a room.',
					'[Verse]\n😀 She <i>et moi</i> have a beutiful plan.\nI has a room.',
					'She <span>et moi</span> have a beutiful plan.\nI has a room.'
				]) {
					const from = text.indexOf('et moi');
					const findings = await provider.lint({
						text,
						document: parseDocument(text),
						language: 'en',
						languageRanges: [{ from, to: from + 6, language }],
						performers: [],
						revision: 0
					});
					const words = findings.map((finding) => text.slice(finding.from, finding.to));
					expect(words).not.toContain('have');
					expect(words).toContain('beutiful');
					expect(words).toContain('has');
				}
			} finally {
				await provider.dispose();
			}
		}
	);

	it.each(['zz-Latn-custom', 'fr'])('keeps English neighbors outside %s overrides', (language) => {
		const text = 'Cuz you stay\nCuz I stay';
		const findings = runRules(parseDocument(text), {
			...context,
			languageRanges: [{ from: 0, to: 12, language }]
		});
		expect(findings.filter((d) => d.ruleId === 'spelling.standardized').map((d) => d.from)).toEqual(
			[13]
		);
	});

	it('keeps full English locale policy distinctions', () => {
		const text = 'Stay til dawn\nStay till dawn';
		const findings = runRules(parseDocument(text), {
			...context,
			language: 'en-US',
			languageRanges: [{ from: 0, to: 13, language: 'en-GB' }]
		});
		expect(
			findings.some(
				(d) => d.from === 5 && d.fixes?.some((f) => f.edit.edits.some((e) => e.insert === "'til"))
			)
		).toBe(false);
		expect(findings.some((d) => d.from === 19 && d.ruleId === 'spelling.language-variant')).toBe(
			true
		);
	});
	it.each(['sv', 'da', 'is', 'fo', 'nb', 'nn', 'no'])(
		'keeps %s guillemets while checking English quotes independently',
		(language) => {
			const text = '«Hej»\n“Hello”';
			for (const scope of [
				{ language, languageRanges: [{ from: 6, to: text.length, language: 'en' }] },
				{ language: 'en', languageRanges: [{ from: 0, to: 5, language }] }
			]) {
				const findings = runRules(parseDocument(text), { ...context, ...scope }).filter(
					(finding) => finding.ruleId === 'quotes.typewriter'
				);
				expect(findings.map((finding) => text.slice(finding.from, finding.to))).toEqual(['“', '”']);
				expect(
					findings
						.flatMap((finding) => finding.fixes ?? [])
						.flatMap((fix) => fix.edit.edits)
						.map((edit) => edit.insert)
				).toEqual(['"', '"']);
			}
		}
	);

	it('retains structure and removes replacements that cross ownership', () => {
		const text = '[Verse]\nCuz you stay  here';
		const findings = runRules(parseDocument(text), {
			...context,
			languageRanges: [{ from: 9, to: 10, language: 'zz-Latn-custom' }]
		});
		expect(findings.find((d) => d.ruleId === 'spelling.standardized')).toMatchObject({
			severity: 'manual-review',
			fixes: undefined
		});
		expect(findings.some((d) => d.ruleId === 'text.multiple-spaces')).toBe(true);
	});

	it('validates Genius ranges and does not infer a mistaken default from explicit multilingual lyrics', () => {
		const document = parseDocument('Bonjour mon ami, je chante pour toi et je suis ici');
		expect(() =>
			runRules(document, { ...context, languageRanges: [{ from: 0, to: 100, language: 'fr' }] })
		).toThrow('Invalid');
		expect(
			runRules(document, {
				...context,
				languageRanges: [{ from: 0, to: document.text.length, language: 'fr' }]
			}).some((d) => d.ruleId === 'language.selection-mismatch')
		).toBe(false);
	});

	it('bounds policy passes independently of arbitrary custom locale count', () => {
		const text = 'x'.repeat(200);
		let calls = 0;
		runRules(
			parseDocument(text),
			{
				...context,
				languageRanges: Array.from({ length: 100 }, (_, index) => ({
					from: index,
					to: index + 1,
					language: `zz-custom-${index}`
				}))
			},
			[
				{
					id: 'spelling.english-common',
					version: 1,
					defaultSeverity: 'suggestion',
					fixability: 'none',
					sourceIds: [],
					check() {
						calls += 1;
						return [];
					}
				}
			]
		);
		expect(calls).toBe(2);
	});

	it('uses real Harper with annotations, emoji, known and unknown overrides and English neighbors', async () => {
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));
		const text = '[Verse]\n😀 <i>Bonjour</i>\n\nI has counted every streetlight';
		try {
			const request = {
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 0
			};
			const baseline = '[Verse]\nBonjour\nOther words';
			const before = await provider.lint({
				...request,
				text: baseline,
				document: parseDocument(baseline)
			});
			expect(before.map((d) => baseline.slice(d.from, d.to))).toContain('Bonjour');
			for (const language of ['zz-Latn-custom', 'fr']) {
				const findings = await provider.lint({
					...request,
					languageRanges: [
						{ from: text.indexOf('Bonjour'), to: text.indexOf('Bonjour') + 7, language }
					]
				});
				expect(findings.some((d) => text.slice(d.from, d.to) === 'Bonjour')).toBe(false);
				expect(
					findings.map((d) => ({ word: text.slice(d.from, d.to), message: d.message }))
				).toContainEqual(expect.objectContaining({ word: 'has' }));
			}
			const crossing = await provider.lint({
				...request,
				languageRanges: [
					{
						from: text.indexOf('Bonjour') + 2,
						to: text.indexOf('Bonjour') + 3,
						language: 'zz-Latn-custom'
					}
				]
			});
			expect(crossing.filter((d) => d.from < text.indexOf('</i>'))).toEqual([]);
		} finally {
			await provider.dispose();
		}
	});
});
