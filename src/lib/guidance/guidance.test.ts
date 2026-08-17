import { describe, expect, it } from 'vitest';
import { currentRuleSet } from '$lib/rules/data/rule-set.js';
import { assertReviewedSources, getSource } from '$lib/rules/data/sources.js';
import { guidanceEntries, guidanceForRule, guidanceRegistry, guidanceTopics } from './entries.js';
import {
	guidanceTopicLandmarks,
	guidanceTopicOrder,
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
	// claimed authority must equal the best its sources can back. The
	// `lyriclint` advisories are the exception the type documents: their
	// sources are context rather than backing, so what they owe instead is a
	// note naming the claim as LyricLint's own — an advisory whose entry reads
	// like a sourced convention is a Genius name on a claim no source states.
	it('claims exactly the authority its sources establish', () => {
		for (const entry of guidanceEntries) {
			if (entry.authority === 'lyriclint') {
				expect(entry.note ?? '', entry.id).toContain('LyricLint');
				continue;
			}
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
		for (const landmarks of Object.values(guidanceTopicLandmarks)) {
			for (const landmark of landmarks) {
				for (const ruleId of landmark.relatedRuleIds ?? []) {
					expect(ruleIds.has(ruleId), `${landmark.id} → ${ruleId}`).toBe(true);
				}
			}
		}
	});

	// The rule pages read the same mapping backwards, so the derivation is
	// pinned from that end too: an entry, a landmark, and the empty answer for
	// a rule nothing names — the state a rule page draws no link in.
	it('resolves a rule to its guideline links in both shapes', () => {
		expect(guidanceForRule('numbers.spell-out')).toEqual([
			{
				topic: 'numbers',
				topicTitle: 'Numbers',
				anchor: 'spelled-out',
				title: 'Spell numbers out'
			}
		]);
		expect(guidanceForRule('spelling.standardized').map(({ anchor }) => anchor)).toEqual([
			'standardized-spellings',
			'elision-apostrophe'
		]);
		expect(guidanceForRule('language.selection-mismatch')).toEqual([]);
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
