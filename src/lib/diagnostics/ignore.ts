import type { Diagnostic, StyleSlot, TextRange } from '$lib/core/types.js';
import { unknownVoiceName } from '$lib/performers/legend-cleanup.js';
import { unknownVoiceMessage } from '$lib/rules/catalog/performer-inline-mismatch.js';
import { diagnosticKey } from './order.js';

const CONTEXT_LENGTH = 32;

/**
 * The mark an accepted occurrence carries, and the whole of what it changes.
 *
 * Suppression is one mechanism: the same store, the same matching, the same
 * Restore. What the reader was asked differs, so the key records which question
 * they answered — and it records it *after* the identity rather than inside it,
 * because a bit that moved a match would make an acceptance and an ignore two
 * different occurrences of the same finding.
 */
const ACCEPTED_MARKER = 'correct';

type IgnoreIdentity = [
	ruleId: string,
	message: string,
	text: string,
	before: string,
	after: string,
	from: number,
	accepted?: typeof ACCEPTED_MARKER
];

function identity(diagnostic: Diagnostic, text: string): IgnoreIdentity {
	return [
		diagnostic.ruleId,
		diagnostic.message,
		// `identityText`, where a rule declares one, is what the finding is about;
		// the flagged text is only where it stands. Matching demands this part
		// exact, so a finding about a voice keyed on the voice's lyrics came apart
		// on the first edit inside the tags — the context parts below rank, they
		// do not gate, which is what lets the same answer follow the finding.
		diagnostic.identityText ?? text.slice(diagnostic.from, diagnostic.to),
		text.slice(Math.max(0, diagnostic.from - CONTEXT_LENGTH), diagnostic.from),
		text.slice(diagnostic.to, diagnostic.to + CONTEXT_LENGTH),
		diagnostic.from
	];
}

/**
 * Whether answering this finding's own control accepts the text rather than
 * setting the finding aside. Two shapes of the same answer: the affirmative
 * that leads the row (`It's correct`) and the one that stands in the ignore
 * slot — for a lyric nobody could make out (`It really is unintelligible`),
 * and for a styled voice nobody can name yet (`The performer is unknown`).
 *
 * A custom header is the whole of its rule, an unresolved marker the whole of
 * its own, and an unnamed styled voice the whole of its own again, so all
 * three are recognized by id; an ad-lib is one of the two findings its rule
 * reports, which is why the fourth is carried on the diagnostic. One
 * predicate, because the button's wording, the key's kind and the toast are
 * three surfaces answering the same question.
 */
export function acceptsDiagnosticAsCorrect(diagnostic: Diagnostic): boolean {
	return (
		diagnostic.ruleId === 'section.header-unrecognized' ||
		diagnostic.ruleId === 'unknown.unresolved' ||
		diagnostic.ruleId === 'performer.inline-mismatch' ||
		diagnostic.presumedCorrect === true
	);
}

function isString(part: unknown): part is string {
	return typeof part === 'string';
}

function isIgnoreIdentity(value: unknown): value is IgnoreIdentity {
	return (
		Array.isArray(value) &&
		// Six is every key written before acceptances were told apart, and it
		// reads as an ordinary ignore. A seventh part this function does not
		// recognize is not a key it can vouch for.
		(value.length === 6 || (value.length === 7 && value[6] === ACCEPTED_MARKER)) &&
		value.slice(0, 5).every(isString) &&
		typeof value[5] === 'number'
	);
}

function parse(key: string): IgnoreIdentity | undefined {
	try {
		const value: unknown = JSON.parse(key);
		if (isIgnoreIdentity(value)) {
			return value;
		}
	} catch {
		// Old rule-level session keys are deliberately not occurrence ignores.
	}
}

/**
 * The acceptance the picker's unknown-voice chip writes at the moment it acts.
 *
 * Pressing that chip *is* the answer `The performer is unknown`, so the card
 * that would ask it again must find the question already answered. The key is
 * written against the pre-edit document — the finding it will match does not
 * exist yet — which only works because matching gates on the first three
 * parts, all knowable here, while the context and offset merely rank: they are
 * taken from the selection being wrapped, which is where the finding will
 * land. The marker is hardcoded because this rule is one of the ids
 * `acceptsDiagnosticAsCorrect` names; a rule that stopped accepting would
 * strand this key as a seventh part `parse` refuses.
 */
