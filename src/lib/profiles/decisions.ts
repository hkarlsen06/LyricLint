import { profileLanguage } from './languages.js';
import { numberWords } from '$lib/rules/catalog/numbers-spell-out.js';
import type { ProfileId } from './types.js';

export type PolicyDecision<T> =
	| { ok: true; value: T; sourceIds: readonly string[] }
	| {
			ok: false;
			reason:
				'invalid-fact' | 'needs-context' | 'policy-gap' | 'source-conflict' | 'not-applicable';
			message: string;
	  };

function review<T>(
	reason: Extract<PolicyDecision<T>, { ok: false }>['reason'],
	message: string
): PolicyDecision<T> {
	return { ok: false, reason, message };
}

/** Exact arithmetic identity, with no floating-point conversion or identifier normalization. */
export function parseQuantityInteger(value: string): string | undefined {
	if (!/^(?:0|[1-9][0-9]{0,999})$/u.test(value)) return undefined;
	return value;
}

export interface QuantityFacts {
	profile: ProfileId;
	language: string;
	/** Exact unsigned cardinal value; identifiers and leading-zero strings are a different role. */
	value: string;
	usage:
		| 'ordinary-cardinal'
		| 'fixed-expression'
		| 'name-or-identifier'
		| 'date-or-time'
		| 'phone-or-decade'
		| 'unknown';
	pronunciation: 'whole-quantity' | 'individual-digits' | 'unknown';
	/** Exact word form confirmed against the recording; no language morphology is inferred. */
	spokenForm?: string;
	/** Exact digit form chosen by the transcriber, especially for non-Latin digit sets. */
	digitForm?: string;
}

/** Accept only the digit sets used in the reviewed-language editor, preserving the supplied form. */
function decimalValue(text: string): string | undefined {
	const zeros = [0x30, 0x660, 0x6f0, 0xff10];
	let zero: number | undefined;
	let ascii = '';
	for (const character of text) {
		const code = character.codePointAt(0)!;
		const family = zeros.find((candidate) => candidate <= code && code <= candidate + 9);
		if (family === undefined || (zero !== undefined && family !== zero)) return undefined;
		zero = family;
		ascii += String(code - family);
	}
	return parseQuantityInteger(ascii);
}

/**
 * Select a representation only after semantic facts are supplied. This does not identify quantities
 * in lyric text. The conversion model must retain both authored forms and invalidate stale facts.
 */
export function decideQuantityRepresentation(facts: QuantityFacts): PolicyDecision<string> {
	const value = parseQuantityInteger(facts.value);
	if (value === undefined)
		return review(
			'invalid-fact',
			'Supply an exact unsigned integer without leading zeros, grouping marks, signs or rounding.'
		);
	if (facts.usage !== 'ordinary-cardinal')
		return review(
			'needs-context',
			'This operation applies only to an ordinary cardinal quantity. Names, identifiers, fixed expressions, dates, times, phones and decades keep their own policies.'
		);
	if (facts.pronunciation !== 'whole-quantity')
		return review(
			'needs-context',
			'Confirm that the number is sung as a whole quantity, rather than separate digits or an unknown reading.'
		);
	const language = profileLanguage(facts.language);
	if (!['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'].includes(language))
		return review('policy-gap', 'No reviewed quantity policy exists for this selected language.');
	if (facts.profile === 'musixmatch' && (language === 'ar' || language === 'ko'))
		return review(
			'policy-gap',
			'Dedicated Arabic or Korean numeric-policy evidence is incomplete. Preserve the authored form or record an explicit target-form choice without claiming automatic policy verification.'
		);
	const aboveTen = value.length > 2 || (value.length === 2 && value > '10');
	if (facts.profile === 'musixmatch' && aboveTen && language === 'es')
		return review(
			'needs-context',
			'The Spanish FAQ permits context-dependent word forms above ten without a complete exception predicate. Choose the target form explicitly after reviewing the phrase.'
		);
	if (facts.profile === 'musixmatch' && language === 'ja')
		return review(
			'needs-context',
			'Japanese reading, counters and audience-dependent kanji choices need an explicit target form. A numeric value alone cannot establish those writing choices.'
		);
	if (facts.digitForm !== undefined && decimalValue(facts.digitForm) !== value)
		return review(
			'invalid-fact',
			'The selected digit form must represent the exact quantity with one digit set and without leading zeros.'
		);
	if (
		facts.spokenForm !== undefined &&
		(!facts.spokenForm.trim() ||
			facts.spokenForm.length > 2000 ||
			/[\r\n<>\p{Nd}]/u.test(facts.spokenForm))
	)
		return review(
			'invalid-fact',
			'Supply a single, exact sung word form without digits, line breaks or markup.'
		);
	const sourceIds =
		facts.profile === 'genius'
			? ['G-NUMBERS']
			: language === 'fr'
				? ['MXM-MAIN', 'MXM-FR-Q']
				: ['MXM-MAIN'];
	if (facts.profile === 'musixmatch' && aboveTen) {
		return { ok: true, value: facts.digitForm ?? value, sourceIds };
	}
	if (facts.spokenForm) return { ok: true, value: facts.spokenForm, sourceIds };
	if (language === 'en' && !aboveTen)
		return { ok: true, value: numberWords[Number(value)], sourceIds };
	return review(
		'needs-context',
		'Confirm the exact word form as sung. LyricLint does not invent grammatical gender, case, dialect, counters or pronunciation from a number.'
	);
}

