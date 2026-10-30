import { describe, expect, it } from 'vitest';
import { guidanceEntries } from '#lib/guidance/entries.js';
import { ruleLookupTable } from '#lib/rules/lookup-tables.js';
import { groupedRuleReferences } from '#lib/rules/reference.js';
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

describe('reference topic previews', () => {
	// Previews quote the catalog rather than restate it: a lyric example excerpt or a form the
	// statement quotes, or a preferred standardized spelling, so no row invents a convention.
	it('quotes each example exactly from its cited source on the same topic', () => {
		const spellings = ruleLookupTable('spelling.standardized')!.entries;
		for (const topic of referenceTopics) {
			expect(topic.preview.length, topic.id).toBeGreaterThan(0);
			for (const { text, source } of topic.preview) {
				if (source === 'spelling.standardized') {
					expect(topic.id).toBe('spelling');
					expect(
						spellings.some((entry) => entry.preferred.includes(text)),
						text
					).toBe(true);
					continue;
				}
				const entry = guidanceEntries.find((candidate) => candidate.id === source);
				expect(entry?.topic, source).toBe(topic.id);
				const quoted = [...(entry?.statement.matchAll(/`([^`]+)`/g) ?? [])].map(
					(match) => match[1]
				);
				expect(entry?.example?.correct?.includes(text) || quoted.includes(text), text).toBe(true);
			}
		}
	});
	it('shows a performer, a spelling with a contraction, and both ad-lib marks', () => {
		const texts = (id: string) =>
			referenceTopics.find((topic) => topic.id === id)!.preview.map((example) => example.text);
		expect(texts('section-headers')).toEqual(['[Verse 1: Avery]']);
		expect(texts('spelling')).toEqual(['okay', "ballin'"]);
		expect(texts('ad-libs')).toEqual(['(Skrrt)', '*cash register*']);
	});
});
