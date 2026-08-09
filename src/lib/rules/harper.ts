import type {
	Diagnostic,
	DiagnosticFix,
	ParsedDocument,
	PerformerRecord,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import { standardizedSpellings } from './data/spelling.js';
import { sortDiagnostics } from './engine.js';

const harperSourceId = 'T-HARPER';
const maximumFixes = 3;

/**
 * Every rule ID a Harper finding can arrive under. These are the one set of
 * rules in the shipped rule set with no catalog entry and no reference page —
 * Harper's suggestions cite Harper — so the rule-set manifest is checked against
 * the registry plus exactly these, and `ruleIdFor` may return nothing else.
 *
 * They are declared in `harper-ids.ts` and re-exported here, so that a module
 * that only needs to *recognise* one — the panel's sort does — can ask without
 * importing this file's WASM bridge. Every existing importer still reads them
 * from here.
 */
export { harperRuleIds, isHarperRuleId, type HarperRuleId } from './harper-ids.js';

import type { HarperRuleId } from './harper-ids.js';

interface HarperSpan {
	start: number;
	end: number;
	free?: () => void;
}

interface HarperSuggestion {
	get_replacement_text(): string;
	kind(): number;
	free?: () => void;
}

interface HarperLint {
	lint_kind(): string;
	lint_kind_pretty(): string;
	message(): string;
	span(): HarperSpan;
	suggestions(): HarperSuggestion[];
	free?: () => void;
}

interface HarperEngine {
	lint(text: string, options: { language: 'plaintext'; dedup: boolean }): Promise<HarperLint[]>;
	setLintConfig(config: Record<string, boolean>): Promise<void>;
	clearWords(): Promise<void>;
	importWords(words: string[]): Promise<void>;
	dispose(): Promise<void>;
}

export interface HarperDiagnosticRequest {
	text: string;
	document: ParsedDocument;
	language: string;
	performers: readonly PerformerRecord[];
	revision: number;
}

export interface HarperDiagnosticProvider {
	lint(request: HarperDiagnosticRequest): Promise<Diagnostic[]>;
	dispose(): Promise<void>;
}

export type HarperEngineFactory = () => Promise<HarperEngine>;

/**
 * Harper lints switched off because what they advise is what the reviewed
 * Genius guidance refuses. This is a curated refusal, not a tuning: every
 * entry names a rule whose *purpose* contradicts transcription policy, and a
 * rule that merely misfires sometimes stays on behind the preview tier and
 * the card's own review-in-context explanation.
 *
 * - `AvoidCurses` censors. Its leading suggestions for an uncensored vocal
 *   are `****` and euphemisms, and lyrics are transcribed exactly as
 *   performed — censored only where the recording itself censors.
 * - The expanders rewrite informal register into prose. The catalog owns
 *   that decision per token: `spelling.texting-shorthand` expands only what
 *   nobody sings the letters of, and `spelling.standardized` answers `cuz`
 *   and `tho` behind reviewed gates. Harper's blanket family therefore
 *   either duplicates a native rule — which already wins the shared range —
 *   or contradicts a reviewed refusal: `OMG` stays as sung, and a `cuz` that
 *   means cousin is not `because`.
 * - `CauseItIsBecause` fires on the *preferred* form. `'Cause it is` reaches
 *   Harper with its elision apostrophe tokenized away as punctuation and
 *   comes back `Prefer because it is` — a finding on the exact spelling the
 *   reviewed data standardizes toward.
 * - `FootInchMinuteSecondSymbols` wants Unicode primes in `5'2"`. Lyric
 *   typography belongs to the quotes rules, and Genius lyrics are plain
 *   text. `UnclosedQuotes` falls with it: the inch mark that refusal keeps
 *   in the document is a quotation mark Harper can never see closed, so
 *   every height in a lyric would be reported as sloppy quoting.
 * - `FedUpWith` and `InOnTheCards` prefer one dialect's idiom over
 *   another's without arriving under the `Regionalism` kind that
 *   `appliesToLyrics` drops whole, so they are named here instead.
 *
 * Every name is pinned against the real engine's own config in
 * `harper.test.ts`, so a Harper upgrade that renames one fails loudly there
 * instead of silently re-enabling it.
 */
export const disabledHarperLints: readonly string[] = [
	'AvoidCurses',
	// Initialism expanders.
	'AsFarAsIKnow',
	'AsSoonAsPossible',
	'BeRightBack',
	'ByTheWay',
	'ExplainLikeImFive',
	'ForWhatItsWorth',
	'ForYourInformation',
	'IDontKnow',
	'IfIRecallCorrectly',
	'IfIUnderstandCorrectly',
	'IfYouKnowYouKnow',
	'InCaseYouMissedIt',
	'InMyHumbleOpinion',
	'InMyOpinion',
	'InRealLife',
	'LetMeKnow',
	'NeverMind',
	'OhMyGod',
	'PleaseTakeALook',
	'Really',
	'TalkToYouLater',
	'ToBeHonest',
	// Informal-register expanders.
	'Cybersec',
	'ExpandBecause',
	'ExpandControl',
	'ExpandThough',
	'ExpandThrough',
	// Fires on the reviewed-preferred `'Cause`.
	'CauseItIsBecause',
	// Measurement primes are not lyric typography, and the inch mark that
	// refusal keeps is a quote Harper can never see closed.
	'FootInchMinuteSecondSymbols',
	'UnclosedQuotes',
	// Dialect preference outside the Regionalism kind.
	'FedUpWith',
	'InOnTheCards'
];

const harperLintConfig: Record<string, boolean> = Object.fromEntries(
	disabledHarperLints.map((name) => [name, false])
);

interface HarperProjection {
	text: string;
	/** Original UTF-16 offset at each projected Unicode-scalar boundary. */
	originalOffsets: number[];
	/** Whether each projected scalar stands in for masked document structure. */
	maskedScalars: boolean[];
}

function markRange(mask: Uint8Array, range: TextRange): void {
	const from = Math.max(0, Math.min(mask.length, range.from));
	const to = Math.max(from, Math.min(mask.length, range.to));
	mask.fill(1, from, to);
}

/**
 * Give Harper the complete lyric flow while hiding Genius structure.
 *
 * Harper reports indices in Unicode scalar values; LyricLint and CodeMirror use
 * UTF-16 offsets. Replacing every masked scalar with exactly one space retains
 * scalar count, while `originalOffsets` maps every result back without changing
 * or normalizing the canonical document.
 */
export function projectLyricsForHarper(document: ParsedDocument): HarperProjection {
	const mask = new Uint8Array(document.text.length);

	for (const section of document.sections) {
		if (section.header) {
			markRange(mask, {
				from: section.from,
				to: section.lines[0]?.from ?? section.to
			});
		}

		for (const line of section.lines) {
			for (const span of line.styleSpans) {
				if ('unsupported' in span) {
					markRange(mask, span);
					continue;
				}
				markRange(mask, { from: span.from, to: span.contentFrom });
				markRange(mask, { from: span.contentTo, to: span.to });
			}
		}
	}

	let projected = '';
	const originalOffsets = [0];
	const maskedScalars: boolean[] = [];

	for (let offset = 0; offset < document.text.length;) {
		const codePoint = document.text.codePointAt(offset);
		const width = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
		const scalar = document.text.slice(offset, offset + width);
		let masked = false;
		for (let unit = offset; unit < offset + width; unit += 1) {
			masked ||= mask[unit] === 1;
		}

		// Physical line endings still delimit Harper's sentences and paragraphs.
		const replacement = masked && scalar !== '\r' && scalar !== '\n' ? ' ' : scalar;
		projected += replacement;
		maskedScalars.push(masked && replacement === ' ');
		offset += width;
		originalOffsets.push(offset);
	}

	return { text: projected, originalOffsets, maskedScalars };
}

function originalRange(projection: HarperProjection, span: HarperSpan): TextRange | undefined {
	if (
		!Number.isSafeInteger(span.start) ||
		!Number.isSafeInteger(span.end) ||
		span.start < 0 ||
		span.start > span.end ||
		span.end >= projection.originalOffsets.length
	) {
		return undefined;
	}

	for (let index = span.start; index < span.end; index += 1) {
		if (projection.maskedScalars[index]) return undefined;
	}

	const from = projection.originalOffsets[span.start];
	const to = projection.originalOffsets[span.end];
	return from === undefined || to === undefined ? undefined : { from, to };
}

function ruleIdFor(kind: string): HarperRuleId {
	switch (kind) {
		case 'Spelling':
		case 'Typo':
			return 'spelling.harper';
		case 'Enhancement':
		case 'Formatting':
		case 'Readability':
		case 'Redundancy':
		case 'Style':
			return 'style.harper';
		default:
			return 'grammar.harper';
	}
}

function plainMessage(message: string): string {
	return message.replace(/`([^`]*)`/gu, '$1');
}

function appliesToLyrics(lint: HarperLint): boolean {
	// Readability measures such as sentence length assume prose. A lyric can run
	// through many physical lines without sentence punctuation, so those findings
	// describe the transcription form rather than a problem in the lyrics.
	//
	// Regionalism prefers one dialect's form over another's — `take a look`
	// over `have a look`, `to date` over `till date` — and a lyric performed
	// in a dialect is transcribed in it. The kind is dropped whole rather than
	// rule by rule, so a Harper upgrade that adds a new dialect preference
	// stays quiet without an edit to `disabledHarperLints`.
	const kind = lint.lint_kind();
	return kind !== 'Readability' && kind !== 'Regionalism';
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
	return left.from < right.to && right.from < left.to;
}

const edgeApostrophes = new Set(["'", '’']);

function foldApostrophes(word: string): string {
	return word.replaceAll('’', "'").toLocaleLowerCase('en');
}

/**
 * Harper tokenizes a word's edge apostrophes as punctuation, so a form its own
 * imported dictionary endorses — `lil'`, `'til` — reaches it as the bare token
 * and comes back as a spelling finding whose leading suggestion is the very
 * word already in the document. Applying that fix rewrites only the token and
 * leaves the document's apostrophe outside the edit, which re-creates the
 * finding: an infinite loop, one appended apostrophe per press. A token that
 * spells a dictionary word once its neighbouring apostrophe is read with it is
 * already correct, so the finding is dropped rather than re-ranged.
 */
function isApostropheEdgedDictionaryWord(
	text: string,
	range: TextRange,
	dictionary: ReadonlySet<string>
): boolean {
	const token = text.slice(range.from, range.to);
	const before = text[range.from - 1];
	const after = text[range.to];
	return (
		(after !== undefined &&
			edgeApostrophes.has(after) &&
			dictionary.has(foldApostrophes(`${token}'`))) ||
		(before !== undefined &&
			edgeApostrophes.has(before) &&
			dictionary.has(foldApostrophes(`'${token}`)))
	);
}

