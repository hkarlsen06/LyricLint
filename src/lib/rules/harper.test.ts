import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic, PerformerRecord } from '$lib/core/types.js';
import {
	createHarperDiagnosticProvider,
	mergeHarperDiagnostics,
	projectLyricsForHarper
} from './harper.js';
import { spellingTextingShorthandRule } from './catalog/spelling-texting-shorthand.js';
import { checkRule } from './rule-test-utils.js';

function scalarOffset(text: string, utf16Offset: number): number {
	return [...text.slice(0, utf16Offset)].length;
}

function lintAt(
	text: string,
	problem: string,
	options: {
		kind?: string;
		prettyKind?: string;
		replacement?: string;
		suggestionKind?: number;
		message?: string;
	} = {}
) {
	const from = text.indexOf(problem);
	const start = scalarOffset(text, from);
	return {
		lint_kind: () => options.kind ?? 'Grammar',
		lint_kind_pretty: () => options.prettyKind ?? 'Grammar',
		message: () => options.message ?? `Review \`${problem}\`.`,
		span: () => ({ start, end: start + [...problem].length }),
		suggestions: () =>
			options.replacement === undefined
				? []
				: [
						{
							get_replacement_text: () => options.replacement!,
							kind: () => options.suggestionKind ?? 0
						}
					]
	};
}

function engineReturning(
	makeLints: (
		text: string,
		options: { language: 'plaintext'; dedup: boolean }
	) => ReturnType<typeof lintAt>[]
) {
	return {
		lint: vi.fn(async (text: string, options: { language: 'plaintext'; dedup: boolean }) =>
			makeLints(text, options)
		),
		clearWords: vi.fn(async () => {}),
		importWords: vi.fn(async (words: string[]) => {
			void words;
		}),
		dispose: vi.fn(async () => {})
	};
}

describe('Harper lyric projection', () => {
	it('masks headers and performer markup while retaining scalar-to-UTF-16 offsets', () => {
		const source = `[Verse: 🎤]\n<i>I dont</i>\nA 😀 example`;
		const projection = projectLyricsForHarper(parseDocument(source));

		expect(projection.text).toBe(`          \n   I dont    \nA 😀 example`);
		const projectedExample = [...projection.text].findIndex(
			(_scalar, index, scalars) => scalars.slice(index, index + 7).join('') === 'example'
		);
		expect(projection.originalOffsets[projectedExample]).toBe(source.indexOf('example'));
	});
});

