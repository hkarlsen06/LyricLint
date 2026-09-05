import { describe, expect, it } from 'vitest';
import { guidanceEntries } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks, guidanceTopicOrder } from '$lib/guidance/guidance.js';
import { ruleReferences } from '$lib/rules/reference.js';
import { topicChecks } from './topic-checks.server.js';

describe('checks within a convention', () => {
	it('carries every linked check, including checks owned by another topic, with exact wording', () => {
		const references = ruleReferences();
		for (const topic of guidanceTopicOrder) {
			const data = topicChecks(topic);
			const ids = [
				...guidanceEntries
					.filter((entry) => entry.topic === topic)
					.flatMap((entry) => entry.relatedRuleIds ?? []),
				...(guidanceTopicLandmarks[topic] ?? []).flatMap((entry) => entry.relatedRuleIds ?? [])
			];
			for (const id of ids) {
				const rule = references.find((reference) => reference.id === id)!;
				expect(data.checksById[id]).toMatchObject({
					title: rule.title,
					explanation: rule.explanation,
					invalid: rule.invalid,
					valid: rule.valid,
					language: rule.language,
					href: `/guidelines/checks/${rule.slug}/`
				});
			}
		}
	});
	it('keeps the language-picker check discoverable without inventing a Genius convention', () => {
		const { additionalChecks } = topicChecks('non-english');
		expect(additionalChecks.map((check) => check.id)).toContain('language.selection-mismatch');
		expect(topicChecks('spelling').additionalChecks).toEqual([]);
	});
});
