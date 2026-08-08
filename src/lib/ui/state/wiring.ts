import { runRules } from '$lib/rules/index.js';
import { sourceRegistry } from '$lib/rules/index.js';
import { findExactPerformer } from '$lib/performers/index.js';
import type { VoiceGroupRange } from '$lib/editor/index.js';
import { lineNumberAt } from '$lib/editor/section-links.js';
import { isLyricLine, scanPhysicalLines } from '$lib/core/parser.js';
import type {
	Diagnostic,
	EditorSnapshot,
	LineAnchor,
	ParsedDocument,
	PerformerRecord,
	RuleContext,
	SectionLink,
	VoiceGroup
} from '$lib/core/types.js';

const voiceGroupRangeCache = new WeakMap<
	ParsedDocument,
	WeakMap<readonly PerformerRecord[], VoiceGroupRange[]>
>();

/**
 * Whether a sync run has anything left to time.
 *
 * The lines it would tap are `isLyricLine`'s, the same answer the editor's column
 * and sync mode use, matched here against the anchors' own line numbers — both of
 * which the shell already holds. A song with nothing to tap is not a finished one.
 */
export function everyLyricLineTimed(text: string, anchors: readonly LineAnchor[]): boolean {
	const timed = new Set(anchors.map((anchor) => anchor.line));
	let stampable = 0;
	for (const [index, line] of scanPhysicalLines(text).entries()) {
		if (!isLyricLine(line.text)) continue;
		stampable += 1;
		if (!timed.has(index + 1)) return false;
	}
	return stampable > 0;
}

/**
 * Whether a sync run has timed lines to skip past.
 *
 * The song this is for was synced once and then edited — a long line split in
 * two, in several places — so it is timed everywhere except the new lines, and
 * a run walking towards the next one re-listens through whole verses that are
 * already right. The skip is meaningful exactly when the first untimed lyric
 * line at or after the caret has a *timed* lyric line between it and the caret:
 * that predecessor is where the jump lands, and if it is the caret's own line
 * the next tap is already aimed at the gap and there is nothing to skip.
 *
 * This mirrors the editor's own `lyricSyncSkipTarget` off values the shell
 * already holds — the same arrangement `everyLyricLineTimed` has with
 * `runStart` — because the strip draws the control from the shell's state, and
 * a handle asked inside a derived would never be re-asked.
 */
export function timedLinesSkippable(
	text: string,
	anchors: readonly LineAnchor[],
	caretOffset: number
): boolean {
	const caretLine = lineNumberAt(text, caretOffset);
	const timed = new Set(anchors.map((anchor) => anchor.line));
	let landing: number | undefined;
	for (const [index, line] of scanPhysicalLines(text).entries()) {
		const number = index + 1;
		if (number < caretLine || !isLyricLine(line.text)) continue;
		if (!timed.has(number)) return landing !== undefined && landing > caretLine;
		landing = number;
	}
	return false;
}

/**
 * Build the immutable rule context for one document revision. Sources come from
 * the bundled reviewed registry; no network access is involved.
 */
export function buildRuleContext(
	language: string,
	performers: readonly PerformerRecord[],
	ruleSetVersion: string,
	revision: number
): RuleContext {
	return {
		language,
		performers,
		sources: sourceRegistry,
		ruleSetVersion,
		revision
	};
}

/** Run every enabled rule against one parsed revision, sorted by severity. */
export function computeDiagnostics(parsed: ParsedDocument, context: RuleContext): Diagnostic[] {
	return runRules(parsed, context);
}

