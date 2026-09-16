import { profileGuidelines } from './coverage.js';
import { getProfileSource } from './sources.js';
import { profileGuidelineTopic, profileGuidelineTitle } from './reference-topics.js';
export {
	profileGuidelineTopic,
	profileGuidelineTitle,
	profileGuidelineProse
} from './reference-topics.js';
import { ruleReferences } from '$lib/rules/reference.js';
import { referenceTopics, type ReferenceTopic } from '$lib/reference/topics.js';
import type { ReferenceDocument } from '$lib/reference/search.js';

export function profileRuleTopic(id: string): ReferenceTopic {
	const entry = profileGuidelines.find((item) => item.ruleIds.includes(id));
	return entry ? profileGuidelineTopic(entry) : 'non-english';
}

export function musixmatchReferenceCorpus(): ReferenceDocument[] {
	const topicTitle = (id: ReferenceTopic) =>
		referenceTopics.find((topic) => topic.id === id)!.title;
	return [
		...profileGuidelines.map((entry): ReferenceDocument => {
			const topic = profileGuidelineTopic(entry);
			return {
				id: entry.id,
				kind: 'guideline',
				topic,
				topicTitle: topicTitle(topic),
				title: profileGuidelineTitle(entry),
				href: `/guidelines/musixmatch/${topic}/#${entry.id.toLowerCase()}`,
				summary: entry.statement,
				passages: [
					entry.statement,
					entry.limit,
					entry.topic,
					entry.handling,
					...entry.languages,
					...entry.sourceIds.flatMap((id) => {
						const source = getProfileSource(id);
						return source ? [source.pageTitle, source.sectionTitle] : [];
					})
				],
				aliases: ['Musixmatch', 'MXM', ...entry.languages],
				relatedRuleIds: [...entry.ruleIds],
				authority: entry.handling === 'advisory' ? 'Community advice' : 'Official Musixmatch'
			};
		}),
		...ruleReferences('musixmatch').map((rule): ReferenceDocument => {
			const topic = profileRuleTopic(rule.id);
			return {
				id: rule.id,
				kind: 'rule',
				topic,
				topicTitle: topicTitle(topic),
				title: rule.title,
				href: `/guidelines/checks/${rule.slug}/`,
				summary: rule.explanation,
				passages: [
					rule.message,
					rule.explanation,
					rule.invalid,
					rule.valid,
					...rule.sources.flatMap((source) => [source.pageTitle, source.sectionTitle])
				],
				aliases: ['Musixmatch', 'MXM'],
				relatedRuleIds: [],
				severity: rule.severity,
				fixability: rule.fix?.kind ?? 'none'
			};
		})
	];
}
