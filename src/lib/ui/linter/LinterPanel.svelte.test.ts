import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { parseDocument } from '$lib/core/parser.js';
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
		await render(LinterPanel, { controller });

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

	test('is chrome, so it never reads as the open card below it', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60)]
		});
		// The chips are the other strip that hangs here, and they draw themselves
		// once the document has findings, so the two can be compared as the one
		// material they are meant to share.
		await render(LinterPanel, { controller });

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

	// Only the open finding draws a surface; the others remain an unboxed list.
	test('lifts only the open finding above the quiet list in both themes', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60)]
		});
		await render(LinterPanel, { controller });
		const open = document.querySelector('.diagnostic-card--expanded')!;
		const resting = document.querySelector(
			'.diagnostic-list > li:not(.diagnostic-card--expanded)'
		)!;
		const openStyle = getComputedStyle(open);
		expect(openStyle.backgroundColor).not.toBe(getComputedStyle(resting).backgroundColor);
		expect(openStyle.boxShadow).not.toBe('none');
		expect(getComputedStyle(resting).boxShadow).toBe('none');
		expect(openStyle.borderBottomWidth).toBe('0px');
	});

	test('drops the remainder when there is none', async () => {
		const { controller } = createTestWorkbench({ diagnostics: [spelling(0, 4, "I'ma")] });
		await render(LinterPanel, { controller });

		expect(screen.getByRole('button', { name: 'Fix 1 issue automatically' })).toBeTruthy();
		expect(screen.queryByText(/need a decision/)).toBeNull();
	});

	test('ends the row with what the command will not touch', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60), prose(70, 90)]
		});
		await render(LinterPanel, { controller });

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

	test('is absent, not disabled, when it could do nothing', async () => {
		const { controller } = createTestWorkbench({ diagnostics: [prose(0, 10)] });
		await render(LinterPanel, { controller });

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
		await render(LinterPanel, { controller });

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
		await render(LinterPanel, { controller });

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

	test('draws itself without being asked for', async () => {
		const { controller } = createTestWorkbench({ diagnostics: [prose(0, 10)] });
		await render(LinterPanel, { controller });

		// The row used to be revealed by pressing the Linter tab a second time from
		// inside the linter, which is a gesture nothing advertises and nobody
		// performs — so the filters read as a feature the workbench did not have.
		expect(screen.getByRole('group', { name: 'Filter diagnostics by severity' })).toBeTruthy();
	});

	test('offers no chip for a severity with nothing in it', async () => {
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
		await render(LinterPanel, { controller });

		// `Errors 0` and `Manual review 0` are counts that could not have been
		// otherwise, offering to filter out kinds that are not in the document.
		expect(chipNames()).toEqual(['Warnings 1', 'Suggestions 1']);
	});

	test('draws no row at all when there is nothing to filter', async () => {
		const { controller } = createTestWorkbench({ diagnostics: [] });
		await render(LinterPanel, { controller });

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
		await render(LinterPanel, { controller });

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
		await render(LinterPanel, { controller });

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

	test('says nothing about a batch of one', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), spelling(60, 63, "'til")]
		});
		await render(LinterPanel, { controller });

		// The expanded card's own fix button already applies the single occurrence.
		expect(screen.getByRole('button', { name: "Replace with I'ma" })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Fix all/ })).toBeNull();
	});
});

