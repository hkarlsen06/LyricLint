/** Reviewed policy families. Unknown spans never inherit the document's default language. */
const policyLanguages = ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'] as const;
export type ProfileLanguage = (typeof policyLanguages)[number] | 'und';

export function profileLanguage(tag: string): ProfileLanguage {
	const base = tag.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
	if (base === 'nb' || base === 'nn') return 'no';
	return policyLanguages.find((language) => language === base) ?? 'und';
}
