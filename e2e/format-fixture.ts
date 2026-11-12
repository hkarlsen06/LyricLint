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

export async function exportOutput(page: Page, profile: 'Genius' | 'Musixmatch', expected: string) {
	await page.getByRole('button', { name: `Export to ${profile}`, exact: true }).click();
	await expect(page.getByRole('textbox', { name: `${profile} output` })).toHaveValue(expected);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
}
