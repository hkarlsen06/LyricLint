import { error } from '@sveltejs/kit';
import { profileGuidelines } from '$lib/profiles/coverage.js';
import { getProfileSource } from '$lib/profiles/sources.js';
import {
	profileGuidelineTopic,
	profileGuidelineTitle,
	profileGuidelineProse
} from '$lib/profiles/reference.server.js';
import { referenceTopics } from '$lib/reference/topics.js';
import { ruleReferences } from '$lib/rules/reference.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

export const entries: EntryGenerator = () => referenceTopics.map((topic) => ({ topic: topic.id }));
export const load: PageServerLoad = ({ params }) => {
	const topic = referenceTopics.find((candidate) => candidate.id === params.topic);
	if (!topic) error(404, 'This Musixmatch topic does not exist.');
	const rules = ruleReferences('musixmatch');
	const entries = profileGuidelines
		.filter((entry) => profileGuidelineTopic(entry) === topic.id)
		.map((entry) => ({
			...entry,
			statement: profileGuidelineProse(entry.statement),
			limit: profileGuidelineProse(entry.limit),
			topic: profileGuidelineProse(entry.topic),
			title: profileGuidelineTitle(entry),
			sources: entry.sourceIds.map((id) => getProfileSource(id)!),
			checks: entry.ruleIds.map((id) => {
				const rule = rules.find((candidate) => candidate.id === id)!;
				return {
					title: rule.title,
					slug: rule.slug,
					message: rule.message,
					explanation: rule.explanation,
					invalid: rule.invalid,
					valid: rule.valid,
					language: rule.language,
					fixLabel: rule.fix?.label
				};
			})
		}));
	return {
		topic,
		entries,
		entryCount: entries.length,
		checkCount: new Set(entries.flatMap((entry) => entry.checks.map((check) => check.slug))).size
	};
};
