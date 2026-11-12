import { profileGuidelines } from '#lib/profiles/coverage.js';
import { getProfileSource } from '#lib/profiles/sources.js';
import { profileGuidelineTitle, profileGuidelineProse } from '#lib/profiles/reference.server.js';
import { ruleReferences } from '#lib/rules/reference.js';

export function musixmatchReaderData() {
	const rules = ruleReferences('musixmatch');
	const entries = profileGuidelines.map((entry) => ({
		...entry,
		statement: profileGuidelineProse(entry.statement),
		limit: profileGuidelineProse(entry.limit),
		topic: profileGuidelineProse(entry.topic),
		title: profileGuidelineTitle(entry),
		sources: entry.sourceIds.map((id) => getProfileSource(id)!),
		checks: entry.ruleIds.flatMap((id) => rules.filter((rule) => rule.id === id))
	}));
	return { entries, checks: rules };
}
