// Decision record: docs/subsystems/reference.md
import { guidanceEntries } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks, type GuidanceTopic } from '$lib/guidance/guidance.js';
import { ruleReferences } from '$lib/rules/reference.js';
import { referenceTopicForRule } from './topics.js';

/** Derive check wording and coverage from the same records as the individual check pages. */
export function topicChecks(topic: GuidanceTopic) {
	const allLinked = new Set([
		...guidanceEntries.flatMap((entry) => entry.relatedRuleIds ?? []),
		...Object.values(guidanceTopicLandmarks).flatMap((entries) =>
			entries.flatMap((entry) => entry.relatedRuleIds ?? [])
		)
	]);
	const topicLinked = new Set([
		...guidanceEntries
			.filter((entry) => entry.topic === topic)
			.flatMap((entry) => entry.relatedRuleIds ?? []),
		...(guidanceTopicLandmarks[topic] ?? []).flatMap((entry) => entry.relatedRuleIds ?? [])
	]);
	const references = ruleReferences();
	const additional = references.filter(
		(rule) => referenceTopicForRule(rule.group) === topic && !allLinked.has(rule.id)
	);
	const checks = references
		.filter((rule) => topicLinked.has(rule.id) || additional.includes(rule))
		.map((rule) => ({
			id: rule.id,
			title: rule.title,
			explanation: rule.explanation,
			invalid: rule.invalid,
			valid: rule.valid,
			language: rule.language,
			href: `/guidelines/checks/${rule.slug}/`
		}));
	return {
		checksById: Object.fromEntries(checks.map((check) => [check.id, check])),
		additionalChecks: checks.filter((check) => !allLinked.has(check.id))
	};
}