/**
 * Whether one document change is somebody typing, as opposed to text arriving
 * whole.
 *
 * This is what holds a `document`-tier finding back, and it has to separate two
 * things a snapshot cannot tell apart on its own. Opening a draft, pasting a
 * transcription, loading the sample and applying a bulk fix all deliver a
 * finished document in one change — the shape findings are right immediately and
 * waiting on them would read as the linter being slow. Typing delivers it a
 * character at a time, and the shape is wrong the whole way down.
 *
 * The signal is the size of the *changed span*, not the length delta, and that
 * distinction is the bug it was written to fix. `Fix all 2 · Replace with '`
 * over two curly apostrophes rewrites two characters in different verses for a
 * net delta of zero, so a length comparison called the loudest bulk press in the
 * application "typing" and blinked every shape finding off the panel for a
 * second and a half — the exact churn this whole mechanism exists to remove.
 * Comparing from both ends catches it: the span between the common prefix and
 * the common suffix covers both edits.
 *
 * Two characters rather than one, so an IME commit, a bracket auto-close and a
 * `\r\n` all count as typing.
 *
 * **It is the fallback, not the whole answer.** A change dispatched as one
 * complete edit says so on the snapshot (`EditorSnapshot.atomic`, off
 * `dispatchAtomicEdit`'s own `input.atomic` annotation), because the case this
 * function cannot ever get right is a single-occurrence fix: `Dont` → `Don't`
 * inserts one character at the caret and is indistinguishable from typing one
 * there. What is left for this to judge is the changes nobody dispatched —
 * keystrokes, pastes, drops — where the size of the change is genuinely all
 * there is to go on.
 */
export function isTypingChange(previousText: string, nextText: string): boolean {
	if (previousText === nextText) return false;
	const limit = Math.min(previousText.length, nextText.length);
	let prefix = 0;
	while (prefix < limit && previousText[prefix] === nextText[prefix]) prefix += 1;
	let suffix = 0;
	while (
		suffix < limit - prefix &&
		previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
	) {
		suffix += 1;
	}
	const removed = previousText.length - prefix - suffix;
	const inserted = nextText.length - prefix - suffix;
	return Math.max(removed, inserted) <= 2;
}

export interface EditorStateFilter {
	/**
	 * Whether the document has stopped changing under the user's hands.
	 *
	 * Defaults to true, because a caller that does not track typing is a caller
	 * looking at a document nobody is typing into — a test, or the landing page's
	 * demo. The workbench passes the real answer.
	 */
	settled?: boolean;
}

/**
 * Adjust one revision's findings for editor state the rules cannot see.
 *
 * Rules run against a parsed document and nothing else, so three facts never
 * reach them: where the caret is, which sections are linked, and whether the
 * document is still being typed. All three are applied here rather than passed
 * into `RuleContext`, because this runs on every snapshot while the lint itself
 * is memoized on the document — a link made or taken off changes no text, and a
 * suggestion that outlived the press that answered it would sit there until the
 * next keystroke.
 *
 * The last of the three is `settlesOn`, and it is the reason this function is
 * worth its cost. A rule sees a document mid-composition as a finished one, so
 * most of the catalog spends the keystrokes between two words asserting things
 * the next keystroke refutes. Measured over one short verse typed a character at
 * a time, 21 cards appeared and 16 of them were doomed — `[` is an unbalanced
 * bracket for eight keystrokes, `thoug` is one edit from `though`, and a song
 * has one distinct verse until the second one is written.
 *
 * **Deferral is a statement about a document being written, not about where the
 * caret is parked.** Only `caret` waits on the caret alone; `line` wants the
 * caret *and* live typing, because a caret at rest is not a line being composed.
 * Reading it the other way cost two real findings: the landing page's demo seeds
 * a collapsed caret at offset 0 and never moves it, so the `section.header-prose`
 * the page's own copy names went permanently undrawn; and a transcriber who
 * types the last line of a song and stops leaves the caret there forever, which
 * hid that line's findings from the panel *and* from the `Fix N automatically`
 * batch, which plans over what is visible.
 */
