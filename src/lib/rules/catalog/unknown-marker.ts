import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * The forms a Genius reader already reads as "unknown lyric": the parenthesized
 * one, and a bracketed one that has simply gained a question mark too many.
 */
const recognizedUnknownMarker = /\(\s*\?+\s*\)|\[\s*\?{2,}\s*\]/gu;

export const unknownMarkerRule: RuleDefinition = {
	id: 'unknown.marker',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-UNKNOWN'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, recognizedUnknownMarker).map((match) =>
					diagnostic(
						this,
						match,
						'Use [?] for an incomprehensible lyric.',
						'This is an exact recognized unknown marker, so replacing only the marker is mechanically safe.',
						[replacementFix(context, 'safe', 'Replace with [?]', match, '[?]')]
					)
				)
			)
		);
	}
};

/**
 * A bare run of question marks standing where words would stand.
 *
 * `unknown.marker` deliberately does not claim this, and that is a reviewed
 * decision rather than an oversight — `[Verse]\nI heard ???` is its `ambiguous`
 * policy case, which `catalog-policy.test.ts` pins at zero findings. The reason
 * is in that rule's own explanation: its one-press fix is justified by the
 * marker being an *exact recognized* form, and `???` is a transcriber's
 * improvisation rather than a form anybody recognizes. Widening the safe rule to
 * swallow it would have made that justification false for every match it has.
 *
 * So this is its own rule at its own tier: a suggestion with a `preview` fix,
 * which is what every judgment call in this catalog uses. The reviewed decision
 * survives intact — nothing rewrites `???` mechanically — and the transcriber
 * who typed it is still told what the marker actually is, which is the whole
 * point of having the rule at all.
 *
 * **The run has to be a token of its own**, and that is what separates a
 * placeholder from punctuation. A placeholder stands where the words the
 * transcriber could not make out would have stood; emphatic question marks
 * attach to the word they punctuate, so `Are you serious???` is left alone. That
 * is also why `censored.mask`'s standalone-run precedent does not carry over: a
 * lone `***` is ambiguous about *what it is* — a mask, a divider, a redaction —
 * while a lone `???` has exactly one thing it can be steering toward, and `[?]`
 * is it.
 */
const improvisedUnknownMarker = /(?<![\p{L}\p{M}\p{N}_?])\?{2,}(?![\p{L}\p{M}\p{N}_?])/gu;

export const unknownImprovisedMarkerRule: RuleDefinition = {
	id: 'unknown.improvised-marker',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-UNKNOWN'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				// What the recognized-marker rule has already taken. `( ?? )` and
				// `[???]` are its findings, and a second diagnostic over the same
				// characters would be two cards arguing about one span.
				const claimed = matchesOutsideMarkup(line, recognizedUnknownMarker);
				return matchesOutsideMarkup(line, improvisedUnknownMarker)
					.filter(
						(match) => !claimed.some((marker) => marker.from <= match.from && marker.to >= match.to)
					)
					.map((match) =>
						diagnostic(
							this,
							match,
							'Genius marks an unclear lyric with [?], not «???».',
							"A bare run of question marks is the transcriber's own placeholder rather than a marker anyone recognizes, and the same characters can be deliberate punctuation — so the replacement is offered for review instead of applied mechanically.",
							[replacementFix(context, 'preview', 'Replace with [?]', match, '[?]')]
						)
					);
			})
		);
	}
};

/**
 * One card per document, not one per marker.
 *
 * Every `[?]` in a song is the same request — go back and listen again — and a
 * transcription with three of them was three identical cards saying it, which
 * is the repetition-that-never-varies the severity word was dropped for. The
 * count travels in the message instead, so the panel still says how much
 * listening is left, and the card anchors on the first marker because that is
 * where the work starts.
 *
 * Coalescing is also what makes `It really is unintelligible` mean what it
 * says: pressed once, it answers for the whole 'scribe as it stands, and a
 * *new* `[?]` does not re-ask it. The card carries the count, but the ignore
 * identity treats every count as the same occurrence — a fresh unknown is
 * still the same answered question, not a fresh one.
 *
 * `document` tier, for `capitalization.title-case`'s reason: a marker typed on
 * line 52 rewrites the count on a card anchored at line 3, which is a change
 * landing on a line the caret is not on and the `line` tier cannot help with.
 */
export const unknownUnresolvedRule: RuleDefinition = {
	id: 'unknown.unresolved',
	version: 2,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-UNKNOWN'],
	settlesOn: 'document',
	check(document) {
		const markers = document.sections.flatMap((section) =>
			section.lines.flatMap((line) => matchesOutsideMarkup(line, /\[\?\]/gu))
		);
		const first = markers[0];
		if (!first) return [];
		return [
			diagnostic(
				this,
				first,
				markers.length === 1
					? 'Try to identify the lyric marked [?].'
					: `Try to identify the ${markers.length} lyrics marked [?].`,
				'Aim to transcribe all audible lyrics. Use [?] only when careful listening still cannot determine what is being sung.'
			)
		];
	}
};
