import type { HeaderPolicy, LanguageInventoryEntry } from './types.js';

export interface LanguageSourceInventoryEntry extends LanguageInventoryEntry {
	tag: string;
	policy: HeaderPolicy;
	policyNote?: string;
}

const englishPreferred =
	'The source policy prefers English section headers; the annotation vocabulary remains unreviewed.';

/** Exact untrusted language-to-annotation inventory from the multilingual source page. */
export const languageSourceInventory: readonly LanguageSourceInventoryEntry[] = [
	{ language: 'Afrikaans', tag: 'af', annotationId: 18733201, policy: 'unreviewed' },
	{ language: 'Albanian', tag: 'sq', annotationId: 13453350, policy: 'unreviewed' },
	{ language: 'Amharic', tag: 'am', annotationId: 13806554, policy: 'unreviewed' },
	{ language: 'Arabic', tag: 'ar', annotationId: 12745769, policy: 'unreviewed' },
	{ language: 'Azerbaijani', tag: 'az', annotationId: 13369698, policy: 'unreviewed' },
	{ language: 'Basque', tag: 'eu', annotationId: 28085552, policy: 'unreviewed' },
	{ language: 'Belarusian', tag: 'be', annotationId: 35204624, policy: 'unreviewed' },
	{ language: 'Bulgarian', tag: 'bg', annotationId: 19537323, policy: 'unreviewed' },
	{ language: 'Burmese', tag: 'my', annotationId: 32119119, policy: 'unreviewed' },
	{ language: 'Catalan', tag: 'ca', annotationId: 16579688, policy: 'unreviewed' },
	{ language: 'Chinese', tag: 'zh', annotationId: 13406318, policy: 'unreviewed' },
	{
		language: 'Czech',
		tag: 'cs',
		annotationId: 13806721,
		policy: 'contextual',
		policyNote: `${englishPreferred} Local alternatives may be used in context.`
	},
	{ language: 'Danish', tag: 'da', annotationId: 12816647, policy: 'unreviewed' },
	{
		language: 'Dutch',
		tag: 'nl',
		annotationId: 13336060,
		policy: 'english-preferred',
		policyNote: englishPreferred
	},
	{ language: 'English', tag: 'en', annotationId: 12744609, policy: 'localized' },
	{ language: 'Esperanto', tag: 'eo', annotationId: 39014118, policy: 'unreviewed' },
	{ language: 'Estonian', tag: 'et', annotationId: 30987956, policy: 'unreviewed' },
	{
		language: 'Finnish',
		tag: 'fi',
		annotationId: 27025142,
		policy: 'contextual',
		policyNote:
			'English headers are permitted and may be preferred; local alternatives are contextual.'
	},
	{ language: 'French', tag: 'fr', annotationId: 12745216, policy: 'unreviewed' },
	{ language: 'Galician', tag: 'gl', annotationId: 25754073, policy: 'unreviewed' },
	{
		language: 'German',
		tag: 'de',
		annotationId: 12745292,
		policy: 'contextual',
		policyNote: 'Header choice varies between rap and other genres.'
	},
	{ language: 'Greek', tag: 'el', annotationId: 31069041, policy: 'unreviewed' },
	{ language: 'Gujarati', tag: 'gu', annotationId: 13484140, policy: 'unreviewed' },
	{ language: 'Hebrew', tag: 'he', annotationId: 12766463, policy: 'unreviewed' },
	{ language: 'Hindi', tag: 'hi', annotationId: 28108929, policy: 'unreviewed' },
	{ language: 'Hungarian', tag: 'hu', annotationId: 15463822, policy: 'unreviewed' },
	{ language: 'Icelandic', tag: 'is', annotationId: 13336001, policy: 'unreviewed' },
	{
		language: 'Indonesian',
		tag: 'id',
		annotationId: 13627639,
		policy: 'english-preferred',
		policyNote: englishPreferred
	},
	{ language: 'Irish', tag: 'ga', annotationId: 15739760, policy: 'unreviewed' },
	{ language: 'Italian', tag: 'it', annotationId: 12745215, policy: 'unreviewed' },
	{
		language: 'Japanese',
		tag: 'ja',
		annotationId: 13322994,
		policy: 'english-preferred',
		policyNote: englishPreferred
	},
	{ language: 'Kazakh', tag: 'kk', annotationId: 15834411, policy: 'unreviewed' },
	{ language: 'Klingon', tag: 'tlh', annotationId: 39486993, policy: 'unreviewed' },
	{
		language: 'Korean',
		tag: 'ko',
		annotationId: 20378931,
		policy: 'contextual',
		policyNote: 'Original Korean songs and Korean translations follow different header policies.'
	},
	{ language: 'Latin', tag: 'la', annotationId: 13336285, policy: 'unreviewed' },
	{ language: 'Latvian', tag: 'lv', annotationId: 34900938, policy: 'unreviewed' },
	{ language: 'Lithuanian', tag: 'lt', annotationId: 34445219, policy: 'unreviewed' },
	{ language: 'Macedonian', tag: 'mk', annotationId: 26600045, policy: 'unreviewed' },
	{ language: 'Maori', tag: 'mi', annotationId: 18735381, policy: 'unreviewed' },
	{ language: 'Mongolian', tag: 'mn', annotationId: 32283571, policy: 'unreviewed' },
	{ language: 'Norwegian', tag: 'no', annotationId: 13453292, policy: 'localized' },
	{ language: 'Pannonian Rusyn', tag: 'rsk', annotationId: 35157957, policy: 'unreviewed' },
	{ language: 'Persian', tag: 'fa', annotationId: 16073054, policy: 'unreviewed' },
	{ language: 'Polish', tag: 'pl', annotationId: 14345856, policy: 'unreviewed' },
	{ language: 'Portuguese', tag: 'pt', annotationId: 12745694, policy: 'unreviewed' },
	{ language: 'Romani', tag: 'rom', annotationId: 35156001, policy: 'unreviewed' },
	{ language: 'Romanian', tag: 'ro', annotationId: 17239183, policy: 'unreviewed' },
	{ language: 'Romansh', tag: 'rm', annotationId: 15872416, policy: 'unreviewed' },
	{ language: 'Russian', tag: 'ru', annotationId: 12744827, policy: 'unreviewed' },
	{ language: 'Sardinian', tag: 'sc', annotationId: 26122742, policy: 'unreviewed' },
	{
		language: 'Scottish Gaelic',
		tag: 'gd',
		annotationId: 35492835,
		policy: 'unreviewed'
	},
	{
		language: 'Serbo-Croatian',
		tag: 'sh',
		annotationId: 19554324,
		policy: 'unreviewed'
	},
	{ language: 'Sinhala', tag: 'si', annotationId: 35266023, policy: 'unreviewed' },
	{
		language: 'Slovak',
		tag: 'sk',
		annotationId: 12801017,
		policy: 'contextual',
		policyNote: `${englishPreferred} Local alternatives may be used in context.`
	},
	{ language: 'Slovene', tag: 'sl', annotationId: 13068711, policy: 'unreviewed' },
	{ language: 'Spanish', tag: 'es', annotationId: 12744618, policy: 'unreviewed' },
	{ language: 'Swedish', tag: 'sv', annotationId: 12745194, policy: 'unreviewed' },
	{
		language: 'Thai',
		tag: 'th',
		annotationId: 37578624,
		policy: 'english-preferred',
		policyNote: englishPreferred
	},
	{ language: 'Turkish', tag: 'tr', annotationId: 23209389, policy: 'unreviewed' },
	{ language: 'Ukrainian', tag: 'uk', annotationId: 18727989, policy: 'unreviewed' },
	{ language: 'Uzbek', tag: 'uz', annotationId: 37593779, policy: 'unreviewed' },
	{ language: 'Vietnamese', tag: 'vi', annotationId: 15872435, policy: 'unreviewed' },
	{ language: 'Welsh', tag: 'cy', annotationId: 36124653, policy: 'unreviewed' }
];
