import { getProfileSource } from './sources.js';
import type { ProfileGuideline } from './types.js';
import type { ReferenceTopic } from '$lib/reference/topics.js';

/** Policy families share the guide's reader-facing topic taxonomy. */
export function profileGuidelineTopic(entry: ProfileGuideline): ReferenceTopic {
	if (/^MX-(?:EN|NO|DE|ES|FR|JA)/u.test(entry.id)) return 'non-english';
	if (/^MX-(?:S\d|P\d)/u.test(entry.id)) return 'section-headers';
	if (['MX-T04'].includes(entry.id)) return 'censored-unknown';
	if (['MX-T06', 'MX-T07', 'MX-F05'].includes(entry.id)) return 'ad-libs';
	if (['MX-T03', 'MX-F01'].includes(entry.id)) return 'lines';
	if (['MX-F02', 'MX-F03', 'MX-F04'].includes(entry.id)) return 'capitalization';
	if (['MX-F06', 'MX-F07', 'MX-F08'].includes(entry.id)) return 'numbers';
	if (['MX-F09', 'MX-F10', 'MX-F11', 'MX-F13'].includes(entry.id)) return 'punctuation';
	if (entry.id === 'MX-F12') return 'spelling';
	if (entry.id === 'MX-T05') return 'section-headers';
	if (entry.id === 'MX-T08' || /^MX-L/u.test(entry.id) || ['MX-W01', 'MX-W03'].includes(entry.id))
		return 'non-english';
	return 'sourcing';
}

export function profileGuidelineTitle(entry: ProfileGuideline): string {
	return profileGuidelineProse(entry.statement.split(';')[0].replace(/\.$/u, ''));
}

/** The evidence inventory uses Markdown reference locators; the reader sees their names. */
export function profileGuidelineProse(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\[[A-Z0-9-]+\]/gu, '$1')
		.replace(/\[([A-Z][A-Z0-9-]+)\]/gu, (_, id: string) => getProfileSource(id)?.pageTitle ?? id);
}
