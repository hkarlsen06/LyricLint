import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
// The tooltip's geometry is asserted against the real tokens, not mocked ones.
import '$lib/ui/styles/global.css';
import type { Diagnostic, SourceReference } from '$lib/core/types.js';
import DiagnosticMeta from './DiagnosticMeta.svelte';

function source(id: string): SourceReference {
	return {
		id,
		url: `https://genius.com/${id}`,
		pageTitle: `Page ${id}`,
		sectionTitle: `Section ${id}`,
		retrievedAt: '2026-07-24',
		lastVerifiedAt: '2026-07-24',
		reviewStatus: 'reviewed'
	};
}

function diagnostic(sourceIds: string[]): Diagnostic {
	return {
		ruleId: 'line.trailing-period',
		severity: 'warning',
		from: 0,
		to: 4,
		message: 'Lyric lines should not end with a period.',
		explanation: 'Apple Music lyric guidance excludes periods at line endings.',
		sourceIds
	};
}

function sourcesFor(sourceIds: string[]): ReadonlyMap<string, SourceReference> {
	return new Map(sourceIds.map((id) => [id, source(id)]));
}

/** What the line says on screen, without the citation's screen-reader copy. */
function visibleText(node: Element): string {
	const clone = node.cloneNode(true) as Element;
	for (const hidden of clone.querySelectorAll('.sr-only')) {
		hidden.remove();
	}
	return clone.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}

