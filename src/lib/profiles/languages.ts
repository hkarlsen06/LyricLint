import { getLanguagePack } from '#lib/languages/registry.js';
import type { ProfileId } from './types.js';

/** Reviewed policy families. Unknown spans never inherit the document's default language. */
const policyLanguages = ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'] as const;
export type ProfileLanguage = (typeof policyLanguages)[number] | 'und';

export function profileLanguage(tag: string): ProfileLanguage {
	const base = tag.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
	if (base === 'nb' || base === 'nn') return 'no';
	return policyLanguages.find((language) => language === base) ?? 'und';
}

/**
 * Whether `profile` checks `tag` with rules reviewed for that language, beyond the
 * language-independent ones: the same families the rule engine runs separate passes for.
 */
export function hasReviewedLanguageRules(tag: string, profile: ProfileId): boolean {
	return profile === 'musixmatch' ? profileLanguage(tag) !== 'und' : getLanguagePack(tag).reviewed;
}
