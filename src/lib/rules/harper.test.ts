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

function engineReturning(makeLints: (text: string) => ReturnType<typeof lintAt>[]) {
	return {
		lint: vi.fn(async (text: string) => makeLints(text)),
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
