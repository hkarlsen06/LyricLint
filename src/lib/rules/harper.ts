import type {
	Diagnostic,
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

function ruleIdFor(kind: string): string {
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
		const fixes = [];
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
		} finally {
			for (const suggestion of suggestions) suggestion.free?.();
		}

		const kind = lint.lint_kind();
		const kindLabel = lint.lint_kind_pretty().trim() || kind;
		return {
			...range,
			ruleId: ruleIdFor(kind),
			severity: 'suggestion',
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
		enginePromise ??= createEngine();
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
				dedup: true
			});

			const diagnostics: Diagnostic[] = [];
			for (const lint of lints) {
				try {
					const diagnostic = convertLint(lint, projection, request.text, request.revision);
					if (diagnostic) diagnostics.push(diagnostic);
				} finally {
					lint.free?.();
				}
			}
			return sortDiagnostics(diagnostics);
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
