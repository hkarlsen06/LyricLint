export type ProfileId = 'genius' | 'musixmatch';

export const profileLabels = {
	genius: 'Genius',
	musixmatch: 'Musixmatch'
} as const satisfies Readonly<Record<ProfileId, string>>;

export interface ProfileGuideline {
	id: string;
	topic: string;
	statement: string;
	languages: readonly string[];
	sourceIds: readonly string[];
	handling: 'check' | 'metadata' | 'review' | 'workflow' | 'source-conflict' | 'advisory';
	ruleIds: readonly string[];
	/** Precisely what the check cannot determine or what explicit evidence is required. */
	limit: string;
}
