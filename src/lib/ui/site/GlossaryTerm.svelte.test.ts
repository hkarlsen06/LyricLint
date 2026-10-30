import { within } from '@testing-library/dom';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CodeProse from './CodeProse.svelte';

describe('guide term definitions', () => {
	it('is opt-in, keeps literal text intact, and explains each term once per passage', async () => {
		const text = 'The linter checks `linter` and annotations; linters do not listen.';
		const view = await render(CodeProse, { text });
		expect(within(view.container).queryAllByRole('button')).toHaveLength(0);
		await view.rerender({ glossary: true });
		expect(view.container.textContent).toBe(text.replaceAll('`', ''));
		expect(within(view.container).getAllByRole('button')).toHaveLength(2);
		expect(view.container.querySelector('code')?.textContent).toBe('linter');
		expect(view.container.querySelector('code button')).toBeNull();
	});

	it('preserves search marks within the term and restores focus after Escape or Close', async () => {
		const mark = createRawSnippet((text: () => string) => ({
			render: () => `<mark>${text()}</mark>`
		}));
		const view = await render(CodeProse, { text: 'A linter checks text.', glossary: true, mark });
		const trigger = page.getByRole('button', { name: 'linter: show definition' });
		expect(view.container.querySelector('button mark')?.textContent).toBe('linter');
		await trigger.click();
		await expect.element(page.getByRole('dialog', { name: 'Linter' })).toBeVisible();
		const dialog = within(view.container).getByRole('dialog');
		expect(document.activeElement).toBe(dialog);
		expect(dialog.textContent).toContain('It does not listen to the recording');
		await userEvent.keyboard('{Escape}');
		await expect.element(trigger).toHaveFocus();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		await userEvent.keyboard('{Enter}');
		await page.getByRole('button', { name: 'Close definition' }).click();
		await expect.element(trigger).toHaveFocus();
		expect(view.container.textContent).toBe('A linter checks text.');
	});

	it('keeps one definition open, toggles from its word, and follows outside focus', async () => {
		const view = await render(CodeProse, { text: 'A linter reads annotations.', glossary: true });
		const linter = page.getByRole('button', { name: 'linter: show definition' });
		const annotation = page.getByRole('button', { name: 'annotations: show definition' });
		await linter.click();
		await annotation.click();
		expect(within(view.container).getAllByRole('dialog')).toHaveLength(1);
		await expect.element(page.getByRole('dialog', { name: 'Annotation' })).toBeVisible();
		await annotation.click();
		expect(within(view.container).queryByRole('dialog')).toBeNull();
		await linter.click();
		const outside = document.createElement('button');
		outside.textContent = 'Outside control';
		view.container.append(outside);
		try {
			await page.getByRole('button', { name: 'Outside control' }).click();
			expect(document.activeElement).toBe(outside);
			expect(within(view.container).queryByRole('dialog')).toBeNull();
		} finally {
			outside.remove();
		}
	});

	it.each([1440, 320])(
		'keeps the paragraph still and the definition inside the %ipx viewport',
		async (width) => {
			await page.viewport(width, 700);
			const view = await render(CodeProse, {
				text: 'A long explanation leaves room to describe exactly what the linter checks, without moving the text.',
				glossary: true
			});
			view.container.style.padding = '16px';
			view.container.style.marginTop = '450px';
			try {
				const button = within(view.container).getByRole('button');
				const before = button.getBoundingClientRect();
				const height = view.container.getBoundingClientRect().height;
				await page.getByRole('button', { name: 'linter: show definition' }).click();
				const after = button.getBoundingClientRect();
				expect(after.x).toBe(before.x);
				expect(after.y).toBe(before.y);
				expect(view.container.getBoundingClientRect().height).toBe(height);
				const box = within(view.container).getByRole('dialog').getBoundingClientRect();
				expect(box.left).toBeGreaterThanOrEqual(0);
				expect(box.right).toBeLessThanOrEqual(width);
				expect(box.top).toBeGreaterThanOrEqual(0);
				expect(box.bottom).toBeLessThanOrEqual(700);
			} finally {
				await view.unmount();
				await page.viewport(800, 600);
			}
		}
	);
});
