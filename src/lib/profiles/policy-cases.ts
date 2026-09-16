import type { RulePolicyCase } from '$lib/rules/catalog/policy-cases.js';

/** Invented examples. Manual-review cases demonstrate a trigger, not a proven error. */
export const musixmatchPolicyCases: readonly RulePolicyCase[] = [
	{
		id: 'mxm.transcription.labels',
		title: 'A label in the lyric text',
		invalid: '[Verse]\nWe return',
		valid: 'We return',
		ambiguous: '[?]\nWe return'
	},
	{
		id: 'mxm.transcription.repeat-placeholder',
		title: 'A repeat count without the lyrics',
		invalid: 'Chorus x2',
		valid: 'We return\nWe return',
		ambiguous: 'We sing x and y'
	},
	{
		id: 'mxm.transcription.censor-mask',
		title: 'A censor mask without audible letters',
		invalid: 'I hear **** tonight',
		valid: 'I hear you tonight',
		ambiguous: 'I hear a cut-'
	},
	{
		id: 'mxm.transcription.sound-description',
		title: 'An unconfirmed sound description',
		invalid: '*Door closes*',
		valid: 'The door closes',
		ambiguous: 'Bang, bang'
	},
	{
		id: 'mxm.transcription.unknown',
		title: 'A word still needing transcription',
		invalid: 'We hear [?] tonight',
		valid: 'We hear rain tonight',
		ambiguous: 'Do we hear rain?'
	},
	{
		id: 'mxm.format.stanza-length',
		title: 'More than ten lines in a lyric block',
		invalid:
			'Here we sing\nHere we stand\nHere we turn\nHere we rest\nHere we dream\nHere we wait\nHere we dance\nHere we stay\nHere we walk\nHere we rise\nHere we return',
		valid: 'Here we sing\nHere we stand\n\nHere we turn',
		ambiguous: 'Here we sing'
	},
	{
		id: 'mxm.format.line-initial',
		title: 'A lowercase line beginning',
		invalid: 'we return',
		valid: 'We return',
		ambiguous: 'iPhone rings'
	},
	{
		id: 'mxm.format.sentence-case',
		title: 'A lowercase sentence beginning',
		invalid: 'We return? again we sing',
		valid: 'We return? Again we sing',
		ambiguous: 'We return? iPhone rings'
	},
	{
		id: 'mxm.format.expressive-case',
		title: 'Expressive capitals needing review',
		invalid: 'WE RETURN AGAIN',
		valid: 'We return again',
		ambiguous: 'NASA calls'
	},
	{
		id: 'mxm.format.parenthetical-case',
		title: 'Capitalized backing vocals',
		invalid: 'We return (Again)',
		valid: 'We return (again)',
		ambiguous: 'We return (I know)'
	},
	{
		id: 'mxm.punctuation.line-ending',
		title: 'Terminal punctuation needing review',
		invalid: 'We return.',
		valid: 'We return',
		ambiguous: 'We visit the U.S.A.'
	},
	{
		id: 'mxm.punctuation.repeated-marks',
		title: 'Repeated expressive punctuation',
		invalid: 'We return!!!',
		valid: 'We return!',
		ambiguous: 'Do we return?'
	},
	{
		id: 'mxm.punctuation.interruption',
		title: 'An unconfirmed interruption',
		invalid: 'If we could—',
		valid: 'If we could return',
		ambiguous: 'We re-return'
	},
	{
		id: 'mxm.numbers.context',
		title: 'A number without established context',
		invalid: "At 6 o'clock",
		valid: 'At dawn',
		ambiguous: 'The Seventh Door'
	},
	{
		id: 'mxm.spelling.standardized',
		title: 'A contextual slang spelling',
		invalid: 'Imma return',
		valid: "I'ma return",
		ambiguous: 'Cause we return'
	},
	{
		id: 'mxm.punctuation.direct-speech',
		title: 'A quotation with unconfirmed meaning',
		language: 'es',
		invalid: 'Dije, "Vuelve"',
		valid: 'Dije que vuelve',
		ambiguous: 'Su álbum se llama "Vuelve"'
	},
	{
		id: 'mxm.structure.instrumental',
		title: 'An instrumental interval needing review',
		invalid: 'We sing\n\n#INSTRUMENTAL\n\nWe return',
		valid: 'We sing\n\nWe return',
		ambiguous: 'A quiet night'
	},
	{
		id: 'mxm.vocals.spanish-placement',
		title: 'Spanish backing-vocal placement',
		language: 'es',
		invalid: '(Vuelve aquí)',
		valid: 'Vuelve (aquí)',
		ambiguous: 'Vuelve aquí'
	},
	{
		id: 'mxm.spelling.spanish-acronym',
		title: 'A possible Spanish acronym',
		language: 'es',
		invalid: 'Canto U.S.A.',
		valid: 'Canto USA',
		ambiguous: 'Canto una letra'
	},
	{
		id: 'mxm.spelling.spanish-accents',
		title: 'A source-specific Spanish accent',
		language: 'es',
		invalid: 'Sólo canto aquí',
		valid: 'Solo canto aquí',
		ambiguous: 'Qué alegría'
	},
	{
		id: 'mxm.format.line-length',
		title: 'A long Spanish lyric line',
		language: 'es',
		invalid: 'Volvemos al camino donde cantan los recuerdos y nos esperan las voces del viento',
		valid: 'Volvemos al camino\nDonde nos esperan las voces del viento',
		ambiguous: 'Volvemos aquí'
	},
	{
		id: 'mxm.punctuation.french-marks',
		title: 'Restricted French punctuation',
		language: 'fr',
		invalid: 'Reviens!',
		valid: 'Reviens',
		ambiguous: 'Tu reviens?'
	},
	{
		id: 'mxm.punctuation.french-question-space',
		title: 'A space before a French question mark',
		language: 'fr',
		invalid: 'Tu reviens ?',
		valid: 'Tu reviens?',
		ambiguous: 'Tu reviens'
	},
	{
		id: 'mxm.spelling.french-elision',
		title: 'An apostrophe in the French y a form',
		language: 'fr',
		invalid: "Y'a du vent",
		valid: 'Y a du vent',
		ambiguous: 'Il y a du vent'
	},
	{
		id: 'mxm.punctuation.japanese-width',
		title: 'A Japanese punctuation width mismatch',
		language: 'ja',
		invalid: '帰る?',
		valid: '帰る？',
		ambiguous: '🎵?'
	},
	{
		id: 'mxm.policy.language-coverage',
		title: 'Language-specific evidence still missing',
		language: 'ar',
		invalid: 'نعود إلى البيت',
		valid: '',
		ambiguous: ''
	}
];
