import { describe, expect, test } from 'vitest';
import { rightPanelTabFromUrl, urlForRightPanelTab } from './panel-url.js';

describe('right panel URL state', () => {
	test.each([
		['https://lyriclint.app/workbench', 'linter'],
		['https://lyriclint.app/workbench?panel=linter', 'linter'],
		['https://lyriclint.app/workbench?panel=linking', 'linking'],
		['https://lyriclint.app/workbench?panel=performers', 'performers'],
		['https://lyriclint.app/workbench?panel=song', 'song'],
		['https://lyriclint.app/workbench?panel=preferences', 'preferences'],
		// `tools` was the id of the catch-all tab before it split; a shared link
		// lands on the song half, which is where its metadata and exports now live.
		['https://lyriclint.app/workbench?panel=tools', 'song'],
		['https://lyriclint.app/workbench?panel=assistant', 'assistant'],
		['https://lyriclint.app/workbench?panel=unknown', 'linter']
	] as const)('reads %s as %s', (href, expected) => {
		expect(rightPanelTabFromUrl(new URL(href))).toBe(expected);
	});

	test('round-trips the assistant panel', () => {
		const next = urlForRightPanelTab(
			new URL('https://lyriclint.app/workbench?draft=one'),
			'assistant'
		);

		expect(next.href).toBe('https://lyriclint.app/workbench?draft=one&panel=assistant');
		expect(rightPanelTabFromUrl(next)).toBe('assistant');
	});

	test('preserves unrelated URL state when selecting a panel', () => {
		const next = urlForRightPanelTab(
			new URL('https://lyriclint.app/workbench?draft=one#diagnostic'),
			'performers'
		);

		expect(next.href).toBe('https://lyriclint.app/workbench?draft=one&panel=performers#diagnostic');
	});

	test('uses the clean URL for the default linter panel', () => {
		const next = urlForRightPanelTab(
			new URL('https://lyriclint.app/workbench?draft=one&panel=tools#diagnostic'),
			'linter'
		);

		expect(next.href).toBe('https://lyriclint.app/workbench?draft=one#diagnostic');
	});
});
