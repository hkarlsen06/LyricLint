import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';
import Workspace from './Workspace.svelte';

describe('Workspace and toolbar', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	test('copies the exact canonical string and announces copy completion', async () => {
		const canonical = '[Chorus: A & B]\r\n<i>歌 é 🎤</i>';
		const writeText = vi.fn(async () => {});
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { controller, feedback } = createTestWorkbench({ text: canonical });
		render(DocumentToolbar, { controller });
		render(LiveRegion, { feedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Copy Genius markup' }));
		expect(writeText).toHaveBeenCalledWith(canonical);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Canonical Genius markup copied'
			)
		);
	});

	test('opens the editor section picker from the toolbar', async () => {
		const { controller, calls } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Insert section' }));

		expect(calls.sectionHeaderRequestCount).toBe(1);
	});

	test('reflects a late autosave failure instead of remaining on saving', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		controller.setSaveStatus('saving');
		await waitFor(() =>
			expect(screen.getByLabelText('Autosave status').textContent).toContain('Saving')
		);
		controller.setSaveStatus('failed');

		await waitFor(() =>
			expect(screen.getByLabelText('Autosave status').textContent).toContain('Save failed')
		);
	});

	test('moves focus to the Performers tab when assignment is opened from the toolbar', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn().mockReturnValue({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			})
		);
		const { controller } = createTestWorkbench();
		render(Workspace, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Assign performer' }));

		const performersTab = screen.getByRole('tab', { name: 'Performers' });
		await waitFor(() => expect(document.activeElement).toBe(performersTab));
		expect(controller.activeTab).toBe('performers');
	});

	test('collapses the panel at a narrow viewport while keeping the editor region visible', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn().mockReturnValue({
				matches: true,
				media: '(max-width: 68rem)',
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			})
		);
		const { controller } = createTestWorkbench();
		render(Workspace, { controller });

		await waitFor(() => expect(controller.panelCollapsed).toBe(true));
		const editorRegion = screen.getByTestId('editor-region');
		expect(editorRegion).toBeTruthy();
		expect(getComputedStyle(editorRegion).display).not.toBe('none');
		expect(screen.getAllByRole('button', { name: 'Show right panel' })).toHaveLength(2);
	});
});
