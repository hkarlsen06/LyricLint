import { describe, expect, it } from 'vitest';
import { groupedRuleReferences } from '$lib/rules/reference.js';
import { referenceTopicAnchors, referenceTopicForRule, referenceTopics } from './topics.js';

describe('reference topic bookmarks', () => {
	it('preserves every published rule family as an anchor on its owning topic', () => {
		for (const group of groupedRuleReferences()) {
			const topic = referenceTopicForRule(group.group);
			expect(referenceTopicAnchors(topic)).toContain(group.group);
		}
	});
	it('gives each fragment exactly one destination, including topics named after a family', () => {
		const anchors = referenceTopics.flatMap((topic) => referenceTopicAnchors(topic.id));
		expect(new Set(anchors).size).toBe(anchors.length);
		expect(referenceTopicAnchors('section-headers')).toEqual([
			'section-headers',
			'section',
			'performer',
			'syntax'
		]);
		expect(
			referenceTopicAnchors('spelling').filter((anchor) => anchor === 'spelling')
		).toHaveLength(1);
	});
});
