import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Select from './select.svelte';

const options = [
	{ value: 'verse', label: 'Verse' },
	{ value: 'chorus', label: 'Chorus', detail: 'The part that comes back' },
	{ value: 'bridge', label: 'Bridge', disabled: true }
] as const;

describe('Select', () => {
	it('is a combobox named by its label that shows the chosen label or the placeholder', async () => {
		const view = await render(Select<string>, {
			label: 'Section type',
			placeholder: 'Type not set',
			value: '',
			options,
			onchange: () => {}
		});
		const trigger = page.getByRole('combobox', { name: 'Section type' });
		await expect.element(trigger).toHaveTextContent('Type not set');

		await view.rerender({ value: 'chorus' });
		await expect.element(trigger).toHaveTextContent('Chorus');
		await expect.element(trigger).not.toHaveTextContent('Type not set');
	});

	it('keeps a hidden label as the accessible name', async () => {
		await render(Select<string>, {
			label: 'Playback speed',
			labelHidden: true,
			value: 'verse',
			options,
			onchange: () => {}
		});
		await expect.element(page.getByRole('combobox', { name: 'Playback speed' })).toBeVisible();
	});

	it('calls onchange with the chosen value and leaves the trigger to the parent', async () => {
		const onchange = vi.fn();
		await render(Select<string>, { label: 'Section type', value: 'verse', options, onchange });
		const trigger = page.getByRole('combobox', { name: 'Section type' });

		await trigger.click();
		await page.getByRole('option', { name: /Chorus/ }).click();

		expect(onchange).toHaveBeenCalledExactlyOnceWith('chorus');
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
		// The parent did not take the change, so the control still says what it was given.
		await expect.element(trigger).toHaveTextContent('Verse');
	});

	it('closes on Escape and hands focus back to the trigger', async () => {
		const onchange = vi.fn();
		await render(Select<string>, { label: 'Section type', value: 'verse', options, onchange });
		const trigger = page.getByRole('combobox', { name: 'Section type' });

		await trigger.click();
		await expect.element(page.getByRole('listbox')).toBeVisible();
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(onchange).not.toHaveBeenCalled();
	});
});
