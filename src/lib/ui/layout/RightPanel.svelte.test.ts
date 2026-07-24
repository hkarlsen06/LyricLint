import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
		await fireEvent.click(screen.getByRole('button', { name: 'Go to Add a section header' }));
		expect(calls.revealed).toEqual([{ from: 9, to: 13 }]);
		expect(calls.selections).toEqual([{ anchor: 9, head: 13 }]);
		expect(calls.focusCount).toBe(1);

		expect(screen.queryByRole('group', { name: 'Filter diagnostics by severity' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
		const warningChip = screen.getByRole('button', { name: /Warnings/ });
		expect(warningChip.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(warningChip);
		expect(warningChip.getAttribute('aria-pressed')).toBe('false');
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByText('Close this section header')).toBeTruthy();
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

		await fireEvent.click(screen.getByRole('button', { name: 'Ignore this session' }));
		expect(controller.ignoredRuleCount).toBe(1);
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByTestId('live-region').textContent).toContain('Ignored');

		const ignoredToggle = screen.getByRole('button', { name: /rule ignored/ });
		await waitFor(() => expect(document.activeElement).toBe(ignoredToggle));
		await fireEvent.click(ignoredToggle);
		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
		expect(controller.ignoredRuleCount).toBe(0);
		expect(screen.getByText('Add a section header')).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(ignoredToggle));

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		expect(controller.ignoredRuleCount).toBe(1);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Ignored section.header-missing again'
			)
		);
	});
});
