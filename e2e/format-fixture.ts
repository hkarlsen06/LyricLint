import { expect, type Page } from '@playwright/test';
import { conversionFixture } from '../src/lib/conversion/test-fixture.js';
import { serializeScribe } from '../src/lib/scribe/format.js';
import type { ProfileId } from '../src/lib/profiles/types.js';

/** Import a real saved rich primary, retaining Genius annotations and sections. */
export async function importPrimary(page: Page, text: string, profile: ProfileId = 'musixmatch') {
	const conversion = conversionFixture(text, profile);
	const source = serializeScribe({
		title: 'Rich primary',
		lyrics: conversion.projectionText,
		language: 'en',
		performers: [],
		lineAnchors: [],
		sectionLinks: [],
		ignoredDiagnostics: [],
		conversion
	});
	await page.getByRole('button', { name: "Open saved 'scribes", exact: true }).click();
	await page.locator('input[type=file][accept*=".lls"]').setInputFiles({
		name: 'primary.lls',
		mimeType: 'application/json',
		buffer: Buffer.from(source)
	});
	await expect
		.poll(() =>
			page
				.getByRole('textbox', { name: 'Lyrics editor', includeHidden: true })
				.evaluate((element) => {
					// SAFETY: The mounted CodeMirror content owns these optional EditorView attachments.
					const node = element as HTMLElement & {
						cmView?: { view: import('@codemirror/view').EditorView };
						cmTile?: { view: import('@codemirror/view').EditorView };
					};
					return (node.cmView ?? node.cmTile)?.view.state.doc.toString();
				})
		)
		.toBe(conversion.projectionText);
}

/**
 * Turn on Musixmatch tools in Preferences, which Genius drafts need for their export. Choosing
 * a format for a new draft sets the preference too, so call this after that choice.
 */
export async function enableMusixmatchTools(page: Page) {
	await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	const views = page.getByRole('navigation', { name: 'Workbench views' });
	const phone = await views.isVisible();
	if (phone) await views.getByRole('button', { name: 'Tools', exact: true }).click();
	await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
	// The new-draft tray draws the same switch; this one is the Preferences panel's.
	const toggle = page
		.getByRole('tabpanel', { name: 'Preferences', exact: true })
		.getByRole('switch', { name: 'Musixmatch tools' });
	if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	if (phone) await views.getByRole('button', { name: 'Write', exact: true }).click();
	else await page.getByRole('tab', { name: /^Review/u }).click();
	await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
}

export async function exportOutput(page: Page, profile: 'Genius' | 'Musixmatch', expected: string) {
	await page.getByRole('button', { name: `Export to ${profile}`, exact: true }).click();
	await expect(page.getByRole('textbox', { name: `${profile} output` })).toHaveValue(expected);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
}
