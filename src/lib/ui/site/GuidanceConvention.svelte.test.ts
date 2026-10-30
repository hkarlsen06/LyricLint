import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { guidanceEntries } from '#lib/guidance/entries.js';
import GuidanceConvention from './GuidanceConvention.svelte';

const entry = guidanceEntries.find((entry) => entry.id === 'guidance.spelling.elision-apostrophe')!;

describe('GuidanceConvention', () => {
	it('leads with the exact correct example, retains the incorrect example and all qualifications', async () => {
		const view = await render(GuidanceConvention, { entry });
		expect([...view.container.querySelectorAll('pre')].map((sample) => sample.textContent)).toEqual(
			[entry.example?.correct, entry.example?.incorrect]
		);
		expect(view.container.textContent).toContain(entry.note);
		expect(view.container.querySelector('strong')?.textContent).toBe('Exceptions and context:');
		expect(view.container.querySelectorAll('.source-citation a')).toHaveLength(
			entry.sourceIds.length
		);
		expect(view.container.querySelector('details, button[aria-expanded]')).toBeNull();
	});
});