export function filterForEditorState(
	snapshot: EditorSnapshot,
	diagnostics: readonly Diagnostic[],
	sectionLinks: readonly SectionLink[] = [],
	options: EditorStateFilter = {}
): Diagnostic[] {
	const settled = options.settled ?? true;
	const kept = dropLinkedRepeats(snapshot, diagnostics, sectionLinks);
	if (settled && kept.every((diagnostic) => (diagnostic.settlesOn ?? 'line') !== 'caret')) {
		return [...kept];
	}
	const caretLines = linesUnderTheCaret(snapshot, sectionLinks);
	// One left-to-right pass rather than `lineNumberAt` per diagnostic, which is
	// an O(offset) walk: this used to run for two rule ids and now runs for
	// nearly every finding, on every keystroke and every caret move.
	const lineAt = lineNumberLookup(snapshot.text);
	return kept.filter((diagnostic) => {
		switch (diagnostic.settlesOn ?? 'line') {
			case 'character':
				return true;
			case 'document':
				return settled;
			case 'caret':
				return !caretLines.has(lineAt(diagnostic.from));
			default:
				return settled || !caretLines.has(lineAt(diagnostic.from));
		}
	});
}

/** Line numbers for many offsets in one pass, in the order they are asked for. */
function lineNumberLookup(text: string): (offset: number) => number {
	let starts: number[] | undefined;
	return (offset) => {
		if (!starts) {
			starts = [0];
			for (let index = 0; index < text.length; index += 1) {
				if (text[index] === '\n') starts.push(index + 1);
			}
		}
		let low = 0;
		let high = starts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (starts[mid]! <= offset) low = mid;
			else high = mid - 1;
		}
		return low + 1;
	};
}

/**
 * The lines the caret is composing: its own, and — where the caret sits in a
 * linked section — the lines its edits are being mirrored onto, which are being
 * written just as much as the one under it.
 *
 * A selection defers nothing. A range is not somewhere a word is being typed; it
 * is a decision already made about text that is already there, and hiding
 * findings under it would take away the ones the user selected them to read.
 *
 * **A mirrored line is only a peer where the peer section actually has one.**
 * The offset arithmetic assumes every member of a link runs to the same length,
 * which the merge-structure link model explicitly does not require — two
 * choruses differing by a line is the shape the whole feature was rebuilt for.
 * Unbounded, a caret on the fourth line of a long chorus resolved to a line in
 * whichever section happened to sit at that offset from the peer's header, and
 * suppressed a finding in a section that was not in the link at all.
 */
function linesUnderTheCaret(
	snapshot: EditorSnapshot,
	sectionLinks: readonly SectionLink[]
): Set<number> {
	if (snapshot.selection.anchor !== snapshot.selection.head) return new Set();

	const { text } = snapshot;
	const caret = snapshot.selection.head;
	const activeLine = lineNumberAt(text, caret);
	const lines = new Set([activeLine]);
	const section = snapshot.parsed.sections.find(
		(candidate) =>
			candidate.header &&
			candidate.lines.some((line) => line.from <= caret && caret <= line.lineEndingRange.from)
	);
	if (!section?.header) return lines;

	const headerLine = lineNumberAt(text, section.header.from);
	const link = sectionLinks.find((candidate) => candidate.lines.includes(headerLine));
	for (const peerHeaderLine of link?.lines ?? []) {
		if (peerHeaderLine === headerLine) continue;
		const peer = snapshot.parsed.sections.find(
			(candidate) =>
				candidate.header && lineNumberAt(text, candidate.header.from) === peerHeaderLine
		);
		const peerLast = peer?.lines.at(-1);
		if (!peerLast) continue;
		const mirrored = peerHeaderLine + activeLine - headerLine;
		if (mirrored > peerHeaderLine && mirrored <= lineNumberAt(text, peerLast.from)) {
			lines.add(mirrored);
		}
	}
	return lines;
}

/**
 * Stop suggesting a link where one is already made.
 *
 * Linked sections keep identical words by construction, so the suggestion would
 * otherwise fire on its own result forever. Membership of *any* group is enough
 * to go quiet, which under-reports a group only partly linked — deliberately:
 * leaving one repeat out is a decision the user made in the picker, and this
 * rule exists to catch the copies nobody tied together, not to argue with them.
 */
