import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, test } from 'vitest';
import LiveRegion from '../primitives/LiveRegion.svelte';
import ToastRegion from '../primitives/ToastRegion.svelte';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import RightPanel from './RightPanel.svelte';

describe('RightPanel', () => {
	afterEach(cleanup);

	test('switches tabs with keyboard-operable Bits UI tabs', async () => {
		const { controller } = createTestWorkbench();
		render(RightPanel, { controller });

		const performersTab = screen.getByRole('tab', { name: 'Performers' });
		await fireEvent.click(performersTab);
		expect(controller.activeTab).toBe('performers');
		expect(screen.getByText('Add performer')).toBeTruthy();

		performersTab.focus();
		await fireEvent.keyDown(performersTab, { key: 'ArrowRight' });
		await waitFor(() => expect(controller.activeTab).toBe('tools'));
		expect(document.activeElement?.textContent).toContain('Tools');
	});

	test('mirrors diagnostics, filters severity, and navigates to the exact editor range', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		const diagnosticButtons = screen.getAllByRole('button', { name: /^Go to/ });
		expect(diagnosticButtons[0]?.textContent).toContain('Close this section header');
		const warningButton = screen.getByRole('button', { name: 'Go to Add a section header' });
		await fireEvent.click(warningButton);
		expect(calls.revealed).toEqual([{ from: 9, to: 13 }]);
		expect(calls.selections).toEqual([{ anchor: 9, head: 13 }]);
		expect(calls.navigation).toEqual(['selection', 'reveal']);
		expect(calls.focusCount).toBe(1);
		expect(warningButton.closest('li')?.classList.contains('diagnostic-card--active')).toBe(true);

		controller.navigateToDiagnostic(error);
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Go to Close this section header' })
					.closest('li')
					?.classList.contains('diagnostic-card--active')
			).toBe(true)
		);

		// The filters have no button of their own: the Linter tab reveals them.
		expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull();
		expect(screen.queryByRole('group', { name: 'Filter diagnostics by severity' })).toBeNull();
		await fireEvent.click(screen.getByRole('tab', { name: /Linter/ }));
		expect(screen.getByRole('group', { name: 'Filter diagnostics by severity' })).toBeTruthy();
		const warningChip = screen.getByRole('button', { name: /Warnings/ });
		expect(warningChip.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(warningChip);
		expect(warningChip.getAttribute('aria-pressed')).toBe('false');
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByText('Close this section header')).toBeTruthy();
	});

	test('hangs the severity filters off the Linter tab, pressed from inside the linter', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller, feedback } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });
		render(LiveRegion, { feedback });

		const linterTab = screen.getByRole('tab', { name: /Linter/ });
		const filters = () => screen.queryByRole('group', { name: 'Filter diagnostics by severity' });
		expect(filters()).toBeNull();

		// Pressed while already inside the linter, the tab is the toggle.
		await fireEvent.click(linterTab);
		await waitFor(() => expect(filters()).toBeTruthy());
		expect(screen.getByTestId('live-region').textContent).toContain('Severity filters shown');
		await fireEvent.click(linterTab);
		await waitFor(() => expect(filters()).toBeNull());
		expect(screen.getByTestId('live-region').textContent).toContain('Severity filters hidden');

		// Coming back from another panel only comes back; it does not also open them.
		await fireEvent.click(screen.getByRole('tab', { name: 'Performers' }));
		await fireEvent.click(linterTab);
		await waitFor(() => expect(controller.activeTab).toBe('linter'));
		expect(filters()).toBeNull();

		// Bits UI activates Enter from keydown and prevents the click that would
		// otherwise follow, so the keyboard path cannot ride on the click handler.
		await fireEvent.keyDown(linterTab, { key: 'Enter' });
		await waitFor(() => expect(filters()).toBeTruthy());
	});

	test('runs the diagnostics as one gapless column with the selected row recessed', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		// No gap and no rounding: the cards read as one run of sections, seamed by
		// a hairline rather than separated by bands of canvas.
		const list = document.querySelector('.diagnostic-list')!;
		const listStyle = getComputedStyle(list);
		expect(listStyle.rowGap).toBe('0px');

		const rows = [...list.children] as HTMLElement[];
		expect(rows).toHaveLength(2);
		expect(getComputedStyle(rows[0]!).borderRadius).toBe('0px');
		expect(getComputedStyle(rows[0]!).borderBottomWidth).toBe('1px');
		expect(getComputedStyle(rows[1]!).borderBottomWidth).toBe('0px');

		// The expanded row sits at the recessed elevation, darker than its
		// neighbour, with an inner shadow so it reads as cut into the column.
		const expanded = rows.find((row) => row.classList.contains('diagnostic-card--expanded'))!;
		const closed = rows.find((row) => !row.classList.contains('diagnostic-card--expanded'))!;
		expect(getComputedStyle(expanded).backgroundColor).not.toBe(
			getComputedStyle(closed).backgroundColor
		);
		expect(getComputedStyle(expanded).boxShadow).toContain('inset');

		// The severity tag is squared off, not a pill.
		const severity = expanded.querySelector('.severity')!;
		expect(getComputedStyle(severity).borderRadius).toBe('4px');
	});

	test('makes the whole card the target and gives its title no link treatment', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		const row = screen
			.getByRole('button', { name: 'Go to Add a section header' })
			.closest('li') as HTMLElement;
		const control = row.querySelector('.diagnostic-list__navigate') as HTMLElement;

		// The card's inset lives on the button, not on the row, so there is no
		// border of dead space around the heading where a press does nothing.
		expect(getComputedStyle(row).padding).toBe('0px');
		expect(control.getBoundingClientRect().width).toBe(row.getBoundingClientRect().width);

		// The message is a heading inside a pressable card, not a link out of it:
		// hovering it leaves the title's color and underline alone and moves the
		// whole row instead.
		const title = control.querySelector('.diagnostic-list__title') as HTMLElement;
		const restingColor = getComputedStyle(title).color;
		const restingRowBackground = getComputedStyle(control).backgroundColor;
		await userEvent.hover(title);
		expect(getComputedStyle(title).textDecorationLine).toBe('none');
		expect(getComputedStyle(title).color).toBe(restingColor);
		expect(getComputedStyle(control).backgroundColor).not.toBe(restingRowBackground);

		// Severity tag and line number sit inside the control, so pressing either
		// of them opens the diagnostic just as pressing the message does.
		expect(control.querySelector('.severity')).not.toBeNull();
		expect(control.querySelector('.diagnostic-list__subtitle')).not.toBeNull();
		await fireEvent.click(control.querySelector('.severity')!);
		expect(calls.revealed).toEqual([{ from: 9, to: 13 }]);
	});

	test('ignores, restores, and undo-restores a rule while announcing each action', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller, feedback } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });
		render(ToastRegion, { feedback });
		render(LiveRegion, { feedback });

		expect(screen.queryByRole('button', { name: 'Ignore this session' })).toBeNull();
		// The ignored-rules footer stays out of the panel until it has something
		// to list.
		expect(screen.queryByRole('button', { name: /ignored/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
		expect(controller.ignoredRuleCount).toBe(1);
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByTestId('live-region').textContent).toContain('Ignored');

		const ignoredToggle = screen.getByRole('button', { name: /rule ignored/ });
		await waitFor(() => expect(document.activeElement).toBe(ignoredToggle));
		await fireEvent.click(ignoredToggle);
		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
		expect(controller.ignoredRuleCount).toBe(0);
		expect(screen.getByText('Add a section header')).toBeTruthy();
		// Restoring the last rule takes the footer with it, so focus lands on the
		// restored diagnostic rather than on a control that no longer exists.
		expect(screen.queryByRole('button', { name: /rule ignored/ })).toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				document.querySelector<HTMLButtonElement>('.diagnostic-list__navigate')
			)
		);

		// The toast's dismiss control is a real icon button, not a typeset ×.
		const dismiss = screen.getAllByRole('button', { name: 'Dismiss notification' }).at(-1)!;
		expect(dismiss.querySelector('svg')).not.toBeNull();
		expect(dismiss.textContent?.trim()).toBe('');

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		expect(controller.ignoredRuleCount).toBe(1);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Ignored section.header-missing again'
			)
		);
	});

	test('accepts an unrecognized header as correct for the session', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-unrecognized',
			severity: 'manual-review',
			message: 'Review the custom section header “Chor”.'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		expect(screen.queryByRole('button', { name: 'Ignore' })).toBeNull();
		const accept = screen.getByRole('button', { name: "It's correct" });
		expect(accept.querySelector('svg')).not.toBeNull();

		await fireEvent.click(accept);
		expect(controller.ignoredRuleIds).toContain('section.header-unrecognized');
		expect(screen.queryByText('Review the custom section header “Chor”.')).toBeNull();
	});

	test('opens the editor section picker from a missing-header diagnostic', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'This lyric section has no header.',
			from: 14,
			to: 14
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		expect(screen.queryByRole('button', { name: /Preview:/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Choose header' }));

		expect(calls.revealed).toEqual([{ from: 14, to: 14 }]);
		expect(calls.selections).toEqual([{ anchor: 14, head: 14 }]);
		expect(calls.navigation).toEqual(['selection', 'reveal']);
		expect(calls.sectionHeaderRequestCount).toBe(1);
	});

	test('invites lyrics and a language check while the document is empty', () => {
		const { controller } = createTestWorkbench({ text: '   \n\n', diagnostics: [] });
		render(RightPanel, { controller });

		expect(screen.getByText('Nothing to lint yet')).toBeTruthy();
		expect(
			screen.getByText(
				'Paste or write some lyrics to get started, and make sure the selected language is correct.'
			)
		).toBeTruthy();
		expect(screen.queryByText('No issues found')).toBeNull();
	});

	test('blames the filters for an empty linter list only when they are the cause', async () => {
		const { controller: clean } = createTestWorkbench({ diagnostics: [] });
		render(RightPanel, { controller: clean });
		expect(screen.getByText('No issues found')).toBeTruthy();
		expect(
			screen.getByText('This draft passes every enabled rule. Diagnostics reappear as you edit.')
		).toBeTruthy();
		cleanup();

		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		await fireEvent.click(screen.getByRole('tab', { name: /Linter/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		expect(screen.getByText('Hidden by filters')).toBeTruthy();
		expect(
			screen.getByText('1 issue is hidden by the severity filters. Re-enable a severity to see it.')
		).toBeTruthy();

		// Ignoring the rule is a separate reason for an empty list, so the copy
		// should stop pointing at the filters once they no longer hide anything.
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		controller.ignoreRule('section.header-missing');
		await waitFor(() => expect(screen.getByText('All issues ignored')).toBeTruthy());
		expect(
			screen.getByText(
				'Every issue in this draft comes from a rule you ignored. Restore rules from Ignored rules below.'
			)
		).toBeTruthy();
	});

	test('ends a populated list deliberately and counts what the filters hide', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header'
		});
		const { controller } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		// With every severity shown, the line after the last card closes the list.
		expect(screen.getByText('No further issues.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('tab', { name: /Linter/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		expect(screen.queryByText('No further issues.')).toBeNull();
		expect(screen.getByText('1 more issue hidden by the severity filters.')).toBeTruthy();
	});
});