export function unknownVoiceAcceptanceKey(
	text: string,
	range: TextRange,
	styleSlot: StyleSlot
): string {
	const parts: IgnoreIdentity = [
		'performer.inline-mismatch',
		unknownVoiceMessage,
		unknownVoiceName(styleSlot),
		text.slice(Math.max(0, range.from - CONTEXT_LENGTH), range.from),
		text.slice(range.to, range.to + CONTEXT_LENGTH),
		range.from,
		ACCEPTED_MARKER
	];
	return JSON.stringify(parts);
}

export function diagnosticIgnoreKey(diagnostic: Diagnostic, text: string): string {
	const parts = identity(diagnostic, text);
	// Read here rather than passed in, so a caller cannot key an acceptance as an
	// ignore while its own button says otherwise.
	return JSON.stringify(
		acceptsDiagnosticAsCorrect(diagnostic) ? [...parts, ACCEPTED_MARKER] : parts
	);
}

/**
 * Whether this occurrence was accepted as correct rather than ignored.
 *
 * Presentation only: nothing downstream of the key matches, prunes or restores
 * differently for it.
 */
export function ignoredDiagnosticAccepted(key: string): boolean {
	return parse(key)?.[6] === ACCEPTED_MARKER;
}

export function ignoredDiagnosticRuleId(key: string): string {
	return parse(key)?.[0] ?? key;
}

/**
 * The flagged text an ignore was keyed on, where the key still carries one.
 *
 * An ignore is per occurrence, so a rule set aside twice lists twice — and the
 * rule's name is the same on both rows. The text is already in the key; it is
 * the only thing that tells the two apart. An old rule-level key has none, and
 * a whitespace finding's is not worth printing, so both answer nothing.
 */
export function ignoredDiagnosticText(key: string): string | undefined {
	const text = parse(key)?.[2].trim();
	return text ? text : undefined;
}

function sharedEdge(left: string, right: string, fromEnd = false): number {
	let count = 0;
	while (
		count < left.length &&
		count < right.length &&
		left[fromEnd ? left.length - count - 1 : count] ===
			right[fromEnd ? right.length - count - 1 : count]
	) {
		count += 1;
	}
	return count;
}

function isUnknownVoiceIdentity(value: string): boolean {
	return (
		value === 'Unknown italic voice' ||
		value === 'Unknown bold voice' ||
		value === 'Unknown bold italic voice'
	);
}

/**
 * Slot styling is presentation, not an unknown voice's identity. A performer
 * assignment may move that voice down to keep newly named legend groups in
 * canonical order; the acceptance follows the same occurrence by context.
 */
function identityPartMatches(
	saved: IgnoreIdentity,
	current: IgnoreIdentity,
	partIndex: number
): boolean {
	if (saved[partIndex] === current[partIndex]) return true;
	return (
		partIndex === 2 &&
		saved[0] === 'performer.inline-mismatch' &&
		current[0] === 'performer.inline-mismatch' &&
		isUnknownVoiceIdentity(saved[2]) &&
		isUnknownVoiceIdentity(current[2])
	);
}

/** Match each saved occurrence once, retaining it when unrelated text shifts its offsets. */
export function matchIgnoredDiagnostics(
	diagnostics: readonly Diagnostic[],
	text: string,
	ignored: readonly string[]
): Map<string, string> {
	const remaining = [...diagnostics];
	const result = new Map<string, string>();

	for (const key of ignored) {
		const saved = parse(key);
		if (!saved) continue;
		let best = -1;
		let bestContext = -1;
		let distance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < remaining.length; index += 1) {
			const current = identity(remaining[index]!, text);
			if (
				saved.slice(0, 3).some((_, partIndex) => !identityPartMatches(saved, current, partIndex))
			) {
				continue;
			}
			const context = sharedEdge(saved[3], current[3], true) + sharedEdge(saved[4], current[4]);
			const candidateDistance = Math.abs(saved[5] - current[5]);
			if (context > bestContext || (context === bestContext && candidateDistance < distance)) {
				best = index;
				bestContext = context;
				distance = candidateDistance;
			}
		}
		if (best >= 0) result.set(key, diagnosticKey(remaining.splice(best, 1)[0]!));
	}

	return result;
}
