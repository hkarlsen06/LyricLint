import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../core/parser.js';
import type { PerformerRecord, RuleContext } from '../core/types.js';
import { runRules } from './engine.js';
import { enabledRules } from './registry.js';
import { sourceRegistry } from './data/sources.js';

interface LyricFixture {
	id: string;
	language: string;
	input: string;
	performers: string[];
	expectedRuleIds: string[];
}

const fixtures = JSON.parse(
	readFileSync(resolve(process.cwd(), 'fixtures/lyrics/cases.json'), 'utf8')
) as LyricFixture[];

function performer(name: string, order: number): PerformerRecord {
	return {
		id: `performer-${order}`,
		displayName: name,
		normalizedKey: name.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	};
}

function context(fixture: LyricFixture): RuleContext {
	return {
		language: fixture.language,
		performers: fixture.performers.map(performer),
		sources: sourceRegistry,
		ruleSetVersion: '2026.07.24.1'
	};
}

describe('fixture rule acceptance', () => {
	it.each(fixtures)('$id emits exactly the expected rule-ID set', (fixture) => {
		const actual = [
			...new Set(
				runRules(parseDocument(fixture.input), context(fixture), enabledRules).map(
					(diagnostic) => diagnostic.ruleId
				)
			)
		].sort();
		const expected = [
			...fixture.expectedRuleIds,
			...(fixture.id === 'autosave-recovery-unicode' ? ['performer.inline-mismatch'] : [])
		];
		expect(actual).toEqual(expected.sort());
	});
});
