import { importDocument, renderProfile, resolveDecision } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { parseDocument } from '#lib/core/parser.js';
import type { AtomicDocumentEdit, Diagnostic } from '#lib/core/types.js';
import { cityLightsPasted } from '#lib/diagnostics/decision-test-utils.js';
import { runRules } from '#lib/rules/engine.js';
import { ruleContext } from '#lib/rules/rule-test-utils.js';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import LinterPanel from './LinterPanel.svelte';
import SongPanel from '../tools/SongPanel.svelte';

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
		// The two prose findings ask one question, so they are one row left.
		expect(controller.feedback.announcement).toBe('Fixed 2 issues automatically. 1 decision left.');
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
		expect(screen.queryByText(/left$/u)).toBeNull();
	});

	test('ends the row with what the command will not touch', async () => {
		const { controller } = createTestWorkbench({
			diagnostics: [spelling(0, 4, "I'ma"), prose(40, 60), prose(70, 90)]
		});
		await render(LinterPanel, { controller });

		const row = document.querySelector('.linter-panel__bulk')!;
		// Command at one end, remainder at the other, which is also what keeps a
		// lone button from sitting in half a row of empty gutter.
		// The remainder counts rows: two prose lines are one decision.
		expect(row.textContent?.replace(/\s+/gu, ' ').trim()).toBe(
			'Fix 1 issue automatically 1 decision left'
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
		// performs, so the filters read as a feature the workbench did not have.
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
		const next = screen.getByRole('button', { name: 'Next decision' });
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

describe('one row per decision', () => {
	afterEach(cleanup);

	const lint = (body: string, at: number) =>
		runRules(parseDocument(body), ruleContext({ revision: at }));

	/** A workbench on the findings `linter` gives for `text`, re-linted after every dispatch. */
	function lintedWorkbench(
		text: string,
		options: Omit<Parameters<typeof createTestWorkbench>[0] & {}, 'text' | 'diagnostics'> = {},
		linter: (body: string, at: number) => Diagnostic[] = lint
	) {
		const workbench = createTestWorkbench({
			...options,
			text,
			diagnostics: linter(text, revision)
		});
		const { controller, editor } = workbench;
		editor.dispatchAtomic = (edit: AtomicDocumentEdit) => {
			const current = controller.snapshot;
			let next = current.text;
			for (const change of [...edit.edits].sort((a, b) => b.from - a.from)) {
				next = next.slice(0, change.from) + change.insert + next.slice(change.to);
			}
			controller.onSnapshot({
				...current,
				revision: current.revision + 1,
				text: next,
				parsed: parseDocument(next),
				diagnostics: linter(next, current.revision + 1),
				documentChange: { baseRevision: current.revision, edits: edit.edits }
			});
		};
		return workbench;
	}

	const rowTexts = () =>
		screen.getAllByRole('button', { name: /^Go to / }).map((row) => row.textContent?.trim());
	const commaRow = () =>
		screen.getByRole('button', { name: 'Go to Consider removing the final comma.' });

	test('draws the 26 places of a pasted lyric as 3 rows and counts rows', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });

		expect(rowTexts()).toEqual([
			"Use a straight ' instead of the curly apostrophe.",
			'Consider removing the final comma.',
			'Link these repeats so one correction reaches them all.'
		]);
		expect(screen.getByText('1 of 3')).toBeTruthy();
		const comma = commaRow().closest('li')!;
		expect(comma.querySelector('.diagnostic-meta__line')?.textContent).toBe('10 places');
		// The button counts the places its press changes; the rest count rows.
		expect(
			document.querySelector('.linter-panel__bulk')?.textContent?.replace(/\s+/gu, ' ').trim()
		).toBe('Fix 15 issues automatically 2 decisions left');
		expect(screen.getByRole('button', { name: /^Warnings/ }).textContent).toMatch(/2$/u);
		expect(screen.getByRole('button', { name: /^Suggestions/ }).textContent).toMatch(/1$/u);
	});

	test('steps through a row’s places without moving to another row', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });
		await fireEvent.click(commaRow());

		const previous = screen.getByRole('button', { name: 'Previous place' });
		const next = screen.getByRole('button', { name: 'Next place' });
		expect(screen.getByText('Place 1 of 10, line 8')).toBeTruthy();
		expect((previous as HTMLButtonElement).disabled).toBe(true);
		const first = controller.activeDiagnosticKey;

		next.focus();
		await fireEvent.click(next);
		expect(screen.getByText(/^Place 2 of 10, line \d+$/u)).toBeTruthy();
		expect(controller.activeDiagnosticKey).not.toBe(first);
		expect(controller.activeDiagnosticKey).toMatch(/^punctuation\.line-ending:/u);
		// The stepper survives its own press, so it can be pressed again.
		expect(document.activeElement).toBe(next);
		expect(screen.getByText('2 of 3')).toBeTruthy();
	});

	test.each([390, 1350])(
		'draws the stepper under the meta line that counts the places at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			try {
				const { controller } = lintedWorkbench(cityLightsPasted);
				await render(LinterPanel, { controller });
				await fireEvent.click(commaRow());
				const row = commaRow().closest('li')!;
				const meta = row.querySelector('.diagnostic-meta')!;
				const places = screen.getByRole('group', { name: 'Places' });
				expect(meta.nextElementSibling).toBe(places);
				expect(places.getBoundingClientRect().top).toBeGreaterThanOrEqual(
					meta.getBoundingClientRect().bottom
				);
				expect(places.getBoundingClientRect().bottom).toBeLessThanOrEqual(
					row.querySelector('.diagnostic-explanation')!.getBoundingClientRect().top
				);
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	test.each([390, 1350])(
		'holds the open row still and opens its next place after a fix at %ipx',
		async (width) => {
			await page.viewport(width, 940);
			try {
				const { controller } = lintedWorkbench(cityLightsPasted);
				await render(LinterPanel, { controller });
				await fireEvent.click(commaRow());
				const row = commaRow().closest('li')!;
				const before = row.getBoundingClientRect();
				const fixBefore = screen
					.getByRole('button', { name: 'Remove the comma' })
					.getBoundingClientRect();

				await fireEvent.click(screen.getByRole('button', { name: 'Remove the comma' }));

				await waitFor(() => expect(screen.getByText(/^Place 1 of 9, line \d+$/u)).toBeTruthy());
				expect(commaRow().closest('li')).toBe(row);
				expect(row.classList.contains('diagnostic-card--expanded')).toBe(true);
				expect(row.querySelector('.diagnostic-meta__line')?.textContent).toBe('9 places');
				expect(Math.abs(row.getBoundingClientRect().top - before.top)).toBeLessThan(1);
				const fixAfter = screen
					.getByRole('button', { name: 'Remove the comma' })
					.getBoundingClientRect();
				expect(Math.abs(fixAfter.top - fixBefore.top)).toBeLessThan(1);
				expect(Math.abs(fixAfter.left - fixBefore.left)).toBeLessThan(1);
				expect(rowTexts()).toHaveLength(3);
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	test('opens the next place of the row after ignoring one, and ignores only that one', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });
		await fireEvent.click(commaRow());
		await fireEvent.click(screen.getByRole('button', { name: 'Next place' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next place' }));
		expect(screen.getByText(/^Place 3 of 10, line \d+$/u)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));

		await waitFor(() => expect(screen.getByText(/^Place 3 of 9, line \d+$/u)).toBeTruthy());
		expect(controller.ignoredDiagnosticKeys).toHaveLength(1);
		expect(commaRow().closest('li')?.classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	const frame = () =>
		new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	const rowFor = (message: string) =>
		screen.getByRole('button', { name: `Go to ${message}` }).closest('li')!;
	const apostrophe = "Use a straight ' instead of the curly apostrophe.";
	const comma = 'Consider removing the final comma.';
	/** Two curly apostrophes on lines 2 and 4 around a line-end comma on line 3. */
	const straddled = '[Verse]\nDon’t stop\nKeep going,\nI’m here';

	test('names the place stepper and announces a place only when it is stepped to', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });
		await fireEvent.click(commaRow());

		const places = screen.getByRole('group', { name: 'Places' });
		const buttons = Array.from(places.querySelectorAll('button'));
		expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
			'Previous place',
			'Next place'
		]);
		expect(places.querySelector('[aria-live]')).toBeNull();
		expect(screen.getByRole('group', { name: 'Navigate decisions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Previous decision' })).toBeTruthy();

		await fireEvent.click(buttons[1]!);
		await waitFor(() => expect(controller.feedback.announcement).toBe('Place 2 of 10, line 9'));
		expect(screen.getByText('Place 2 of 10, line 9')).toBeTruthy();

		// After a fix the reader hears what the fix did, not the place it led to.
		await fireEvent.click(screen.getByRole('button', { name: 'Remove the comma' }));
		await waitFor(() => expect(screen.getByText('Place 2 of 9, line 10')).toBeTruthy());
		expect(controller.feedback.announcement).toMatch(/^Remove the comma applied for /u);
	});

	test('keeps focus on the stepper when the last place disables the button pressed', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });
		await fireEvent.click(commaRow());
		const previous = screen.getByRole('button', { name: 'Previous place' });
		const next = screen.getByRole('button', { name: 'Next place' }) as HTMLButtonElement;
		next.focus();
		for (let step = 0; step < 9; step += 1) await fireEvent.click(next);
		await waitFor(() => expect(screen.getByText('Place 10 of 10, line 33')).toBeTruthy());
		expect(next.disabled).toBe(true);
		await waitFor(() => expect(document.activeElement).toBe(previous));
	});

	test('leads from an answered last place to the row’s first remaining place', async () => {
		const { controller } = lintedWorkbench(cityLightsPasted);
		await render(LinterPanel, { controller });
		await fireEvent.click(commaRow());
		const next = screen.getByRole('button', { name: 'Next place' });
		for (let step = 0; step < 9; step += 1) await fireEvent.click(next);
		expect(screen.getByText('Place 10 of 10, line 33')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove the comma' }));

		await waitFor(() => expect(screen.getByText('Place 1 of 9, line 8')).toBeTruthy());
		expect(commaRow().closest('li')?.classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	test.each([1350, 390])(
		'keeps an answered row where it was drawn and the rows below still at %ipx',
		async (width) => {
			await page.viewport(width, 940);
			try {
				const { controller } = lintedWorkbench(straddled);
				await render(LinterPanel, { controller });
				expect(rowTexts()).toEqual([apostrophe, comma]);
				const open = rowFor(apostrophe);
				expect(open.classList.contains('diagnostic-card--expanded')).toBe(true);
				expect(screen.getByText('Place 1 of 2, line 2')).toBeTruthy();
				const before = {
					open: open.getBoundingClientRect().top,
					below: rowFor(comma).getBoundingClientRect().top
				};

				await fireEvent.click(screen.getByRole('button', { name: "Replace with '" }));

				// The row now ranks by line 4, below the comma on line 3, but rows never
				// reorder on their own; and the stepper it no longer needs leaves its
				// slot behind rather than lifting the rows below.
				await waitFor(() =>
					expect(rowFor(apostrophe).querySelector('.diagnostic-meta__line')?.textContent).toBe(
						'Line 4'
					)
				);
				expect(screen.queryByRole('group', { name: 'Places' })).toBeNull();
				expect(rowTexts()).toEqual([apostrophe, comma]);
				expect(rowFor(apostrophe)).toBe(open);
				expect(open.classList.contains('diagnostic-card--expanded')).toBe(true);
				await frame();
				expect(Math.abs(open.getBoundingClientRect().top - before.open)).toBeLessThan(1);
				expect(Math.abs(rowFor(comma).getBoundingClientRect().top - before.below)).toBeLessThan(1);
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	/**
	 * One finding per capital letter, each with a safe fix that deletes it: `E`
	 * is an error and every other letter a warning, so letters rank by severity,
	 * then by where they first appear.
	 */
	const markers = (body: string, at: number) =>
		Array.from(body.matchAll(/[A-Z]/gu), ({ 0: letter, index: from }) =>
			diagnostic({
				ruleId: `test.${letter}`,
				severity: letter === 'E' ? 'error' : 'warning',
				message: `Marker ${letter}.`,
				from,
				to: from + 1,
				fixes: [
					{
						kind: 'safe',
						label: `Remove ${letter}`,
						edit: { baseRevision: at, edits: [{ from, to: from + 1, insert: '' }] }
					}
				]
			})
		);
	/** Forty filler lines with a marker letter on each numbered line. */
	const markedLines = (letters: Record<number, string>) =>
		Array.from({ length: 40 }, (_, index) => letters[index + 1] ?? 'la').join('\n');
	const marker = (letter: string) => `Marker ${letter}.`;
	const lineOf = (letter: string) =>
		rowFor(marker(letter)).querySelector('.diagnostic-meta__line')?.textContent;
	const removeFirst = (
		controller: ReturnType<typeof lintedWorkbench>['controller'],
		letter: string
	) => {
		const found = controller.snapshot.diagnostics.find((item) => item.message === marker(letter))!;
		return { found, fix: found.fixes![0]! };
	};
	const xayz = markedLines({ 1: 'X', 2: 'A', 5: 'Y', 10: 'Z', 30: 'A', 40: 'X' });

	test('keeps the open row where it was drawn when another row is answered in the editor', async () => {
		const { controller, editor } = lintedWorkbench(xayz, {}, markers);
		await render(LinterPanel, { controller });
		expect(rowTexts()).toEqual(['X', 'A', 'Y', 'Z'].map(marker));
		await fireEvent.click(rowFor(marker('A')).querySelector('button')!);
		await frame();
		const top = rowFor(marker('A')).getBoundingClientRect().top;

		await fireEvent.click(screen.getByRole('button', { name: 'Remove A' }));
		await waitFor(() => expect(lineOf('A')).toBe('Line 30'));
		// Typed in the lyrics, so nothing in the panel saw it coming.
		const x = controller.snapshot.text.indexOf('X');
		editor.dispatchAtomic({
			baseRevision: controller.snapshot.revision,
			edits: [{ from: x, to: x + 1, insert: '' }]
		});

		await waitFor(() => expect(lineOf('X')).toBe('Line 40'));
		expect(rowTexts()).toEqual(['X', 'A', 'Y', 'Z'].map(marker));
		expect(rowFor(marker('A')).classList.contains('diagnostic-card--expanded')).toBe(true);
		await frame();
		expect(rowFor(marker('A')).getBoundingClientRect().top).toBe(top);
	});

	test('keeps every row where it was drawn when a fix arrives from the editor', async () => {
		const { controller } = lintedWorkbench(xayz, {}, markers);
		await render(LinterPanel, { controller });
		await fireEvent.click(rowFor(marker('Y')).querySelector('button')!);

		// The popover and `Mod-.` apply a fix through the controller, not the card.
		const { found, fix } = removeFirst(controller, 'X');
		controller.applyFix(found, fix);

		await waitFor(() => expect(lineOf('X')).toBe('Line 40'));
		expect(rowTexts()).toEqual(['X', 'A', 'Y', 'Z'].map(marker));
		// The lead after the fix is the answered row's next place, in its own slot.
		expect(rowFor(marker('X')).classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	test('leads to the row drawn first, not the row ranked first, after a row leaves', async () => {
		const { controller } = lintedWorkbench(xayz, {}, markers);
		await render(LinterPanel, { controller });
		// From the editor, so no passage was chosen and the lead is the list's own.
		const answer = (letter: string) => {
			const { found, fix } = removeFirst(controller, letter);
			controller.applyFix(found, fix);
		};
		answer('X');
		answer('A');
		await waitFor(() => expect(lineOf('A')).toBe('Line 30'));
		// Drawn X, A, Y, Z, but ranked Y, Z, A, X.
		expect(rowTexts()).toEqual(['X', 'A', 'Y', 'Z'].map(marker));

		answer('Y');

		await waitFor(() => expect(rowTexts()).toEqual(['X', 'A', 'Z'].map(marker)));
		expect(rowFor(marker('X')).classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	test('returns to rank order when a severity chip changes what the list shows', async () => {
		const { controller } = lintedWorkbench(
			markedLines({ 1: 'E', 2: 'A', 5: 'W', 30: 'A' }),
			{},
			markers
		);
		await render(LinterPanel, { controller });
		expect(rowTexts()).toEqual(['E', 'A', 'W'].map(marker));
		await fireEvent.click(rowFor(marker('A')).querySelector('button')!);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove A' }));
		await waitFor(() => expect(lineOf('A')).toBe('Line 30'));
		expect(rowTexts()).toEqual(['E', 'A', 'W'].map(marker));

		await fireEvent.click(screen.getByRole('button', { name: /^Errors/ }));
		expect(rowTexts()).toEqual(['W', 'A'].map(marker));
		await fireEvent.click(screen.getByRole('button', { name: /^Errors/ }));

		expect(rowTexts()).toEqual(['E', 'W', 'A'].map(marker));
	});

	test('returns to rank order when Review is shown again after being hidden', async () => {
		const { controller } = lintedWorkbench(
			markedLines({ 1: 'E', 2: 'A', 5: 'W', 30: 'A' }),
			{},
			markers
		);
		await render(LinterPanel, { controller });
		await fireEvent.click(rowFor(marker('A')).querySelector('button')!);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove A' }));
		await waitFor(() => expect(lineOf('A')).toBe('Line 30'));
		expect(rowTexts()).toEqual(['E', 'A', 'W'].map(marker));

		controller.setActiveTab('performers');
		await frame();
		controller.setActiveTab('linter');

		await waitFor(() => expect(rowTexts()).toEqual(['E', 'W', 'A'].map(marker)));
	});

	test('forgets a collapse whose row left while another tab was showing', async () => {
		const { controller, editor } = lintedWorkbench(
			markedLines({ 1: 'A', 2: 'Y', 3: 'A' }),
			{},
			markers
		);
		await render(LinterPanel, { controller });
		await fireEvent.click(rowFor(marker('A')).querySelector('button')!);
		expect(rowFor(marker('A')).classList.contains('diagnostic-card--expanded')).toBe(false);

		controller.setActiveTab('performers');
		const places = controller.snapshot.diagnostics.filter((item) => item.message === marker('A'));
		editor.dispatchAtomic({
			baseRevision: controller.snapshot.revision,
			edits: places.map(({ from, to }) => ({ from, to, insert: '' }))
		});
		await frame();
		editor.dispatchAtomic({
			baseRevision: controller.snapshot.revision,
			edits: [{ from: 0, to: 0, insert: 'A' }]
		});
		controller.setActiveTab('linter');

		await waitFor(() => expect(rowTexts()).toEqual(['A', 'Y'].map(marker)));
		expect(rowFor(marker('A')).classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	/** The row's height with every reserve it carries taken off. */
	async function unreservedHeight(row: HTMLElement): Promise<number> {
		for (const styled of row.querySelectorAll<HTMLElement>('[style]'))
			styled.removeAttribute('style');
		await frame();
		return row.getBoundingClientRect().height;
	}

	test.each([
		['a grouped row on its tallest place', cityLightsPasted, comma],
		['a row with one place', '[Verse]\nKeep going,\nStill here', comma]
	])('adds not even a fraction of a pixel to %s', async (_label, text, message) => {
		const { controller } = lintedWorkbench(text);
		const view = await render(LinterPanel, { controller });
		view.container.style.width = '390px';
		// A font size that sets no line on a whole pixel, so a rounded reserve shows.
		view.container.style.setProperty('--font-size-sm', '13.3px');
		await fireEvent.click(rowFor(message).querySelector('button')!);
		if (!rowFor(message).classList.contains('diagnostic-card--expanded'))
			await fireEvent.click(rowFor(message).querySelector('button')!);
		await frame();
		const row = rowFor(message);
		const height = row.getBoundingClientRect().height;
		expect(Number.isInteger(height)).toBe(false);
		expect(await unreservedHeight(row)).toBe(height);
	});

	test('measures its reserve afresh when the panel gets wider', async () => {
		const { controller } = lintedWorkbench(
			'[Verse]\nOne line\n\nChorus\nTwo line\n\nchorus\nThree line\n\nCHORUS:\nFour line'
		);
		const view = await render(LinterPanel, { controller });
		const row = () => view.container.querySelector<HTMLElement>('.diagnostic-card--expanded')!;
		view.container.style.width = '260px';
		await frame();
		const narrow = row().getBoundingClientRect().height;
		view.container.style.width = '440px';
		await frame();
		await frame();
		const widened = row().getBoundingClientRect().height;

		// Opened afresh at the wider width, the row reserves only what that width needs.
		const head = row().querySelector('button')!;
		await fireEvent.click(head);
		await fireEvent.click(head);
		await frame();
		expect(widened).toBeLessThan(narrow);
		expect(widened).toBe(row().getBoundingClientRect().height);
	});

	test.each([363, 390])(
		'keeps a grouped row’s meta as tall as a lone finding’s at %ipx',
		async (width) => {
			const meta = async (text: string) => {
				const view = await render(LinterPanel, { controller: lintedWorkbench(text).controller });
				view.container.style.width = `${width}px`;
				return () =>
					within(view.container)
						.getByRole('button', { name: `Go to ${comma}` })
						.closest('li')!
						.querySelector<HTMLElement>('.diagnostic-meta__row')!;
			};
			const grouped = await meta(cityLightsPasted);
			// The same rule's meta with a line number in place of the count, measured
			// in the same run, so the fonts installed cannot decide the outcome.
			const lone = await meta('[Verse]\nKeep going,\nStill here');
			await frame();
			expect(grouped().querySelector('.diagnostic-meta__line')?.textContent).toBe('10 places');
			expect(grouped().querySelector('.diagnostic-meta__derivation')).not.toBeNull();
			expect(
				grouped().querySelector('.diagnostic-meta__disclosure, .source-citation')
			).not.toBeNull();
			expect(lone().querySelector('.diagnostic-meta__line')?.textContent).toBe('Line 2');
			expect(grouped().getBoundingClientRect().height).toBe(lone().getBoundingClientRect().height);
		}
	);

	test('holds the actions and the stepper still across places whose explanations wrap differently', async () => {
		const { controller } = lintedWorkbench(
			'[Verse]\nOne line\n\nChorus\nTwo line\n\nchorus\nThree line\n\nCHORUS:\nFour line'
		);
		const view = await render(LinterPanel, { controller });
		expect(screen.getByText(/^Place 1 of 3, /u)).toBeTruthy();
		const fix = () => screen.getByRole('button', { name: 'Use [Chorus]' });
		const stepper = () => screen.getByRole('group', { name: 'Places' });
		const explanation = () =>
			view.container.querySelector<HTMLElement>('.diagnostic-list__body .diagnostic-explanation')!;
		/** The open place's explanation without the reserve, the reference for it. */
		const natural = () => {
			explanation().style.minHeight = '0px';
			const height = explanation().getBoundingClientRect().height;
			explanation().style.removeProperty('min-height');
			return height;
		};
		const where = () => [fix().getBoundingClientRect().top, stepper().getBoundingClientRect().top];
		for (let width = 440; width >= 260; width -= 6) {
			view.container.style.width = `${width}px`;
			await frame();
			const heights: number[] = [];
			const anchor = where();
			for (const direction of ['Next place', 'Next place', 'Previous place', 'Previous place']) {
				heights.push(natural());
				await fireEvent.click(screen.getByRole('button', { name: direction }));
				await frame();
				expect(where()).toEqual(anchor);
			}
			// Exactly the tallest place's explanation at this width, nothing more.
			expect(explanation().getBoundingClientRect().height).toBe(Math.max(...heights));
		}

		const anchor = where();
		await fireEvent.click(fix());
		await waitFor(() => expect(screen.getByText(/^Place 1 of 2, /u)).toBeTruthy());
		await frame();
		expect(where()).toEqual(anchor);
	});

	test('starts each draft’s rows fresh and forgets a collapse whose row went away', async () => {
		const other = '[Verse]\nI’m fine\nYou’re here';
		const record = (id: string, text: string) => ({
			id,
			title: id,
			text,
			language: 'en',
			performers: [],
			createdAt: '2026-07-20T10:00:00.000Z',
			updatedAt: '2026-07-20T10:00:00.000Z',
			ruleSetVersion: '2026.7'
		});
		const { controller, editor } = lintedWorkbench(straddled, {
			drafts: [record('draft-1', straddled), record('draft-2', other)]
		});
		await render(LinterPanel, { controller });
		await fireEvent.click(rowFor(apostrophe).querySelector('button')!);
		expect(rowFor(apostrophe).classList.contains('diagnostic-card--expanded')).toBe(false);

		// The same question with every place answered leaves the list, then returns.
		const apostrophes = controller.snapshot.diagnostics.filter(
			(item) => item.message === apostrophe
		);
		editor.dispatchAtomic({
			baseRevision: controller.snapshot.revision,
			edits: apostrophes.map(({ from, to }) => ({ from, to, insert: "'" }))
		});
		await waitFor(() => expect(rowTexts()).toEqual([comma]));
		editor.dispatchAtomic({
			baseRevision: controller.snapshot.revision,
			edits: [{ from: 11, to: 12, insert: '’' }]
		});
		await waitFor(() => expect(rowTexts()).toEqual([apostrophe, comma]));
		expect(rowFor(apostrophe).classList.contains('diagnostic-card--expanded')).toBe(true);

		await fireEvent.click(rowFor(apostrophe).querySelector('button')!);
		expect(rowFor(apostrophe).classList.contains('diagnostic-card--expanded')).toBe(false);
		// Another draft opened from another tab starts its list over.
		controller.setActiveTab('linking');
		await controller.openDraft('draft-2');
		controller.onSnapshot({
			...controller.snapshot,
			diagnostics: lint(other, controller.snapshot.revision)
		});
		controller.setActiveTab('linter');
		await waitFor(() => expect(rowTexts()).toEqual([apostrophe]));
		expect(rowFor(apostrophe).classList.contains('diagnostic-card--expanded')).toBe(true);
	});

	test('keeps a lone finding’s row free of a stepper and reads its line', async () => {
		const { controller } = createTestWorkbench({ diagnostics: [spelling(0, 4, "I'ma")] });
		await render(LinterPanel, { controller });
		expect(screen.queryByRole('button', { name: 'Next place' })).toBeNull();
		expect(document.querySelector('.diagnostic-meta__line')?.textContent).toBe('Line 1');
	});
});

describe('retained-only review', () => {
	afterEach(cleanup);
	test.each([false, true])(
		'keeps unreviewed passage scope visible with findings=%s',
		async (findings) => {
			const imported = importDocument({
				text: 'Bonjour\nOther words',
				profile: 'genius',
				language: 'fr'
			});
			if (!imported.ok) throw new Error(imported.refusal.message);
			const projection = renderProfile(imported.value, 'genius');
			if (!projection.ok) throw new Error(projection.refusal.message);
			const assigned = resolveDecision(imported.value, projection.value, {
				kind: 'setPassageLanguage',
				range: { from: 8, to: 19 },
				language: 'zz-Latn-custom'
			});
			if (!assigned.ok) throw new Error(assigned.refusal.message);
			const { controller } = createTestWorkbench({
				text: projection.value.text,
				diagnostics: findings ? [prose(0, 7)] : []
			});
			controller.onSnapshot({
				...controller.snapshot,
				conversion: createConversionEnvelope(
					assigned.value.document,
					'genius',
					profilePolicyVersions
				)
			});
			const original = JSON.stringify(controller.snapshot.conversion);
			await render(LinterPanel, { controller });
			expect(
				screen.getByText('zz-Latn-custom: language-independent checks and conversion only.')
			).toBeVisible();
			await fireEvent.click(screen.getByText('Checking coverage'));
			expect(screen.getByText('Reviewed language-specific rules: French.')).toBeVisible();
			expect(
				screen.getByText('Optional English grammar checking is available in both lyric formats.')
			).toBeVisible();
			expect(JSON.stringify(controller.snapshot.conversion)).toBe(original);
		}
	);
	test('opens the actual retained section from an empty transcription', async () => {
		const imported = importDocument({ text: '[Verse]', profile: 'genius', language: 'en' });
		if (!imported.ok) throw new Error(imported.refusal.message);
		const projected = renderProfile(imported.value, 'musixmatch');
		if (!projected.ok) throw new Error(projected.refusal.message);
		const { controller } = createTestWorkbench({
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions),
			text: projected.value.text,
			diagnostics: []
		});
		await render(LinterPanel, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'View retained details' }));
		expect(controller.requestedSection).toEqual({
			id: imported.value.sections[0]!.id,
			origin: 'review'
		});
		await render(SongPanel, { controller });
		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Section 1 · Verse' })).toHaveFocus()
		);
		expect(screen.queryByRole('heading', { name: 'Add a section' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Back to Review' })).toBeVisible();
		expect(controller.snapshot.conversion?.model).toEqual(imported.value);
	});

	test('puts lyric findings before retained decisions without a one-item pager', async () => {
		const imported = importDocument({
			text: '[Custom verse: Mira]\nI counted 2 stars',
			profile: 'genius',
			language: 'en'
		});
		if (!imported.ok) throw new Error(imported.refusal.message);
		const rendered = renderProfile(imported.value, 'musixmatch');
		if (!rendered.ok) throw new Error(rendered.refusal.message);
		const { controller } = createTestWorkbench({
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions),
			text: rendered.value.text,
			diagnostics: [
				diagnostic({
					ruleId: 'mxm.numbers.context',
					message: 'Confirm this number’s meaning before converting it.',
					severity: 'manual-review',
					from: 10,
					to: 11
				})
			]
		});
		const view = await render(LinterPanel, { controller });
		const finding = screen.getByRole('button', { name: 'Review quantity' });
		const retained = screen.getByRole('region', { name: 'Retained details needing review' });
		expect(finding.getBoundingClientRect().bottom).toBeLessThan(
			retained.getBoundingClientRect().top
		);
		expect(view.container.querySelector('.diagnostic-list')).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Musixmatch section type' })).toBeVisible();
		expect(screen.queryByRole('button', { name: 'Previous detail' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Next detail' })).toBeNull();
		expect(screen.queryByText('No further issues detected.')).toBeNull();
	});

	test('shows the actionable detail without a duplicate empty state and preserves checker errors', async () => {
		const imported = importDocument({
			text: '[Custom opening]\nOne',
			profile: 'genius',
			language: 'en'
		});
		if (!imported.ok) throw new Error(imported.refusal.message);
		const rendered = renderProfile(imported.value, 'musixmatch');
		if (!rendered.ok) throw new Error(rendered.refusal.message);
		const { controller } = createTestWorkbench({
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions),
			text: rendered.value.text,
			diagnostics: []
		});
		const view = await render(LinterPanel, { controller });
		expect(screen.getByRole('region', { name: 'Retained details needing review' })).toBeVisible();
		expect(screen.getByRole('combobox', { name: 'Musixmatch section type' })).toBeVisible();
		expect(view.container.querySelector('.diagnostic-list__empty')).toBeNull();
		await view.rerender({ controller, nativeRulesStatus: 'failed' });
		expect(screen.getByText('Checking unavailable')).toBeVisible();
		expect(screen.getByRole('button', { name: 'Retry checking' })).toBeVisible();
		await view.rerender({ controller, nativeRulesStatus: 'ready' });
		expect(view.container.querySelector('.diagnostic-list__empty')).toBeNull();
	});
});
