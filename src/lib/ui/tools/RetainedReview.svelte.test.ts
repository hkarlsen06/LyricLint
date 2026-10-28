import { fireEvent, screen } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import RetainedReview from './RetainedReview.svelte';

afterEach(cleanup);

test('reviews one retained detail at a time without moving navigation for long messages', async () => {
	const { controller } = createTestWorkbench();
	const findings = [
		{ id: 'first', sectionId: 'one', message: 'Choose the section tag.' },
		{
			id: 'second',
			sectionId: 'two',
			message:
				'Choose a section tag for the very long original section and performer label. '.repeat(5)
		}
	];
	const view = await render(RetainedReview, { controller, findings });
	view.container.style.width = '300px';
	const next = screen.getByRole('button', { name: 'Next detail' });
	const top = next.getBoundingClientRect().top;
	const message = () => view.container.querySelector('[aria-live="polite"]')?.textContent;
	expect(message()).toBe(findings[0].message);
	await fireEvent.click(next);
	expect(message()).toBe(findings[1].message);
	expect(next.getBoundingClientRect().top).toBe(top);
	expect(next).toBeDisabled();
	expect(screen.getAllByRole('button', { name: 'Review in Song' })).toHaveLength(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Review in Song' }));
	expect(controller.requestedSectionId).toBe('two');
	await view.rerender({ controller, findings: findings.slice(0, 1) });
	expect(message()).toBe(findings[0].message);
	expect(screen.queryByRole('button', { name: 'Next detail' })).toBeNull();
});
