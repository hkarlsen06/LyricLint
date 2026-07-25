import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticFix, Fixability } from '$lib/core/types.js';
import { collectMatchingFixes, fixBatchKey, mergeFixes, planBulkFix } from './bulk-fix.js';

function fix(label: string, from: number, to: number, insert: string, kind: Fixability = 'safe') {
	return {
		kind: kind as DiagnosticFix['kind'],
		label,
		edit: { baseRevision: 7, edits: [{ from, to, insert }] }
	};
}

function diagnostic(ruleId: string, from: number, to: number, fixes: DiagnosticFix[]): Diagnostic {
	return {
		ruleId,
		severity: 'suggestion',
		from,
		to,
		message: `${ruleId} at ${from}`,
		explanation: '',
		sourceIds: [],
		fixes
	};
}

/**
 * One document with two different standardized spellings under one rule — the
 * case the card's batch exists to keep apart.
 */
function mixedSpellingDocument(): Diagnostic[] {
	return [
		diagnostic('spelling.standardized', 0, 4, [fix("Replace with I'ma", 0, 4, "I'ma")]),
		diagnostic('spelling.standardized', 20, 24, [fix("Replace with I'ma", 20, 24, "I'ma")]),
		diagnostic('spelling.standardized', 40, 44, [fix("Replace with I'ma", 40, 44, "I'ma")]),
		diagnostic('spelling.standardized', 60, 63, [fix("Replace with 'til", 60, 63, "'til")]),
		diagnostic('spelling.standardized', 80, 83, [fix("Replace with 'til", 80, 83, "'til")])
	];
}

describe('a batch reached from a card is the change the card previewed', () => {
	it('collects the same rule and the same label, not the whole rule', () => {
		const diagnostics = mixedSpellingDocument();
		const source = diagnostics[0];
		const batch = collectMatchingFixes(diagnostics, source, source.fixes![0]);

		// Five findings under `spelling.standardized`, but the card is showing
		// `Imma` → `I'ma`, so pressing its batch may only apply that one.
		expect(batch).toHaveLength(3);
		expect(new Set(batch.map((candidate) => candidate.label))).toEqual(
			new Set(["Replace with I'ma"])
		);
		expect(batch.flatMap((candidate) => candidate.edit.edits.map((edit) => edit.insert))).toEqual([
			"I'ma",
			"I'ma",
			"I'ma"
		]);
	});

	it('keeps the same label under different rules apart', () => {
		const diagnostics = [
			diagnostic('spelling.standardized', 0, 3, [fix('Remove markup', 0, 3, '')]),
			diagnostic('syntax.unsupported-voice-markup', 10, 13, [fix('Remove markup', 10, 13, '')])
		];
		const source = diagnostics[0];

		expect(fixBatchKey(diagnostics[0], diagnostics[0].fixes![0])).not.toBe(
			fixBatchKey(diagnostics[1], diagnostics[1].fixes![0])
		);
		expect(collectMatchingFixes(diagnostics, source, source.fixes![0])).toHaveLength(1);
	});

	it('never batches a preview fix', () => {
		const diagnostics = [
			diagnostic('contraction.apostrophe', 0, 4, [
				fix("Replace with Don't", 0, 4, "Don't", 'preview')
			]),
			diagnostic('contraction.apostrophe', 20, 24, [
				fix("Replace with Don't", 20, 24, "Don't", 'preview')
			])
		];
		const source = diagnostics[0];

		// A preview fix is exactly the case the user has to confirm one at a time.
		expect(collectMatchingFixes(diagnostics, source, source.fixes![0])).toEqual([]);
	});

	it('drops a colliding occurrence rather than corrupting the range', () => {
		const overlapping = [
			diagnostic('quotes.typewriter', 0, 5, [fix('Replace with straight quotes', 0, 5, "'")]),
			diagnostic('quotes.typewriter', 3, 8, [fix('Replace with straight quotes', 3, 8, "'")])
		];
		const source = overlapping[0];

		const batch = collectMatchingFixes(overlapping, source, source.fixes![0]);
		expect(batch).toHaveLength(1);
		expect(batch[0].edit.edits[0]).toEqual({ from: 0, to: 5, insert: "'" });
	});
});

describe('a batch becomes exactly one edit', () => {
	it('folds every fix into one atomic edit sorted by position', () => {
		const diagnostics = mixedSpellingDocument();
		const source = diagnostics[0];
		const merged = mergeFixes(collectMatchingFixes(diagnostics, source, source.fixes![0]))!;

		// One transaction, so one undo step and no fix left stale by the one
		// dispatched before it.
		expect(merged.baseRevision).toBe(7);
		expect(merged.edits).toEqual([
			{ from: 0, to: 4, insert: "I'ma" },
			{ from: 20, to: 24, insert: "I'ma" },
			{ from: 40, to: 44, insert: "I'ma" }
		]);
		// A batch spread down the document has no one place for the caret; the
		// panel selects the leading remaining diagnostic instead.
		expect(merged.selectionAfter).toBeUndefined();
	});

	it('refuses a batch whose fixes do not share a revision', () => {
		const stale = fix("Replace with I'ma", 0, 4, "I'ma");
		stale.edit.baseRevision = 6;
		expect(mergeFixes([stale, fix("Replace with I'ma", 20, 24, "I'ma")])).toBeUndefined();
	});

	it('has nothing to dispatch for an empty batch', () => {
		expect(mergeFixes([])).toBeUndefined();
	});
});

describe('the whole-document plan counts what the panel is showing', () => {
	it('splits the visible list into automatic and manual', () => {
		const diagnostics = [
			...mixedSpellingDocument(),
			diagnostic('contraction.apostrophe', 100, 104, [
				fix("Replace with Don't", 100, 104, "Don't", 'preview')
			]),
			diagnostic('line.prose-density', 120, 140, [])
		];

		const plan = planBulkFix(diagnostics);
		// The five spelling findings go automatically; the preview fix and the
		// unfixable finding are the two that need the user.
		expect(plan.automatic).toBe(5);
		expect(plan.manual).toBe(2);
		expect(plan.automatic + plan.manual).toBe(diagnostics.length);
		expect(plan.fixes).toHaveLength(5);
	});

	it('counts a diagnostic once even when a collision drops its fix', () => {
		const diagnostics = [
			diagnostic('quotes.typewriter', 0, 5, [fix('Replace with straight quotes', 0, 5, "'")]),
			diagnostic('quotes.typewriter', 3, 8, [fix('Replace with straight quotes', 3, 8, "'")])
		];

		const plan = planBulkFix(diagnostics);
		// The dropped fix is not discarded — it is offered again against the next
		// revision — so it counts as still needing a decision now.
		expect(plan.automatic).toBe(1);
		expect(plan.manual).toBe(1);
	});

	it('offers nothing for a document with no safe fixes', () => {
		const plan = planBulkFix([diagnostic('line.prose-density', 0, 10, [])]);
		expect(plan.fixes).toEqual([]);
		expect(plan.automatic).toBe(0);
		expect(plan.manual).toBe(1);
	});
});