export interface InstrumentalIntervalFacts {
	language: string;
	recordingId: string;
	currentRecordingId: string;
	/** Authored boundaries in integer milliseconds, not inferred from two lyric-start anchors. */
	startMs: number;
	endMs: number;
	recordingDurationMs: number;
	lyricalContent: 'none-confirmed' | 'present' | 'uncertain';
	placement: 'between-tagged-sections' | 'within-section' | 'track-edge' | 'unknown';
	beforeSectionId: string;
	afterSectionId: string;
}

export interface InstrumentalRepresentation {
	text: '#INSTRUMENTAL';
	requiresBlankAfter: true;
	startMs: number;
	endMs: number;
}

/** MX-S10–12: validates supplied recording facts; it never detects silence or inserts a marker. */
export function decideInstrumentalRepresentation(
	facts: InstrumentalIntervalFacts
): PolicyDecision<InstrumentalRepresentation> {
	if (!facts.recordingId || facts.recordingId !== facts.currentRecordingId)
		return review('invalid-fact', 'The interval must describe the currently selected recording.');
	if (
		![facts.startMs, facts.endMs, facts.recordingDurationMs].every(
			(value) => Number.isSafeInteger(value) && value >= 0
		) ||
		facts.startMs >= facts.endMs ||
		facts.endMs > facts.recordingDurationMs
	)
		return review(
			'invalid-fact',
			'Supply ordered, finite recording boundaries in whole milliseconds.'
		);
	if (facts.endMs - facts.startMs <= 15_000)
		return review(
			'not-applicable',
			'An interior Musixmatch instrumental marker requires more than fifteen consecutive seconds without qualifying lyrics.'
		);
	if (facts.lyricalContent !== 'none-confirmed')
		return review(
			'needs-context',
			'Confirm that the interval has no qualifying lyrical content. Vocals, vocables or joik cannot be classified from text or silence estimates.'
		);
	if (
		facts.placement !== 'between-tagged-sections' ||
		!facts.beforeSectionId ||
		!facts.afterSectionId ||
		facts.beforeSectionId === facts.afterSectionId ||
		facts.startMs === 0 ||
		facts.endMs === facts.recordingDurationMs
	)
		return review(
			'not-applicable',
			'The interval must sit between two confirmed distinct tagged sections, inside the recording. Whole-track instrumental status and gaps within one section are separate.'
		);
	if (profileLanguage(facts.language) === 'ja')
		return review(
			'source-conflict',
			'The main guideline requires a blank after the marker while the Japanese FAQ says it is not needed. Preserve the authored layout until this source scope is resolved.'
		);
	return {
		ok: true,
		value: {
			text: '#INSTRUMENTAL',
			requiresBlankAfter: true,
			startMs: facts.startMs,
			endMs: facts.endMs
		},
		sourceIds: ['MXM-MAIN']
	};
}