/**
 * A trailing elision apostrophe after an `-in` token is a g-dropped form the
 * transcriber marked deliberately — `runnin'`, `sippin'`, `somethin'` — and
 * the as-spoken guideline keeps it. Harper's dictionary cannot hold every
 * dropped `g`, and what it guesses instead is never the word being sung
 * (measured: `Lovin` → `Loin`, `rollin` → `roll in`, `somethin` →
 * `some thin`). The apostrophe is required: a bare `somethin` with no elision
 * mark is a misspelling Harper is right to question. The length floor keeps
 * two-letter stems (`doin'`) while leaving short quoted words alone.
 */
function isMarkedGDrop(text: string, range: TextRange): boolean {
	const token = text.slice(range.from, range.to);
	const after = text[range.to];
	return (
		token.length >= 4 &&
		token.toLocaleLowerCase('en').endsWith('in') &&
		after !== undefined &&
		edgeApostrophes.has(after)
	);
}

/**
 * Apply Harper's overlap removal only after LyricLint has removed findings that
 * do not apply to lyrics.
 *
 * Harper deduplicates before returning its results. A long transcription with
 * no terminal punctuation produces one document-wide Readability finding, and
 * that finding used to swallow every useful finding inside it before
 * `appliesToLyrics` could discard the prose-only result. Preserve Harper's
 * first-finding-wins ordering among the diagnostics that survive our filter.
 */
function deduplicateApplicableDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	const accepted: Diagnostic[] = [];
	for (const diagnostic of diagnostics) {
		if (accepted.some((existing) => rangesOverlap(existing, diagnostic))) continue;
		accepted.push(diagnostic);
	}
	return accepted;
}

function fixForSuggestion(
	suggestion: HarperSuggestion,
	range: TextRange,
	problemText: string
): { label: string; edit: TextEdit } | undefined {
	const replacement = suggestion.get_replacement_text();
	switch (suggestion.kind()) {
		case 0:
			if (replacement === problemText) return undefined;
			return {
				label: `Replace with ${replacement}`,
				edit: { ...range, insert: replacement }
			};
		case 1:
			return {
				label: problemText.length > 0 ? `Remove ${problemText}` : 'Remove text',
				edit: { ...range, insert: '' }
			};
		case 2:
			return {
				label: `Insert ${replacement}`,
				edit: { from: range.to, to: range.to, insert: replacement }
			};
		default:
			return undefined;
	}
}

/**
 * A flagged `-in` token whose own suggestion list carries the `-ing` form is a
 * g-drop typed without its elision mark: Harper's dictionary has endorsed
 * `Killing`, so `Killin` is that word as sung. The transcription-first repair
 * is the apostrophe, not the `g` — the as-spoken guideline keeps the dropped
 * `g` and marks it — so the fix Harper cannot know to offer leads the row,
 * the `-ing` form stays second for the vocal that really sang it, and the
 * dictionary's remaining nearest-word guesses (`Kill's`, `Kelvin`) are noise
 * once the token is understood. Synthesis happens only on the dictionary's
 * own endorsement: `chillin`, which Harper answers with `chill in` and no
 * `-ing` form, keeps its ordinary fixes rather than a guess of ours.
 */
