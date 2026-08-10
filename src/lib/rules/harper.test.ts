import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic, PerformerRecord } from '$lib/core/types.js';
import {
	createHarperDiagnosticProvider,
	disabledHarperLints,
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
		replacements?: string[];
		suggestionKind?: number;
		message?: string;
	} = {}
) {
	const from = text.indexOf(problem);
	const start = scalarOffset(text, from);
	const replacements =
		options.replacements ?? (options.replacement === undefined ? [] : [options.replacement]);
	return {
		lint_kind: () => options.kind ?? 'Grammar',
		lint_kind_pretty: () => options.prettyKind ?? 'Grammar',
		message: () => options.message ?? `Review \`${problem}\`.`,
		span: () => ({ start, end: start + [...problem].length }),
		suggestions: () =>
			replacements.map((replacement) => ({
				get_replacement_text: () => replacement,
				kind: () => options.suggestionKind ?? 0
			}))
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
		setLintConfig: vi.fn(async (config: Record<string, boolean>) => {
			void config;
		}),
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

	// Harper tokenizes `'90s` as a number followed by a one-letter word and
	// spell-checks the `s` into `so`, `as` and `is` — a fix preview reading
	// `'90s` → `'90so` — and its decade lint on `90's` would stand where
	// `numbers.decade-apostrophe`'s reviewed finding belongs. Every
	// decade-shaped token with an apostrophe is therefore masked, right or
	// wrong, curly or straight; the bare `90s` is a clean token and stays.
	it('masks decade tokens with apostrophes so Harper never tokenizes the trailing s', () => {
		const source = "[Intro]\n'90s Argentina in the 90's and the ’80s\nStill in my 20s";
		const projection = projectLyricsForHarper(parseDocument(source));

		expect(projection.text).toBe(
			'       \n     Argentina in the      and the     \nStill in my 20s'
		);
		expect([...projection.text].length).toBe([...source].length);
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

	it('switches the audited refusals off once, before the first lint', async () => {
		const engine = engineReturning(() => []);
		const provider = createHarperDiagnosticProvider(async () => engine);
		const text = '[Verse]\nClean line';
		const request = {
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 1
		};

		await provider.lint(request);
		await provider.lint(request);

		expect(engine.setLintConfig).toHaveBeenCalledOnce();
		expect(engine.setLintConfig).toHaveBeenCalledWith(
			Object.fromEntries(disabledHarperLints.map((name) => [name, false]))
		);
		expect(engine.setLintConfig.mock.invocationCallOrder[0]).toBeLessThan(
			engine.lint.mock.invocationCallOrder[0]
		);
	});

	it('drops dialect-preference findings arriving under the Regionalism kind', async () => {
		// `have a look` against `take a look` is a fact about dialects, not about
		// the lyric — a regionalism performed is the transcription.
		const text = '[Verse]\nHave a look at my heart';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'Have', {
				kind: 'Regionalism',
				replacement: 'Take',
				message: 'American English prefers `take a look` over `have a look`.'
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

	it('drops a spelling guess at a g-drop the transcription marks with an apostrophe', async () => {
		// `Runnin'` is the as-spoken form; Harper's dictionary sees bare `Runnin`
		// and guesses. The unmarked `somethin` must still come through — with no
		// elision apostrophe it is a misspelling Harper is right to question.
		const text = "[Verse]\nRunnin' from somethin real";
		const engine = engineReturning((projected) => [
			lintAt(projected, 'Runnin', { kind: 'Spelling', replacement: 'Running' }),
			lintAt(projected, 'somethin', { kind: 'Spelling', replacement: 'something' })
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
			from: text.indexOf('somethin'),
			ruleId: 'spelling.harper'
		});
	});

	it("leads a bare g-drop with the elision mark Harper's own -ing form vouches for", async () => {
		// `Killin` typed without its apostrophe used to offer only dictionary
		// guesses — `Killing`, `Kill's`, `Kelvin` — when the transcription-first
		// repair is the mark: `Killin'`. The `-ing` form in Harper's own list is
		// what proves the token is a g-drop, so the synthesized fix leads, the
		// `-ing` form stays second, and the nearest-word noise goes.
		const text = '[Verse]\nKillin the game';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'Killin', {
				kind: 'Spelling',
				replacements: ['Killing', "Kill's", 'Kelvin']
			})
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		const diagnostics = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 6
		});

		const from = text.indexOf('Killin');
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.fixes?.map((fix) => fix.label)).toEqual([
			"Replace with Killin'",
			'Replace with Killing'
		]);
		expect(diagnostics[0]?.fixes?.[0]?.edit.edits).toEqual([
			{ from, to: from + 'Killin'.length, insert: "Killin'" }
		]);
	});

	it('keeps ordinary fixes for a flagged token the dictionary endorses no -ing form of', async () => {
		// `chillin` comes back from real Harper as `chill in` with no `chilling`
		// beside it, so there is no endorsement to synthesize from — a guess of
		// ours would be the automatic-anchor mistake, plausible and unverifiable.
		const text = '[Verse]\nchillin all day';
		const engine = engineReturning((projected) => [
			lintAt(projected, 'chillin', { kind: 'Typo', replacement: 'chill in' })
		]);
		const provider = createHarperDiagnosticProvider(async () => engine);

		const diagnostics = await provider.lint({
			text,
			document: parseDocument(text),
			language: 'en',
			performers: [],
			revision: 6
		});

		expect(diagnostics[0]?.fixes?.map((fix) => fix.label)).toEqual(['Replace with chill in']);
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

	// The reported failure verbatim: over `'90s Argentina`, real Harper offered
	// to respell the `s` of a correctly written decade. Driven through the real
	// WASM because the bug lives in Harper's tokenizer, which no stub reproduces.
	it('has nothing to say about a correctly written decade', async () => {
		const text = "[Intro]\n'90s Argentina";
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

			expect(diagnostics).toEqual([]);
		} finally {
			await provider.dispose();
		}
	});

	it('keeps quiet about lyrics transcribed exactly as performed', async () => {
		// Every line here drew a finding from the default engine, measured before
		// the audit: `fuck` → `****`/`fudge` (AvoidCurses), `Runnin`/`lovin` →
		// `Running`/`Loin` (dictionary guesses at marked g-drops), `Cause it is` →
		// `Because it is` on the reviewed-preferred `'Cause` (CauseItIsBecause),
		// `5'2"` → prime symbols (FootInchMinuteSecondSymbols), `Fed up of` →
		// `with` (FedUpWith), and `Have a look` → `Take` (Regionalism kind).
		// Transcription follows the performance, so the answer to all of it is
		// silence.
		const text = `[Verse]
I don't give a fuck tonight
Runnin' and lovin' through the lights
'Cause it is what it is
She's 5'2" with an attitude
Fed up of all the lies
Have a look at my heart`;
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));

		try {
			await expect(
				provider.lint({
					text,
					document: parseDocument(text),
					language: 'en',
					performers: [],
					revision: 5
				})
			).resolves.toEqual([]);
		} finally {
			await provider.dispose();
		}
	});

	it('offers the elision mark first against the real dictionary', async () => {
		// The stub test above pins the synthesis; this one pins the endorsement
		// it reads — real Harper answering `Killin` with `Killing` in its list.
		const text = '[Verse]\nKillin the game';
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
				revision: 8
			});

			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0]?.fixes?.map((fix) => fix.label)).toEqual([
				"Replace with Killin'",
				'Replace with Killing'
			]);
		} finally {
			await provider.dispose();
		}
	});

	it('names real Harper lints and leaves no censoring or expanding rule enabled', async () => {
		// Two loud failures a Harper upgrade must produce rather than silently
		// undoing the audit: a renamed rule no longer exists in the engine's own
		// config, and a newly added censoring or register-formalizing rule is
		// enabled without an entry in `disabledHarperLints`.
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const linter = new LocalLinter({ binary });
		const config = await linter.getDefaultLintConfig();
		const descriptions = await linter.getLintDescriptions();

		for (const name of disabledHarperLints) {
			expect(config, `Harper no longer knows the lint ${name}`).toHaveProperty(name);
		}

		const uncovered = Object.entries(descriptions)
			.filter(
				([name, description]) =>
					config[name] !== false &&
					!disabledHarperLints.includes(name) &&
					/censor|euphemism|expands an initialism|informal/iu.test(description)
			)
			.map(([name]) => name);
		expect(uncovered).toEqual([]);
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

	// The sample transcription leaves exactly one mistake for Harper — `I has` —
	// so the loaded sample cites every origin the meta line can draw, Harper's
	// GitHub provenance included. The rest of what Harper notices there (`dont`,
	// `Definately`, the lowercase `i`) is claimed by native rules, which win
	// their shared ranges in this merge. Real WASM, beside the other real-WASM
	// pins: a Harper upgrade that starts or stops claiming the sample's lines
	// has to fail here rather than quietly change the introduction.
	it('keeps exactly one Harper finding on the sample transcription', async () => {
		const [{ sampleDraftLanguage, sampleDraftText }, { loadStatisticalLanguageDetector }] =
			await Promise.all([import('$lib/ui/sample-draft.js'), import('$lib/languages/detect.js')]);
		const { currentRuleSet, runRules, sourceRegistry } = await import('./index.js');
		await loadStatisticalLanguageDetector();

		const document = parseDocument(sampleDraftText);
		const native = runRules(document, {
			language: sampleDraftLanguage,
			performers: [],
			sources: sourceRegistry,
			ruleSetVersion: currentRuleSet.version,
			revision: 0
		});
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));

		try {
			const harper = await provider.lint({
				text: sampleDraftText,
				document,
				language: sampleDraftLanguage,
				performers: [],
				revision: 0
			});
			const surviving = mergeHarperDiagnostics(native, harper).filter((diagnostic) =>
				diagnostic.ruleId.endsWith('.harper')
			);

			expect(surviving).toHaveLength(1);
			expect(surviving[0]).toMatchObject({
				ruleId: 'grammar.harper',
				from: sampleDraftText.indexOf('has'),
				to: sampleDraftText.indexOf('has') + 3
			});
		} finally {
			await provider.dispose();
		}
	});
});