describe('Harper diagnostic provider', () => {
	it('does not load the English engine for another selected language', async () => {
		const createEngine = vi.fn(async () => engineReturning(() => []));
		const provider = createHarperDiagnosticProvider(createEngine);
		const text = '[Vers]\nDette er riktig';

		await expect(
			provider.lint({
				text,
				document: parseDocument(text),
				language: 'no',
				performers: [],
				revision: 2
			})
		).resolves.toEqual([]);
		expect(createEngine).not.toHaveBeenCalled();
	});

	it('maps scalar spans after emoji to preview-only UTF-16 fixes', async () => {
		const text = '[Verse]\n😀 This are wrong';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'are', {
				replacement: 'is',
				message: 'Use `is` here.'
			})
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);
		const performers: PerformerRecord[] = [
			{
				id: 'renee',
				displayName: 'Renée Vale',
				normalizedKey: 'renee vale',
				aliases: ['R. Vale'],
				colorId: 'violet',
				order: 0
			}
		];

		const diagnostics = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en-US',
			performers,
			revision: 7
		});

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			from: text.indexOf('are'),
			to: text.indexOf('are') + 3,
			ruleId: 'grammar.harper',
			severity: 'suggestion',
			message: 'Use is here.',
			sourceIds: ['T-HARPER'],
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with is',
					edit: {
						baseRevision: 7,
						edits: [{ from: text.indexOf('are'), to: text.indexOf('are') + 3, insert: 'is' }]
					}
				}
			]
		});
		expect(engine.importWords).toHaveBeenCalledWith(
			expect.arrayContaining(['ayy', 'R', 'Renée', 'Vale'])
		);
	});

	it('teaches Harper the reviewed Genius-standard spellings', async () => {
		const imported = new Set<string>();
		const engine = engineReturning((projected) =>
			imported.has('ayy')
				? []
				: [
						lintAt(projected, 'Ayy', {
							kind: 'Spelling',
							replacement: 'Any'
						})
					]
		);
		engine.importWords.mockImplementation(async (words: string[]) => {
			for (const word of words) imported.add(word);
		});
		const provider = createHarperDiagnosticProvider(async () => engine);
		const text = '[Verse]\nAyy, we made it';

		await expect(
			provider.lint({
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 1
			})
		).resolves.toEqual([]);
		expect(engine.importWords).toHaveBeenCalledWith(expect.arrayContaining(['ayy']));
	});

	it('drops a spelling guess whose token joined with its edge apostrophe is a taught word', async () => {
		// Harper tokenizes edge apostrophes as punctuation, so the already-correct
		// `lil'` reaches it as bare `lil` and its dictionary offers `lil'` back —
		// a fix that appends a second apostrophe and re-creates the finding
		// forever. The curly form and the leading-apostrophe form (`'til`) take
		// the same path; a token with no adjacent apostrophe must still pass.
		const text = "[Verse]\nStay 'til my lil' homie ’cause we sing";
		const engine = engineReturning((projected) => [
			lintAt(projected, 'til', { kind: 'Spelling', replacement: "'til" }),
			lintAt(projected, 'lil', { kind: 'Spelling', replacement: "lil'" }),
			lintAt(projected, 'cause', { kind: 'Spelling', replacement: 'because' }),
			lintAt(projected, 'sing', { kind: 'Spelling', replacement: 'sting' })
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		const diagnostics = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 1
		});

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			from: text.indexOf('sing'),
			ruleId: 'spelling.harper'
		});
	});

	it('drops findings that touch masked document structure', async () => {
		const text = '[Verse]\nClean line';
		const engine = engineReturning((projected) => [
			lintAt(projected, '       ', { replacement: 'Header' })
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		await expect(
			provider.lint({
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 1
			})
		).resolves.toEqual([]);
	});

	it('drops prose readability findings that do not apply to lyrics', async () => {
		const text = '[Verse]\nUnder city lights we walk\nWhere the stars and skyline meet';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'Under city lights we walk', {
				kind: 'Readability',
				prettyKind: 'Readability',
				message: 'This sentence is 41 words long.'
			})
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		await expect(
			provider.lint({
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 1
			})
		).resolves.toEqual([]);
	});

	it('keeps a real agreement finding past the document-wide readability threshold', async () => {
		const text = `[Verse]
I has counted every streetlight
You said we drive all night
And the quiet part was never quiet
We let the engine hum instead
The map you drew was a coffee ring
I keep it folded in the door
I heard it calling through the wall`;
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));

		try {
			const diagnostics = await provider.lint({
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 9
			});

			expect(text.length).toBeGreaterThan(200);
			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0]).toMatchObject({
				from: text.indexOf('has'),
				to: text.indexOf('has') + 3,
				ruleId: 'grammar.harper',
				message: 'The form of the verb must agree in grammatical number with the pronoun.'
			});
		} finally {
			await provider.dispose();
		}
	});

	it('does not re-flag a reviewed apostrophe-edged spelling the document already uses', async () => {
		// The state every user lands in after accepting `Replace with lil'` from
		// the native rule. Real Harper reads `lil'` as bare `lil` plus
		// punctuation and offered `lil'` back, which appended an apostrophe per
		// press forever; the stub test above pins the filter, this one pins the
		// tokenization it exists for.
		const text = "[Verse]\nRollin' with my lil' homie";
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));

		try {
			const diagnostics = await provider.lint({
				text,
				document: parseDocument(text),
				language: 'en',
				performers: [],
				revision: 3
			});

			const lilFrom = text.indexOf('lil');
			expect(
				diagnostics.filter((diagnostic) => diagnostic.from < lilFrom + 3 && diagnostic.to > lilFrom)
			).toEqual([]);
		} finally {
			await provider.dispose();
		}
	});

	it('still keeps only the first of applicable overlapping findings', async () => {
		const text = '[Verse]\nThis are wrong';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'are', { kind: 'Agreement', message: 'Agreement finding.' }),
			lintAt(projected, 'are', { kind: 'Grammar', message: 'Overlapping grammar finding.' })
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		const diagnostics = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 1
		});

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.message).toBe('Agreement finding.');
	});

	it('translates insertion suggestions into zero-width document edits', async () => {
		const text = '[Verse]\nThis needs word';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'needs', {
				replacement: ' another',
				suggestionKind: 2
			})
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		const [diagnostic] = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 4
		});

		const to = text.indexOf('needs') + 'needs'.length;
		expect(diagnostic?.fixes?.[0]).toMatchObject({
			label: 'Insert  another',
			edit: {
				baseRevision: 4,
				edits: [{ from: to, to, insert: ' another' }]
			}
		});
	});

	it('disposes an engine that was actually loaded', async () => {
		const engine = engineReturning(() => []);
		const provider = createHarperDiagnosticProvider(async () => engine);
		const text = '[Verse]\nClean line';

		await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 1
		});
		await provider.dispose();

		expect(engine.dispose).toHaveBeenCalledOnce();
	});
});

describe('Harper diagnostic merging', () => {
	it('keeps a reviewed native finding when Harper reports the same range', () => {
		const native: Diagnostic = {
			from: 10,
			to: 14,
			ruleId: 'spelling.english-common',
			severity: 'suggestion',
			message: 'Use the standard spelling.',
			explanation: 'Reviewed spelling.',
			sourceIds: ['L-EN-COMMON']
		};
		const harper: Diagnostic = {
			...native,
			ruleId: 'spelling.harper',
			message: 'Did you mean to spell this this way?',
			explanation: 'Harper spelling.',
			sourceIds: ['T-HARPER']
		};

		expect(mergeHarperDiagnostics([native], [harper])).toEqual([native]);
	});

	// Harper's dictionary has no idea what «Idk» is, so it offers «Id», «Ids» and
	// «Ilk» — three replacements that are not words the vocal could be singing,
	// under a card asking whether the spelling was meant. That is the failure this
	// merge exists to prevent, and the repair is a native rule claiming the token
	// rather than a list of words Harper is told to skip: the reviewed rule then
	// says what the shorthand stands for, and Harper's guess never reaches the
	// panel. Driven through the real rule, because a hand-written span would pass
	// whether or not the rule still covers that token.
	it("drops Harper's guess at a token a reviewed rule already claims", () => {
		const text = '[Verse]\nIdk what to tell you';
		const native = checkRule(spellingTextingShorthandRule, text);
		const harper: Diagnostic[] = native.map((finding) => ({
			from: finding.from,
			to: finding.to,
			ruleId: 'spelling.harper',
			severity: 'suggestion',
			message: 'Did you mean to spell Idk this way?',
			explanation: 'Spelling detected by Harper.',
			sourceIds: ['T-HARPER']
		}));

		expect(native).toHaveLength(1);
		expect(mergeHarperDiagnostics(native, harper)).toEqual(native);
	});
});