describe('review continuity', () => {
	afterEach(cleanup);

	test('collapses the open finding and retires its preview until reopened', async () => {
		const { controller, editor } = createTestWorkbench({ diagnostics: [spelling(0, 4, "I'ma")] });
		const preview = vi.fn();
		const clear = vi.fn();
		editor.previewAtomic = preview;
		editor.clearPreview = clear;
		await render(LinterPanel, { controller });
		await waitFor(() => expect(preview).toHaveBeenCalled());
		const row = screen.getByRole('button', { name: /^Go to/ });
		await fireEvent.click(row);
		expect(row.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('button', { name: "Replace with I'ma" })).toBeNull();
		expect(clear).toHaveBeenCalled();
		await fireEvent.click(row);
		expect(row.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('button', { name: "Replace with I'ma" })).toBeTruthy();
	});

	test('retires the review preview while another tool is visible', async () => {
		const { controller, editor } = createTestWorkbench({ diagnostics: [spelling(0, 4, "I'ma")] });
		editor.previewAtomic = vi.fn();
		const clear = vi.fn();
		editor.clearPreview = clear;
		await render(LinterPanel, { controller });
		await waitFor(() => expect(editor.previewAtomic).toHaveBeenCalled());
		controller.setActiveTab('performers');
		await waitFor(() => expect(clear).toHaveBeenCalled());
		expect(screen.queryByRole('button', { name: "Replace with I'ma" })).toBeNull();
		controller.setActiveTab('linter');
		await waitFor(() =>
			expect(screen.getByRole('button', { name: "Replace with I'ma" })).toBeTruthy()
		);
	});

	test('moves between findings with controls and their shortcuts without stealing focus', async () => {
		const { controller, calls } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(8, 12)]
		});
		await render(LinterPanel, { controller });
		const next = screen.getByRole('button', { name: 'Next' });
		next.focus();
		await fireEvent.click(next);
		expect(controller.activeDiagnosticKey).toBe('line.prose-density:8:12');
		expect(calls.focusCount).toBe(0);
		await fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true, shiftKey: true });
		expect(controller.activeDiagnosticKey).toBe('spelling.standardized:0:4');
		expect(screen.getByText('1 of 2')).toBeTruthy();
	});

	test('leaves selection keys to text fields and open pickers', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(8, 12)]
		});
		await render(LinterPanel, { controller });
		const field = document.createElement('textarea');
		document.body.append(field);
		const dialog = document.createElement('div');
		dialog.setAttribute('role', 'dialog');
		dialog.textContent = 'Open picker';
		try {
			const typing = new KeyboardEvent('keydown', {
				key: 'ArrowDown',
				altKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true
			});
			field.dispatchEvent(typing);
			expect(typing.defaultPrevented).toBe(false);
			expect(controller.activeDiagnosticKey).toBeUndefined();
			document.body.append(dialog);
			const picking = new KeyboardEvent('keydown', {
				key: 'ArrowDown',
				altKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true
			});
			window.dispatchEvent(picking);
			expect(picking.defaultPrevented).toBe(false);
			expect(controller.activeDiagnosticKey).toBeUndefined();
		} finally {
			field.remove();
			dialog.remove();
		}
	});

	test('hands focus off the disappearing automatic-fix command to the remaining decision', async () => {
		const following = prose(8, 12);
		const { controller, editor } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), following]
		});
		editor.dispatchAtomic = () =>
			controller.onSnapshot({ ...controller.snapshot, revision: 5, diagnostics: [following] });
		await render(LinterPanel, { controller });
		const bulk = screen.getByRole('button', { name: 'Fix 1 issue automatically' });
		bulk.focus();
		await fireEvent.click(bulk);
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole('button', { name: 'Go to This line reads as prose.' })
			)
		);
	});

	test('keeps the next row mounted and focused after ignoring its predecessor', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(8, 12)]
		});
		await render(LinterPanel, { controller });
		const following = screen.getByRole('button', { name: 'Go to This line reads as prose.' });
		const ignore = screen.getByRole('button', { name: 'Ignore' });
		ignore.focus();
		await fireEvent.click(ignore);
		await waitFor(() => expect(document.activeElement).toBe(following));
		expect(following.isConnected).toBe(true);
	});

	test.each([390, 1350])(
		'retains controls, focus, geometry, and current fixes after an insertion above findings at %ipx',
		async (width) => {
			await page.viewport(width, 940);
			try {
				const text = 'Intro\nImma go home\nShawdy comes home';
				const first = spelling(6, 10, "I'ma");
				const second = {
					...spelling(19, 25, 'Shawty'),
					message:
						'Check this spelling in the repeated passage while keeping the original words and the performer’s phrasing visible.'
				};
				const { controller, calls } = createTestWorkbench({ text, diagnostics: [first, second] });
				await render(LinterPanel, { controller });
				const controls = screen.getAllByRole('button', { name: /^Go to / });
				const selected = controls[1]!;
				await fireEvent.click(selected);
				selected.focus();
				const geometry = controls.map((control) => control.getBoundingClientRect());
				const fixControl = screen.getByRole('button', { name: 'Replace with Shawty' });
				const fixGeometry = fixControl.getBoundingClientRect();
				const prefix = 'New line\n';
				const nextText = prefix + text;
				const shifted = [first, second].map((item) => ({
					...item,
					from: item.from + prefix.length,
					to: item.to + prefix.length,
					fixes: item.fixes?.map((fix) => ({
						...fix,
						edit: {
							...fix.edit,
							baseRevision: 5,
							edits: fix.edit.edits.map((edit) => ({
								...edit,
								from: edit.from + prefix.length,
								to: edit.to + prefix.length
							}))
						}
					}))
				}));
				controller.onSnapshot({
					...controller.snapshot,
					revision: 5,
					text: nextText,
					parsed: parseDocument(nextText),
					diagnostics: shifted,
					documentChange: { baseRevision: 4, edits: [{ from: 0, to: 0, insert: prefix }] }
				});
				await waitFor(() =>
					expect(screen.getAllByRole('button', { name: /^Go to / })).toEqual(controls)
				);
				expect(document.activeElement).toBe(selected);
				expect(selected.getAttribute('aria-expanded')).toBe('true');
				controls.forEach((control, index) => {
					const next = control.getBoundingClientRect();
					expect(Math.abs(next.top - geometry[index]!.top)).toBeLessThan(1);
					expect(Math.abs(next.left - geometry[index]!.left)).toBeLessThan(1);
					expect(Math.abs(next.height - geometry[index]!.height)).toBeLessThan(1);
				});
				expect(screen.getByRole('button', { name: 'Replace with Shawty' })).toBe(fixControl);
				expect(Math.abs(fixControl.getBoundingClientRect().top - fixGeometry.top)).toBeLessThan(1);
				await fireEvent.click(fixControl);
				expect(calls.dispatched.at(-1)).toMatchObject({
					baseRevision: 5,
					edits: [{ from: 28, to: 34, insert: 'Shawty' }]
				});
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	test('hands keyboard focus to the surviving finding after a fix', async () => {
		const fixed = spelling(0, 4, "I'ma");
		const following = prose(8, 12);
		const { controller, editor } = createTestWorkbench({ diagnostics: [fixed, following] });
		editor.dispatchAtomic = () =>
			controller.onSnapshot({ ...controller.snapshot, revision: 5, diagnostics: [following] });
		await render(LinterPanel, { controller });
		const fix = screen.getByRole('button', { name: "Replace with I'ma" });
		fix.focus();
		await fireEvent.click(fix);
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole('button', { name: 'Go to This line reads as prose.' })
			)
		);
	});
});