function dropLinkedRepeats(
	snapshot: EditorSnapshot,
	diagnostics: readonly Diagnostic[],
	sectionLinks: readonly SectionLink[]
): readonly Diagnostic[] {
	if (sectionLinks.length === 0) return diagnostics;
	const linkedLines = new Set(sectionLinks.flatMap((link) => link.lines));
	return diagnostics.filter(
		(diagnostic) =>
			!(
				diagnostic.ruleId === 'section.unlinked-repeat' &&
				linkedLines.has(lineNumberAt(snapshot.text, diagnostic.from))
			)
	);
}

/**
 * Resolve a legend group's raw name text into roster performer IDs.
 *
 * A whole-name exact match wins first so that a performer named `Echo & The
 * Glass` is never split. Otherwise the raw text is split on top-level commas
 * and ampersands and each part is matched, which recovers joint groups such as
 * `Avery & Blair`. Unmatched parts are ignored for display coloring only; they
 * never change the canonical document.
 */
function decodeLegendText(value: string): string {
	return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => {
		switch (entity) {
			case '&amp;':
				return '&';
			case '&lt;':
				return '<';
			case '&gt;':
				return '>';
			case '&quot;':
				return '"';
			case '&#39;':
				return "'";
			default:
				return entity;
		}
	});
}

function resolvePerformerIds(
	rawNameText: string,
	performers: readonly PerformerRecord[]
): string[] {
	const whole = findExactPerformer(decodeLegendText(rawNameText), performers);
	if (whole) return [whole.id];
	const parts = rawNameText
		.split(/(?:\s*,\s+|\s+&\s+)/u)
		.map(decodeLegendText)
		.filter((part) => part.length > 0);
	const ids: string[] = [];
	for (const part of parts) {
		const match = findExactPerformer(part, performers);
		if (match && !ids.includes(match.id)) ids.push(match.id);
	}
	return ids;
}

/**
 * Derive view-only voice-group highlight ranges from a parsed document.
 *
 * Styled spans map to their section-local slot group; the remaining plain text
 * of a line in a section with a legend maps to the slot-1 group. Highlighting
 * is decoration only and never alters exported text.
 */
