import { describe, expect, it } from 'vitest';
import { currentRuleSet } from '$lib/rules/data/rule-set.js';
import { assertReviewedSources, getSource } from '$lib/rules/data/sources.js';
import { guidanceEntries, guidanceRegistry, guidanceTopics } from './entries.js';
import {
	guidanceTopicOrder,
	guidanceTopicRuleGroups,
	guidanceTopicTitles,
	highestAuthority
} from './guidance.js';

const ruleIds = new Set<string>(currentRuleSet.ruleIds);

describe('guidance catalog', () => {
	it('has unique ids shaped guidance.<topic>.<slug>', () => {
		expect(guidanceRegistry.size).toBe(guidanceEntries.length);
		for (const entry of guidanceEntries) {
			expect(entry.id, entry.id).toMatch(/^guidance\.[a-z0-9-]+\.[a-z0-9-]+$/u);
			expect(entry.id.split('.')[1], entry.id).toBe(entry.topic);
			expect(entry.topic in guidanceTopicTitles, entry.id).toBe(true);
		}
	});

	it('lists topics in the new-transcriber learning order', () => {
		expect(guidanceTopics().map(({ topic }) => topic)).toEqual(guidanceTopicOrder);
		expect(guidanceTopicOrder[0]).toBe('spelling');
		expect(new Set(guidanceTopicOrder)).toEqual(new Set(Object.keys(guidanceTopicTitles)));
	});

	it('cites only reviewed sources', () => {
		for (const entry of guidanceEntries) {
			expect(entry.sourceIds.length, entry.id).toBeGreaterThan(0);
			expect(() => assertReviewedSources(entry.sourceIds), entry.id).not.toThrow();
		}
	});

	// Promotion is evidence: raising an entry's tier means adding the
	// confirming higher-tier source, never editing the tier alone — so the
	// claimed authority must equal the best its sources can back.
	it('claims exactly the authority its sources establish', () => {
		for (const entry of guidanceEntries) {
			const authorities = entry.sourceIds.map((id) => {
				const source = getSource(id);
				if (!source) throw new Error(`Unknown source ${id} on ${entry.id}`);
				return source.authority;
			});
			expect(entry.authority, entry.id).toBe(highestAuthority(authorities));
		}
	});

	it('points only at rules that exist', () => {
		for (const entry of guidanceEntries) {
			for (const ruleId of entry.relatedRuleIds ?? []) {
				expect(ruleIds.has(ruleId), `${entry.id} → ${ruleId}`).toBe(true);
			}
		}
	});

	// The topic pages list these families as their linter lookups; a family
	// that lost its last rule would silently list nothing.
	it('maps every topic to linter rule families that still have rules', () => {
		const prefixes = new Set([...ruleIds].map((ruleId) => ruleId.split('.')[0]));
		for (const [topic, families] of Object.entries(guidanceTopicRuleGroups)) {
			for (const family of families) {
				expect(prefixes.has(family), `${topic} → ${family}`).toBe(true);
			}
		}
	});

	// A title states what the guideline says, compressed — the register of
	// Genius's own guide items, not the rule reference's failure-naming: a
	// guidelines reader searches for the convention they are wondering about,
	// not for a symptom. The statement is the full sentence beneath it.
	it('writes titles and statements in the guide register', () => {
		for (const entry of guidanceEntries) {
			expect(entry.title, entry.id).toBe(entry.title.trim());
			expect(entry.title.length, entry.id).toBeLessThan(44);
			expect(entry.title.endsWith('.'), entry.id).toBe(false);
			expect(entry.statement, entry.id).toBe(entry.statement.trim());
			expect(entry.statement.endsWith('.'), entry.id).toBe(true);
			expect(entry.statement, entry.id).not.toBe(entry.title);
		}
	});
});
