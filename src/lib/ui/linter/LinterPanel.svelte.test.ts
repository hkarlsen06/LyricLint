import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import type { Diagnostic } from '$lib/core/types.js';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import LinterPanel from './LinterPanel.svelte';

/** The revision `createTestWorkbench` mounts with; a fix off it would be stale. */
const revision = 4;

function spelling(from: number, to: number, replacement: string): Diagnostic {
	return diagnostic({
		ruleId: 'spelling.standardized',
		severity: 'suggestion',
		message: `Genius prefers “${replacement}”.`,
		from,
		to,
		fixes: [
			{
				kind: 'safe',
				label: `Replace with ${replacement}`,
				edit: { baseRevision: revision, edits: [{ from, to, insert: replacement }] }
			}
		]
	});
}

/** A finding with no fix at all: one of the ones that needs a decision. */
function prose(from: number, to: number): Diagnostic {
	return diagnostic({
		ruleId: 'line.prose-density',
		severity: 'suggestion',
		message: 'This line reads as prose.',
		from,
		to
	});
}

describe('the linter offers one bulk command over the list it is showing', () => {
	afterEach(cleanup);

	test('applies every safe fix as one transaction and says what is left', async () => {
		const { controller, calls } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), spelling(20, 24, "I'ma"), prose(40, 60), prose(70, 90)]
		});
		render(LinterPanel, { controller });

		// The button never claims the findings it cannot settle: four are showing
		// and it offers the two that go without review.
		const bulk = screen.getByRole('button', { name: 'Fix 2 issues automatically' });

		await fireEvent.click(bulk);

		// One transaction, so one undo step for one press.
		expect(calls.dispatched).toHaveLength(1);
		expect(calls.dispatched[0]).toEqual({
			baseRevision: revision,
			edits: [
				{ from: 0, to: 4, insert: "I'ma" },
				{ from: 20, to: 24, insert: "I'ma" }
			]
		});
		expect(controller.feedback.announcement).toContain('Fixed 2 issues automatically');
		expect(controller.feedback.announcement).toContain('2 still need a decision');
	});

	test('is chrome, so it never reads as the open card below it', () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60)]
		});
		// The chips are the other strip that hangs here, and they draw themselves
		// once the document has findings, so the two can be compared as the one
		// material they are meant to share.
		render(LinterPanel, { controller });

		const row = document.querySelector('.linter-panel__bulk')!;
		const rowFill = getComputedStyle(row).backgroundColor;
		const selectedCard = document.querySelector('.diagnostic-card--expanded')!;
		const chips = document.querySelector('.linter-panel__filters')!;

		// The panel spends `--color-canvas` on the column behind the cards, and in
		// dark on the selected diagnostic as well, so a strip of bare canvas here
		// merged into whichever card was open and left the button loose inside it.
		// This row is chrome: not the list. The assertion is against the open card
		// rather than the resting one because that is the tone the strip is most
		// at risk of matching in either scheme.
		expect(rowFill).not.toBe('rgba(0, 0, 0, 0)');
		expect(rowFill).not.toBe(getComputedStyle(selectedCard).backgroundColor);
		expect(rowFill).toBe(getComputedStyle(chips).backgroundColor);
	});

	/*
	 * Selection is depth in both schemes, and the direction is the scheme's own
	 * answer — so this asserts the branch it is actually running under rather than
	 * one of them. The regression it guards is the light half: the open card is
	 * the one carrying the fix the reader is about to press, and dropped to the
	 * recessed grey it wore the tone this workbench spends on things that are
	 * spent. It cannot rise by lightness, the resting cards being the paper
	 * already, so keeping the paper *and* owning an outward shadow is the whole
	 * of the state and either half alone is the bug.
	 */
	test('lifts the open card in light and sinks it in dark', () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60)]
		});
		render(LinterPanel, { controller });

		const open = document.querySelector('.diagnostic-card--expanded')!;
		const resting = document.querySelector(
			'.diagnostic-list > li:not(.diagnostic-card--expanded)'
		)!;
		const openStyle = getComputedStyle(open);

		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			expect(openStyle.backgroundColor).not.toBe(getComputedStyle(resting).backgroundColor);
			expect(openStyle.boxShadow).toContain('inset');
			return;
		}

		expect(openStyle.backgroundColor).toBe(getComputedStyle(resting).backgroundColor);
		expect(openStyle.boxShadow).not.toBe('none');
		expect(openStyle.boxShadow).not.toContain('inset');
		// The seam goes with the lift: a row still ruled into the run at its foot
		// is still part of it. The border keeps its width and loses only its color,
		// so opening a card cannot shift the list under the pointer that opened it.
		expect(openStyle.borderBottomStyle).toBe('solid');
		expect(openStyle.borderBottomWidth).not.toBe('0px');
		expect(openStyle.borderBottomColor).toBe('rgba(0, 0, 0, 0)');
	});

	test('drops the remainder when there is none', () => {
		const { controller } = createTestWorkbench({ diagnostics: [spelling(0, 4, "I'ma")] });
		render(LinterPanel, { controller });

		expect(screen.getByRole('button', { name: 'Fix 1 issue automatically' })).toBeTruthy();
		expect(screen.queryByText(/need a decision/)).toBeNull();
	});

	test('ends the row with what the command will not touch', () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60), prose(70, 90)]
		});
		render(LinterPanel, { controller });

		const row = document.querySelector('.linter-panel__bulk')!;
		// Command at one end, remainder at the other — which is also what keeps a
		// lone button from sitting in half a row of empty gutter.
		expect(row.textContent?.replace(/\s+/gu, ' ').trim()).toBe(
			'Fix 1 issue automatically 2 need a decision'
		);
		expect(getComputedStyle(row).justifyContent).toBe('space-between');

		// Bordered default tier: it has to read as pressable against an inert
		// strip. The contrast tier stays with the fix a card previews.
		const action = row.querySelector('button')!;
		expect(action.classList.contains('button--quiet')).toBe(false);
		expect(getComputedStyle(action).borderBottomWidth).not.toBe('0px');
	});

	test('is absent, not disabled, when it could do nothing', () => {
		const { controller } = createTestWorkbench({ diagnostics: [prose(0, 10)] });
		render(LinterPanel, { controller });

		expect(screen.queryByRole('button', { name: /automatically/ })).toBeNull();
	});

	test('counts only what the severity filters are showing', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [
				spelling(0, 4, "I'ma"),
				diagnostic({
					ruleId: 'quotes.typewriter',
					severity: 'warning',
					message: 'Use a typewriter apostrophe.',
					from: 30,
					to: 31,
					fixes: [
						{
							kind: 'safe',
							label: "Replace with '",
							edit: { baseRevision: revision, edits: [{ from: 30, to: 31, insert: "'" }] }
						}
					]
				})
			]
		});
		render(LinterPanel, { controller });

		expect(screen.getByRole('button', { name: 'Fix 2 issues automatically' })).toBeTruthy();

		// Switching a severity off is a statement about what the user wants to deal
		// with, so the bulk command may not reach past it.
		controller.toggleSeverity('warning');
		await Promise.resolve();
		expect(screen.getByRole('button', { name: 'Fix 1 issue automatically' })).toBeTruthy();
	});

	test('excludes only the ignored diagnostic from the batch', async () => {
		const first = spelling(0, 4, "I'ma");
		const { controller } = createTestWorkbench({
			diagnostics: [first, spelling(20, 24, "I'ma")]
		});
		render(LinterPanel, { controller });

		controller.ignoreDiagnostic(first);
		await Promise.resolve();
		expect(screen.getByRole('button', { name: 'Fix 1 issue automatically' })).toBeTruthy();
	});
});

