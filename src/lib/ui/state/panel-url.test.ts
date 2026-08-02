import { describe, expect, test } from 'vitest';
import { rightPanelTabFromUrl, urlForRightPanelTab } from './panel-url.js';

describe('right panel URL state', () => {
	test.each([
		['https://lyriclint.app/lint', 'linter'],
		['https://lyriclint.app/lint?panel=linter', 'linter'],
		['https://lyriclint.app/lint?panel=performers', 'performers'],
		['https://lyriclint.app/lint?panel=tools', 'tools'],
		['https://lyriclint.app/lint?panel=assistant', 'assistant'],
		['https://lyriclint.app/lint?panel=unknown', 'linter']
	] as const)('reads %s as %s', (href, expected) => {
		expect(rightPanelTabFromUrl(new URL(href))).toBe(expected);
	});

	test('round-trips the assistant panel', () => {
		const next = urlForRightPanelTab(new URL('https://lyriclint.app/lint?draft=one'), 'assistant');

		expect(next.href).toBe('https://lyriclint.app/lint?draft=one&panel=assistant');
		expect(rightPanelTabFromUrl(next)).toBe('assistant');
	});

	test('preserves unrelated URL state when selecting a panel', () => {
		const next = urlForRightPanelTab(
			new URL('https://lyriclint.app/lint?draft=one#diagnostic'),
			'performers'
		);

		expect(next.href).toBe('https://lyriclint.app/lint?draft=one&panel=performers#diagnostic');
	});

	test('uses the clean URL for the default linter panel', () => {
		const next = urlForRightPanelTab(
			new URL('https://lyriclint.app/lint?draft=one&panel=tools#diagnostic'),
			'linter'
		);

		expect(next.href).toBe('https://lyriclint.app/lint?draft=one#diagnostic');
	});
});
