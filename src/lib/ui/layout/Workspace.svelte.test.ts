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

	test('keeps the header to the mockup surface: drafts affordances, copy pill, no edit buttons', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		// The single visible command is the high-contrast copy pill; section
		// insertion, performer assignment, and undo/redo stay reachable through
		// the editor itself (ghost pill, selection card, and Mod+Z shortcuts).
		expect(screen.getByRole('button', { name: 'Copy Genius markup' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open drafts menu' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Insert section' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Assign performer' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Undo document edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Redo document edit' })).toBeNull();
	});

	test('the checklist mark toggles the drafts menu popover', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const mark = screen.getByRole('button', { name: 'Open drafts menu' });
		expect(mark.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(mark);
		expect(mark.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByText('Saved drafts')).toBeTruthy();
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