export function resolveVoiceGroupRanges(
	parsed: ParsedDocument,
	performers: readonly PerformerRecord[]
): VoiceGroupRange[] {
	const cached = voiceGroupRangeCache.get(parsed)?.get(performers);
	if (cached) return cached;
	const ranges: VoiceGroupRange[] = [];

	for (const section of parsed.sections) {
		if (section.voiceGroups.length === 0) continue;
		const resolvedGroups = new Map<number, VoiceGroup>();
		for (const group of section.voiceGroups) {
			resolvedGroups.set(group.styleSlot, {
				...group,
				performerIds: group.rawNameText
					? resolvePerformerIds(group.rawNameText, performers)
					: group.performerIds
			});
		}
		// Malformed or unsupported markup (e.g. an <i> left open across lines)
		// makes the implicit "everything else is the plain voice" inference
		// unreliable — but only where the broken markup reaches: the lines that
		// carry a broken tag, plus the lines inside an apparently unclosed
		// wrapper. Clean lines in the same section keep the plain fallback, and
		// explicitly tagged spans and legend names always keep their colors.
		const plainGroup = resolvedGroups.get(1);
		const suppressedLines = new Set<(typeof section.lines)[number]>();
		let openUnmatched = false;
		for (const line of section.lines) {
			const openAtStart = openUnmatched;
			let lineBroken = false;
			for (const span of line.styleSpans) {
				if ('unsupported' in span) {
					lineBroken = true;
					openUnmatched = !span.rawTag.startsWith('</');
				}
			}
			if (openAtStart || lineBroken) {
				suppressedLines.add(line);
			}
		}

		// Legend names keep their group's tint inside the header; the `legend`
		// flag keeps them from contributing to lyric-line gutter segments.
		for (const legendGroup of section.header?.legendGroups ?? []) {
			const group = resolvedGroups.get(legendGroup.styleSlot);
			if (group && legendGroup.nameRange.from < legendGroup.nameRange.to) {
				ranges.push({
					from: legendGroup.nameRange.from,
					to: legendGroup.nameRange.to,
					group,
					legend: true
				});
			}
		}

		for (const line of section.lines) {
			const linePlainGroup = suppressedLines.has(line) ? undefined : plainGroup;
			const supported = line.styleSpans
				.filter((span): span is Extract<typeof span, { slot: number }> => 'slot' in span)
				.sort((left, right) => left.from - right.from);

			// Parentheses enclosing styled content are notation, like the tag
			// characters they sit against (which color nothing): the pair marks
			// whose background vocal this is, so another voice's wash must not
			// claim it. A pair wrapping only plain text is the plain voice's own
			// aside and keeps its color, and an unmatched parenthesis is lyric
			// still being typed, not a pair. Each matched pair answers for itself.
			const neutralParens = new Set<number>();
			if (linePlainGroup && supported.length > 0) {
				const openStack: number[] = [];
				for (let offset = line.from; offset < line.to; offset += 1) {
					const character = parsed.text[offset];
					if (character === '(') {
						openStack.push(offset);
					} else if (character === ')') {
						const open = openStack.pop();
						if (
							open !== undefined &&
							supported.some((span) => span.from > open && span.to <= offset)
						) {
							neutralParens.add(open);
							neutralParens.add(offset);
						}
					}
				}
			}
			const pushPlain = (from: number, to: number): void => {
				if (!linePlainGroup) return;
				let start = from;
				for (let offset = from; offset < to; offset += 1) {
					if (neutralParens.has(offset)) {
						const trimmed = trimRange(parsed.text, start, offset);
						if (trimmed) ranges.push({ ...trimmed, group: linePlainGroup });
						start = offset + 1;
					}
				}
				const trimmed = trimRange(parsed.text, start, to);
				if (trimmed) ranges.push({ ...trimmed, group: linePlainGroup });
			};

			let cursor = line.from;
			for (const span of supported) {
				if (span.from > cursor) pushPlain(cursor, span.from);
				const group = resolvedGroups.get(span.slot);
				if (group) ranges.push({ from: span.contentFrom, to: span.contentTo, group });
				cursor = span.to;
			}
			if (cursor < line.to) pushPlain(cursor, line.to);
		}
	}

	let byPerformers = voiceGroupRangeCache.get(parsed);
	if (!byPerformers) {
		byPerformers = new WeakMap();
		voiceGroupRangeCache.set(parsed, byPerformers);
	}
	byPerformers.set(performers, ranges);
	return ranges;
}

/**
 * Order the roster by each performer's first appearance in the document
 * (legend names and styled spans alike). Performers who do not appear yet
 * keep their existing relative order after the appearing ones. The color a
 * performer carries never changes with this ordering — it is only a visual
 * distinguisher.
 */
export function orderPerformersByAppearance(
	parsed: ParsedDocument,
	performers: readonly PerformerRecord[]
): PerformerRecord[] {
	const firstSeen = new Map<string, number>();
	for (const range of resolveVoiceGroupRanges(parsed, performers)) {
		for (const id of range.group.performerIds) {
			const seen = firstSeen.get(id);
			if (seen === undefined || range.from < seen) firstSeen.set(id, range.from);
		}
	}
	return [...performers].sort((left, right) => {
		const leftSeen = firstSeen.get(left.id) ?? Number.POSITIVE_INFINITY;
		const rightSeen = firstSeen.get(right.id) ?? Number.POSITIVE_INFINITY;
		if (leftSeen !== rightSeen) return leftSeen - rightSeen;
		return performers.indexOf(left) - performers.indexOf(right);
	});
}

function trimRange(text: string, from: number, to: number): { from: number; to: number } | null {
	let start = from;
	let end = to;
	while (start < end && /\s/u.test(text[start] ?? '')) start += 1;
	while (end > start && /\s/u.test(text[end - 1] ?? '')) end -= 1;
	return end > start ? { from: start, to: end } : null;
}