function elisionMarkFixes(
	suggestions: readonly HarperSuggestion[],
	range: TextRange,
	problemText: string,
	revision: number
): DiagnosticFix[] | undefined {
	const folded = problemText.toLocaleLowerCase('en');
	if (folded.length < 4 || !folded.endsWith('in')) return undefined;
	const gForm = suggestions.find(
		(suggestion) =>
			suggestion.kind() === 0 &&
			suggestion.get_replacement_text().toLocaleLowerCase('en') === `${folded}g`
	);
	if (!gForm) return undefined;
	const fixFor = (insert: string): DiagnosticFix => ({
		kind: 'preview',
		label: `Replace with ${insert}`,
		edit: { baseRevision: revision, edits: [{ ...range, insert }] }
	});
	return [fixFor(`${problemText}'`), fixFor(gForm.get_replacement_text())];
}

function convertLint(
	lint: HarperLint,
	projection: HarperProjection,
	original: string,
	revision: number
): Diagnostic | undefined {
	const span = lint.span();
	try {
		const range = originalRange(projection, span);
		if (!range) return undefined;

		const problemText = original.slice(range.from, range.to);
		const kind = lint.lint_kind();
		let fixes: DiagnosticFix[] = [];
		const seenEdits = new Set<string>();
		const suggestions = lint.suggestions();
		try {
			for (const suggestion of suggestions) {
				const fix = fixForSuggestion(suggestion, range, problemText);
				if (!fix) continue;
				const key = `${fix.edit.from}:${fix.edit.to}:${fix.edit.insert}`;
				if (seenEdits.has(key)) continue;
				seenEdits.add(key);
				fixes.push({
					kind: 'preview' as const,
					label: fix.label,
					edit: {
						baseRevision: revision,
						edits: [fix.edit]
					}
				});
				if (fixes.length === maximumFixes) break;
			}
			// Read off the raw suggestions rather than the capped fixes: `Lovin`
			// carries its `-ing` form third, behind two guesses.
			if (ruleIdFor(kind) === 'spelling.harper') {
				fixes = elisionMarkFixes(suggestions, range, problemText, revision) ?? fixes;
			}
		} finally {
			for (const suggestion of suggestions) suggestion.free?.();
		}

		const kindLabel = lint.lint_kind_pretty().trim() || kind;
		return {
			...range,
			ruleId: ruleIdFor(kind),
			severity: 'suggestion',
			// The one diagnostic constructor outside `rules/catalog/utils.ts`, so it
			// states the tier rather than inheriting the default by omission. `line`
			// is right and is the loudest case the deferral exists for: a dictionary
			// meeting a half-typed word looks for the nearest words it knows, so
			// Harper misfires on the way through almost every long one.
			settlesOn: 'line' as const,
			message: plainMessage(lint.message()),
			explanation: `${kindLabel} detected by Harper's local English proofreader. Lyrics often use deliberate fragments, dialect, repetition, and nonstandard spelling, so review this suggestion in context.`,
			sourceIds: [harperSourceId],
			...(fixes.length > 0 ? { fixes } : {})
		};
	} finally {
		span.free?.();
	}
}