describe('the diagnostic meta line', () => {
	it('reads as one sentence: severity, line, then what says so', async () => {
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(['G-LINES']),
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		// The severity is a glyph, so the line opens with the mark and no
		// interpunct after it — an interpunct separates facts of the same kind, and
		// the mark is not one of the words in the list it introduces.
		expect(visibleText(screen.container.querySelector('.diagnostic-meta__row')!)).toBe(
			'Line 47 · Page G-LINES'
		);

		// The severity is the mark that opens the line, not a badge above it, so
		// the line is one line high.
		const severity = screen.container.querySelector('.severity')!;
		expect(screen.container.querySelectorAll('.severity')).toHaveLength(1);
		expect(severity.querySelector('.severity-icon')).not.toBeNull();

		// The word left the screen, not the page: a screen reader still hears it,
		// and the pointer gets it from the tooltip.
		expect(severity.querySelector('.sr-only')?.textContent).toBe('Warning');
		expect(severity.getAttribute('title')).toBe('Warning');
		screen.unmount();
	});

	it('shows the section and verified date as the link tooltip, on hover and on focus', async () => {
		// Away from the viewport's top edge, where the tooltip takes its primary
		// placement — a card mounted at 0 exercises only the fallback.
		document.body.style.paddingTop = '300px';
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(['G-LINES']),
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		try {
			// Nothing is on screen until the reader asks for it by pointing at or
			// tabbing to the link — the card no longer carries this in a footer.
			expect(document.querySelector('.source-tooltip')).toBeNull();

			const link = page.getByRole('link', { name: /Page G-LINES/u });
			await link.hover();
			const tooltip = document.querySelector('.source-tooltip')!;
			expect(tooltip.textContent).toContain('Section G-LINES');
			expect(tooltip.textContent).toContain('2026-07-24');
			// Drawn again for the eye only: the accessible copy is the description the
			// link already points at, so nothing is announced twice.
			expect(tooltip.getAttribute('aria-hidden')).toBe('true');
			// Fixed, so neither the panel's scroller nor the popover's clips it.
			expect(getComputedStyle(tooltip).position).toBe('fixed');

			// Above the link, not below it: in the unfolded sources list a box under
			// the hovered link lands exactly on the next citation and hides the link
			// the pointer is travelling to. And a readout is never a target — the
			// box must not intercept the hover it reports on.
			const linkRect = link.element().getBoundingClientRect();
			expect(tooltip.getBoundingClientRect().bottom).toBeLessThanOrEqual(linkRect.top);
			expect(getComputedStyle(tooltip).pointerEvents).toBe('none');

			// The keyboard reaches it the same way the pointer does, and Escape closes
			// it without leaving the link.
			const anchor = link.element() as HTMLAnchorElement;
			anchor.dispatchEvent(new FocusEvent('focus'));
			expect(document.querySelector('.source-tooltip')).not.toBeNull();
			anchor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await vi.waitFor(() => expect(document.querySelector('.source-tooltip')).toBeNull());
		} finally {
			document.body.style.paddingTop = '';
			screen.unmount();
		}
	});

	it('folds two or more citations behind one control so the line stays one line', async () => {
		const ids = ['G-LINES', 'G-QE-MARKS'];
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(ids),
			sources: sourcesFor(ids),
			line: 47
		});

		// Two links inline wrapped the meta line onto a second and a third row.
		expect(screen.container.querySelectorAll('.diagnostic-meta__row a')).toHaveLength(0);
		const disclosure = page.getByRole('button', { name: 'Sources' });
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false');

		await disclosure.click();
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'true');
		// The label names what is behind it and stays put; the chevron turns.
		await expect.element(disclosure).toHaveTextContent('Sources');
		const revealed = screen.container.querySelectorAll('.diagnostic-meta__sources a');
		expect(revealed).toHaveLength(2);

		// Unfolded, each citation is the inline one exactly — tooltip included.
		expect(revealed[0]!.getAttribute('aria-describedby')).toBeTruthy();

		await disclosure.click();
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false');
		expect(screen.container.querySelector('.diagnostic-meta__sources')).toBeNull();
		screen.unmount();
	});

	it('leaves a lone citation inline rather than behind a disclosure', async () => {
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(['G-LINES']),
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		await expect.element(page.getByRole('button', { name: 'Sources' })).not.toBeInTheDocument();
		expect(screen.container.querySelectorAll('.diagnostic-meta__row a')).toHaveLength(1);
		screen.unmount();
	});

	it('draws the linked page’s favicon inside the citation, decoratively', async () => {
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(['G-LINES']),
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		// The mark rides inside the link it identifies — the citation idiom a
		// search result or an assistant's reference row uses — and says nothing to
		// a screen reader, because the title beside it already names the source.
		const favicon = screen.container.querySelector('.diagnostic-meta__row a img')!;
		expect(favicon).not.toBeNull();
		expect(favicon.getAttribute('alt')).toBe('');

		// A decoration must not change what the line says.
		expect(visibleText(screen.container.querySelector('.diagnostic-meta__row')!)).toBe(
			'Line 47 · Page G-LINES'
		);
		screen.unmount();
	});

	it('marks a derivation as LyricLint’s reading, ahead of what it reads', async () => {
		const screen = render(DiagnosticMeta, {
			diagnostic: { ...diagnostic(['G-LINES']), derivation: true },
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		// The words carry the fact and the mark is decorative, so the tag reads
		// the same to a screen reader as to anyone else. The mark is the actual
		// `lyriclint-mark.svg` inlined — brackets on `currentColor` — inside a
		// wrapper that hides the SVG's own label from assistive technology.
		const derivation = screen.container.querySelector('.diagnostic-meta__derivation')!;
		expect(derivation).not.toBeNull();
		const mark = derivation.querySelector('.diagnostic-meta__derivation-mark')!;
		expect(mark.getAttribute('aria-hidden')).toBe('true');
		expect(mark.querySelector('svg [stroke="currentColor"]')).not.toBeNull();
		expect(visibleText(screen.container.querySelector('.diagnostic-meta__row')!)).toBe(
			'Line 47 · LyricLint reading · Page G-LINES'
		);
		screen.unmount();
	});

	it('draws no derivation tag on a finding the sources state directly', async () => {
		const screen = render(DiagnosticMeta, {
			diagnostic: diagnostic(['G-LINES']),
			sources: sourcesFor(['G-LINES']),
			line: 47
		});

		expect(screen.container.querySelector('.diagnostic-meta__derivation')).toBeNull();
		screen.unmount();
	});
});
