/** Optional starting points, selected by canonical id without shortening their qualifications. */
export const essentialEntryIds: readonly string[] = [
	'guidance.section-headers.bracketed-headers',
	'guidance.spelling.elision-apostrophe',
	'guidance.ad-libs.include-every',
	'guidance.ad-libs.vocalized-sounds',
	'guidance.lines.immediate-repeat',
	'guidance.punctuation.unmarked-question',
	'guidance.censored-unknown.unknown-marker'
];

/** These qualifications live in neighboring catalog entries and must travel with the advice. */
export const essentialCompanions: Readonly<Record<string, readonly string[]>> = {
	'guidance.spelling.elision-apostrophe': ['guidance.spelling.readability-limit'],
	'guidance.ad-libs.include-every': ['guidance.ad-libs.echo-effects'],
	'guidance.punctuation.unmarked-question': ['guidance.punctuation.brand-name-marks']
};
