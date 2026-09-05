// Decision record: docs/subsystems/reference.md
// Derivation stays server-only: importing the rule registry in a finder would ship the engine.
import { guidanceEntries } from '$lib/guidance/entries.js';
import {
	authorityLabels,
	entryAnchor,
	guidanceTopicLandmarks,
	guidanceTopicOrder,
	type GuidanceTopic,
	type GuidanceEntry,
	type GuidanceTopicLandmark
} from '$lib/guidance/guidance.js';
import { getSource } from '$lib/rules/data/sources.js';
import { ruleLookupTable } from '$lib/rules/lookup-tables.js';
import { ruleReferences } from '$lib/rules/reference.js';
import { referenceAliases } from './aliases.js';
import type { ReferenceDocument } from './search.js';
import { referenceTopicForRule, referenceTopics } from './topics.js';

function lookupPassages(ruleId: string): string[] {
	const table = ruleLookupTable(ruleId);
	if (!table) return [];
	return [
		...table.entries.map((entry) =>
			[
				entry.instead.length
					? `${entry.instead.join(', ')} → ${entry.preferred.join(' / ')}`
					: entry.preferred.join(' / '),
				entry.curatedMisspellings?.length
					? `LyricLint also checks: ${entry.curatedMisspellings.join(', ')}.`
					: '',
				entry.appliesWhen,
				entry.note
			]
				.filter(Boolean)
				.join(' ')
		),
		table.description
	];
}

/** JSON-serializable, shared by both layouts; no new claims or copies of catalog prose. */
let cachedCorpus: ReferenceDocument[] | undefined;
export function referenceCorpus(): ReferenceDocument[] {
	if (cachedCorpus) return cachedCorpus;
	const rules = ruleReferences();
	const ruleDocuments: ReferenceDocument[] = rules.map((rule) => {
		const topic = referenceTopicForRule(rule.group);
		const metadata = referenceTopics.find((candidate) => candidate.id === topic)!;
		return {
			id: rule.id,
			kind: 'rule',
			severity: rule.severity,
			fixability: rule.fix?.kind ?? 'none',
			title: rule.title,
			href: `/guidelines/checks/${rule.slug}/`,
			topic,
			topicTitle: metadata.title,
			summary: rule.explanation,
			passages: [
				...lookupPassages(rule.id),
				rule.message,
				rule.explanation,
				rule.invalid,
				rule.valid,
				rule.fix?.label ?? '',
				...rule.sources.flatMap((source) => [source.pageTitle, source.sectionTitle])
			].filter(Boolean),
			aliases: [
				...referenceAliases(rule.id),
				...guidanceEntries
					.filter((entry) => entry.relatedRuleIds?.includes(rule.id))
					.flatMap((entry) => referenceAliases(entry.id)),
				...Object.values(guidanceTopicLandmarks)
					.flat()
					.filter((entry) => entry.relatedRuleIds?.includes(rule.id))
					.flatMap((entry) => referenceAliases(entry.id))
			],
			relatedRuleIds: []
		};
	});
	const documentsByRule = new Map(ruleDocuments.map((document) => [document.id, document]));
	const entries = guidanceEntries.map((entry) => ({ ...entry, anchor: entryAnchor(entry.id) }));
	const landmarks = guidanceTopicOrder.flatMap((topic) =>
		(guidanceTopicLandmarks[topic] ?? []).map((entry) => ({ ...entry, topic, anchor: entry.id }))
	);
	const guidance: Array<
		(
			| GuidanceEntry
			| (GuidanceTopicLandmark & { topic: GuidanceTopic; example?: never; note?: never })
		) & { anchor: string }
	> = guidanceTopicOrder.flatMap((topic) => [
		...landmarks.filter((entry) => entry.topic === topic),
		...entries.filter((entry) => entry.topic === topic)
	]);
	const guidelineDocuments: ReferenceDocument[] = guidance.map((entry) => {
		const metadata = referenceTopics.find((candidate) => candidate.id === entry.topic)!;
		const related = (entry.relatedRuleIds ?? []).flatMap((id) => documentsByRule.get(id) ?? []);
		return {
			id: entry.id,
			kind: 'guideline',
			title: entry.title,
			href: `/guidelines/${entry.topic}/#${entry.anchor}`,
			topic: entry.topic,
			topicTitle: metadata.title,
			summary: entry.statement,
			authority: authorityLabels[entry.authority],
			passages: [
				entry.statement,
				...('example' in entry
					? [entry.example?.correct ?? '', entry.example?.incorrect ?? '']
					: []),
				...('note' in entry ? [entry.note ?? ''] : []),
				authorityLabels[entry.authority],
				...entry.sourceIds.flatMap((id) => {
					const source = getSource(id);
					return source ? [source.pageTitle, source.sectionTitle] : [];
				}),
				...related.flatMap((rule) =>
					[rule.title, ...rule.passages].map((passage) => `Related linter check: ${passage}`)
				)
			].filter(Boolean),
			aliases: referenceAliases(entry.id),
			relatedRuleIds: [...(entry.relatedRuleIds ?? [])]
		};
	});
	cachedCorpus = [...guidelineDocuments, ...ruleDocuments];
	return cachedCorpus;
}