describe('the severity chips are on screen, and only for the kinds that are there', () => {
	afterEach(cleanup);

	const chipNames = () =>
		[...document.querySelectorAll('.linter-panel__filters .filter-chip')].map((chip) =>
			chip.textContent?.replace(/\s+/gu, ' ').trim()
		);

	test('draws itself without being asked for', () => {
		const { controller } = createTestWorkbench({ diagnostics: [prose(0, 10)] });
		render(LinterPanel, { controller });

		// The row used to be revealed by pressing the Linter tab a second time from
		// inside the linter, which is a gesture nothing advertises and nobody
		// performs — so the filters read as a feature the workbench did not have.
		expect(screen.getByRole('group', { name: 'Filter diagnostics by severity' })).toBeTruthy();
	});

	test('offers no chip for a severity with nothing in it', () => {
		const { controller } = createTestWorkbench({
			diagnostics: [
				prose(0, 10),
				diagnostic({
					ruleId: 'quotes.typewriter',
					severity: 'warning',
					message: 'Use a typewriter apostrophe.',
					from: 30,
					to: 31
				})
			]
		});
		render(LinterPanel, { controller });

		// `Errors 0` and `Manual review 0` are counts that could not have been
		// otherwise, offering to filter out kinds that are not in the document.
		expect(chipNames()).toEqual(['Warnings 1', 'Suggestions 1']);
	});

	test('draws no row at all when there is nothing to filter', () => {
		const { controller } = createTestWorkbench({ diagnostics: [] });
		render(LinterPanel, { controller });

		expect(screen.queryByRole('group', { name: 'Filter diagnostics by severity' })).toBeNull();
	});

	test('keeps a switched-off kind on screen, because its chip is the way back', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [
				prose(0, 10),
				diagnostic({
					ruleId: 'quotes.typewriter',
					severity: 'warning',
					message: 'Use a typewriter apostrophe.',
					from: 30,
					to: 31
				})
			]
		});
		render(LinterPanel, { controller });

		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));

		// The count is over the unignored diagnostics and blind to the filters, so
		// a kind the user has hidden keeps its count and therefore keeps its chip.
		// Read the other way, hiding a kind would delete the only control that
		// brings it back.
		const warnings = screen.getByRole('button', { name: /Warnings/ });
		expect(warnings.getAttribute('aria-pressed')).toBe('false');
		expect(chipNames()).toEqual(['Warnings 1', 'Suggestions 1']);
		expect(screen.queryByText('Use a typewriter apostrophe.')).toBeNull();
	});
});

