import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { docsPages } from '$lib/docs/catalog.js';
import DocsSearch from './DocsSearch.svelte';

// A real section rather than an invented one, so the test follows the catalog.
const target = docsPages.find(({ sections }) => sections.length > 1)!;
const section = target.sections.at(-1)!;

let followed: string | undefined;
function holdNavigation(event: MouseEvent) {
	const link = (event.target as Element | null)?.closest('a');
	if (!link) return;
	followed = link.getAttribute('href') ?? undefined;
	event.preventDefault();
}

afterEach(async () => {
	document.removeEventListener('click', holdNavigation, true);
	followed = undefined;
	await cleanup();
});

describe('DocsSearch', () => {
	it('finds a section and follows it on Enter, closing itself', async () => {
		document.addEventListener('click', holdNavigation, true);
		await render(DocsSearch, { open: true });

		await page.getByRole('combobox').fill(section.title);
		const option = page.getByRole('option', { name: new RegExp(section.title, 'u') }).first();
		await expect.element(option).toHaveAttribute('href', `/docs/${target.slug}/#${section.id}`);

		await userEvent.keyboard('{Enter}');
		expect(followed).toMatch(/^\/docs\//u);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('carries the words to the transcription guide', async () => {
		await render(DocsSearch, { open: true });
		await page.getByRole('combobox').fill('verse headers');
		await expect
			.element(page.getByRole('option', { name: /Search the guide for “verse headers”/u }))
			.toHaveAttribute('href', '/guidelines/?q=verse+headers');
	});

	it('closes on Escape and on its close control', async () => {
		await render(DocsSearch, { open: true });
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

		await userEvent.keyboard('/');
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('opens on Mod-K anywhere, but leaves a typed slash to the field', async () => {
		await render(DocsSearch, { open: false });
		const field = document.createElement('input');
		document.body.append(field);
		try {
			field.focus();
			await userEvent.keyboard('/');
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(field.value).toBe('/');

			await userEvent.keyboard('{Control>}k{/Control}');
			await expect.element(page.getByRole('dialog')).toBeInTheDocument();
		} finally {
			field.remove();
		}
	});
});