const reviewedSpellingWords = standardizedSpellings.flatMap((spelling) => spelling.preferred);

function dictionaryWords(performers: readonly PerformerRecord[]): string[] {
	const words = new Set(reviewedSpellingWords);
	for (const name of performers.flatMap((performer) => [
		performer.displayName,
		...performer.aliases
	])) {
		for (const match of name.matchAll(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu)) {
			if (match[0]) words.add(match[0]);
		}
	}
	return [...words].sort((left, right) => left.localeCompare(right));
}

async function createWorkerEngine(): Promise<HarperEngine> {
	const [{ WorkerLinter }, { binary }] = await Promise.all([
		import('harper.js'),
		import('harper.js/binary')
	]);
	return new WorkerLinter({ binary }) as HarperEngine;
}

/**
 * Create one browser-worker-backed Harper provider.
 *
 * Construction does not fetch or instantiate the WASM module. The first
 * eligible English document triggers that work, so every other language keeps
 * the existing lightweight local rule path.
 */
export function createHarperDiagnosticProvider(
	createEngine: HarperEngineFactory = createWorkerEngine
): HarperDiagnosticProvider {
	let enginePromise: Promise<HarperEngine> | undefined;
	let importedWordKey: string | undefined;

	function engine(): Promise<HarperEngine> {
		// The audited refusals are applied before the first lint ever runs: the
		// config is a property of the engine, not of any one document, and a
		// finding produced under the default config would censor or formalize a
		// lyric on the engine's very first answer.
		enginePromise ??= createEngine().then(async (harper) => {
			await harper.setLintConfig(harperLintConfig);
			return harper;
		});
		return enginePromise;
	}

	return {
		async lint(request) {
			if (resolveLanguageTag(request.language) !== 'en' || request.text.trim().length === 0) {
				return [];
			}

			const harper = await engine();
			// LyricLint's reviewed Genius policy is authoritative. Teaching
			// Harper the preferred forms prevents its general-purpose dictionary
			// from contradicting spellings such as "ayy"; native rules still
			// diagnose the reviewed non-preferred forms.
			const words = dictionaryWords(request.performers);
			const wordKey = words.join('\u0000');
			if (wordKey !== importedWordKey) {
				await harper.clearWords();
				if (words.length > 0) await harper.importWords(words);
				importedWordKey = wordKey;
			}

			const projection = projectLyricsForHarper(request.document);
			const lints = await harper.lint(projection.text, {
				language: 'plaintext',
				// Harper's overlap removal has to run after LyricLint drops prose-only
				// findings, or one document-wide Readability lint hides everything in it.
				dedup: false
			});

			const dictionary = new Set(words.map(foldApostrophes));
			const diagnostics: Diagnostic[] = [];
			for (const lint of lints) {
				try {
					if (!appliesToLyrics(lint)) continue;
					const diagnostic = convertLint(lint, projection, request.text, request.revision);
					if (!diagnostic) continue;
					if (
						diagnostic.ruleId === 'spelling.harper' &&
						(isApostropheEdgedDictionaryWord(request.text, diagnostic, dictionary) ||
							isMarkedGDrop(request.text, diagnostic))
					) {
						continue;
					}
					diagnostics.push(diagnostic);
				} finally {
					lint.free?.();
				}
			}
			return sortDiagnostics(deduplicateApplicableDiagnostics(diagnostics));
		},
		async dispose() {
			const pending = enginePromise;
			enginePromise = undefined;
			if (!pending) return;
			const harper = await pending;
			await harper.dispose();
		}
	};
}

function sameRange(left: Diagnostic, right: Diagnostic): boolean {
	return left.from === right.from && left.to === right.to;
}

/**
 * Native, reviewed LyricLint rules win whenever Harper points at the same
 * source range. This keeps the sample's apostrophe and pronoun findings from
 * appearing twice and retains the more specific provenance and explanation.
 */
export function mergeHarperDiagnostics(
	nativeDiagnostics: readonly Diagnostic[],
	harperDiagnostics: readonly Diagnostic[]
): Diagnostic[] {
	const additions = harperDiagnostics.filter(
		(harper) => !nativeDiagnostics.some((native) => sameRange(native, harper))
	);
	return sortDiagnostics([...nativeDiagnostics, ...additions]);
}
