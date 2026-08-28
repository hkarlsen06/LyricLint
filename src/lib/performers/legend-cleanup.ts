import type {
	ParsedDocument,
	Section,
	StyleSlot,
	SupportedStyleSpan,
	TextEdit
} from '$lib/core/types.js';

function supportedSpans(section: Section): { line: number; spans: SupportedStyleSpan[] }[] {
	return section.lines.map((line, index) => ({
		line: index,
		spans: line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span))
	}));
}

/**
 * A section is only eligible for legend pruning when every part of it parses
 * cleanly: a closed header with a legend, no malformed or unsupported markup
 * anywhere in the body, and at least one non-blank lyric line. A header whose
 * body is still empty is never pruned — the user has likely just typed the
 * legend and not written the lyrics yet.
 */
function sectionIsSafeToPrune(section: Section): boolean {
	const header = section.header;
	if (!header || !header.closed || !header.legendRange || header.legendGroups.length === 0) {
		return false;
	}
	if (header.legendGroups.some((group) => !group.markupSupported)) {
		return false;
	}
	if (section.lines.some((line) => line.styleSpans.some((span) => 'unsupported' in span))) {
		return false;
	}
	return section.lines.some((line) => line.text.trim().length > 0);
}

/**
 * Style slots that still occur in the section body. Slots 2–4 are used when
 * any supported inline span carries them; slot 1 (plain) is used when any
 * lyric line contains non-whitespace text outside every styled span.
 */
export function usedStyleSlots(section: Section): Set<StyleSlot> {
	const used = new Set<StyleSlot>();
	for (const { line, spans } of supportedSpans(section)) {
		const lyricLine = section.lines[line];
		if (!lyricLine) {
			continue;
		}
		let masked = lyricLine.text;
		for (const span of spans) {
			used.add(span.slot);
			const localFrom = span.from - lyricLine.from;
			const localTo = span.to - lyricLine.from;
			masked = masked.slice(0, localFrom) + ' '.repeat(localTo - localFrom) + masked.slice(localTo);
		}
		if (masked.trim().length > 0) {
			used.add(1);
		}
	}
	return used;
}

/**
 * Styled slots (2–4) the section body uses that its header's legend does not
 * name, each with the first supported span that carries it, in slot order.
 *
 * This is the workbench's definition of an *unknown voice*: styling in the
 * lyrics is a claim that a distinct voice sings there, and a slot the legend
 * has no group for is a voice nobody has identified yet. One owner, consumed
 * by `performer.inline-mismatch` (one finding per unaccounted slot) and by the
 * picker's unknown-voice offers (`unknownVoiceOffers` in `transform.ts`) — a
 * second derivation would let the two surfaces disagree about which voices
 * are unknown.
 */
export function unaccountedStyledSlots(
	section: Section
): { slot: StyleSlot; firstSpan: SupportedStyleSpan }[] {
	const legendSlots = new Set((section.header?.legendGroups ?? []).map((group) => group.styleSlot));
	const found = new Map<StyleSlot, SupportedStyleSpan>();
	for (const line of section.lines) {
		for (const span of line.styleSpans) {
			if ('unsupported' in span || span.slot === 1 || legendSlots.has(span.slot)) {
				continue;
			}
			if (!found.has(span.slot)) {
				found.set(span.slot, span);
			}
		}
	}
	return [...found.entries()]
		.sort(([left], [right]) => left - right)
		.map(([slot, firstSpan]) => ({ slot, firstSpan }));
}

/**
 * What the workbench calls an unknown voice when it has to name one in prose.
 *
 * One owner beside the predicate that finds them: the picker's chips say it to
 * the screen reader, `performer.inline-mismatch` keys its findings' ignores on
 * it, and the acceptance the picker writes at mint time has to produce the
 * very string the rule will key — two wordings would quietly unmatch them.
 */
export function unknownVoiceName(slot: StyleSlot): string {
	return slot === 4
		? 'Unknown bold italic voice'
		: slot === 3
			? 'Unknown bold voice'
			: 'Unknown italic voice';
}

/**
 * Compute the edits that drop legend slots no longer used by a section body.
 *
 * The rule implemented: for every cleanly parsed section whose body has any
 * non-blank content, a legend group is kept only while its style slot still
 * occurs in the body (plain text for slot 1, inline spans for slots 2–4).
 * Kept groups preserve their exact raw text; a kept group that follows a
 * dropped one keeps its own original separator. When every group is dropped
 * the whole legend collapses to the bare header (the `: …` part is removed).
 * Sections containing malformed or unsupported markup, unclosed headers, or a
 * still-empty body are never touched. The function is a fixpoint: applying
 * its edits and recomputing yields no further edits, so callers can safely
 * run it on every document revision without looping.
 */
export function cleanupLegendSlots(document: ParsedDocument): TextEdit[] {
	const edits: TextEdit[] = [];

	for (const section of document.sections) {
		if (!sectionIsSafeToPrune(section)) {
			continue;
		}
		const header = section.header;
		const legendRange = header?.legendRange;
		if (!header || !legendRange) {
			continue;
		}

		const used = usedStyleSlots(section);
		const kept = header.legendGroups.filter((group) => used.has(group.styleSlot));
		if (kept.length === header.legendGroups.length) {
			continue;
		}

		if (kept.length === 0) {
			const colon = document.text.lastIndexOf(':', legendRange.from);
			if (colon < header.from) {
				continue;
			}
			edits.push({ from: colon, to: legendRange.to, insert: '' });
			continue;
		}

		const first = kept[0];
		if (!first) {
			continue;
		}
		let insert = first.raw;
		for (let index = 1; index < kept.length; index += 1) {
			const group = kept[index];
			if (!group) {
				continue;
			}
			insert += `${group.separatorBefore ?? ', '}${group.raw}`;
		}
		if (insert === document.text.slice(legendRange.from, legendRange.to)) {
			continue;
		}
		edits.push({ from: legendRange.from, to: legendRange.to, insert });
	}

	return edits;
}
