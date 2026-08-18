import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GuidanceAuthority } from '$lib/guidance/guidance.js';
import AuthorityLadder from './AuthorityLadder.svelte';

function ladder() {
	const steps = [...document.querySelectorAll<HTMLElement>('.site-ladder__step')];
	return {
		total: steps.length,
		met: steps.filter((step) => step.classList.contains('site-ladder__step--met')).length
	};
}

describe('AuthorityLadder', () => {
	it('draws four steps at every tier, filled to the tier the sources establish', () => {
		const filled: Record<GuidanceAuthority, number> = {
			staff: 4,
			editorial: 3,
			external: 2,
			community: 1,
			lyriclint: 1
		};
		for (const [authority, met] of Object.entries(filled)) {
			document.body.innerHTML = '';
			render(AuthorityLadder, { authority: authority as GuidanceAuthority });
			expect(ladder(), authority).toEqual({ total: 4, met });
		}
	});

	it('a LyricLint advisory holds the bottom step, level with community guidance', () => {
		// One filled bar, not zero and not a missing ladder: our own preference
		// ranks with unreviewed community writing, and a row with no ladder at
		// all would read as a different kind of fact rather than as the lowest
		// rung of the same one.
		render(AuthorityLadder, { authority: 'lyriclint' });
		expect(ladder()).toEqual({ total: 4, met: 1 });
	});

	it('is hidden from assistive technology — the tier label beside it is the fact', () => {
		render(AuthorityLadder, { authority: 'staff' });
		expect(document.querySelector('.site-ladder')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('separates a met step from an unmet one by fill, not by opacity', () => {
		render(AuthorityLadder, { authority: 'editorial' });
		const steps = [...document.querySelectorAll<HTMLElement>('.site-ladder__step')];
		const met = getComputedStyle(steps[0]!);
		const unmet = getComputedStyle(steps[3]!);
		expect(met.backgroundColor).not.toBe(unmet.backgroundColor);
		expect(met.opacity).toBe('1');
		expect(unmet.opacity).toBe('1');
	});
});