describe("a card's batch repeats the change the card is previewing", () => {
	afterEach(cleanup);

	test('offers the occurrences of this exact fix, not of the rule', async () => {
		const { controller, calls } = createTestWorkbench({
			diagnostics: [
				spelling(0, 4, "I'ma"),
				spelling(20, 24, "I'ma"),
				spelling(40, 44, "I'ma"),
				// Same rule, different change: the card showing `I'ma` may not apply
				// these, because its diff never showed them.
				spelling(60, 63, "'til"),
				spelling(80, 83, "'til")
			]
		});
		render(LinterPanel, { controller });

		const fixAll = screen.getByRole('button', { name: 'Fix all 3' });
		await fireEvent.click(fixAll);

		expect(calls.dispatched).toHaveLength(1);
		expect(calls.dispatched[0].edits).toEqual([
			{ from: 0, to: 4, insert: "I'ma" },
			{ from: 20, to: 24, insert: "I'ma" },
			{ from: 40, to: 44, insert: "I'ma" }
		]);
		expect(controller.feedback.announcement).toBe("Replace with I'ma applied to 3 findings.");
	});

	test('says nothing about a batch of one', () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), spelling(60, 63, "'til")]
		});
		render(LinterPanel, { controller });

		// The expanded card's own fix button already applies the single occurrence.
		expect(screen.getByRole('button', { name: "Replace with I'ma" })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Fix all/ })).toBeNull();
	});
});
