import { describe, expect, it } from 'vitest';
import { scanAnnotations } from './annotations.js';

describe('scanAnnotations', () => {
	it('records exact ranges for a single-line annotation', () => {
		const text = '[Patrick](35524236) har ikke, Malik har ikke';
		const spans = scanAnnotations(text);

		expect(spans).toHaveLength(1);
		const span = spans[0]!;
		expect(text.slice(span.from, span.to)).toBe('[Patrick](35524236)');
		expect(text.slice(span.fragmentRange.from, span.fragmentRange.to)).toBe('Patrick');
		expect(text.slice(span.idRange.from, span.idRange.to)).toBe('35524236');
		expect(span.id).toBe(35524236);
	});

	it('follows a fragment across line breaks', () => {
		const text = 'Intro\n[Det er for mange\nOg ærlig, det er kun tre](35524264)\nOutro';
		const spans = scanAnnotations(text);

		expect(spans).toHaveLength(1);
		const span = spans[0]!;
		expect(text.slice(span.fragmentRange.from, span.fragmentRange.to)).toBe(
			'Det er for mange\nOg ærlig, det er kun tre'
		);
		expect(span.id).toBe(35524264);
	});

	it('accepts an emptied fragment, still markup worth preserving', () => {
		expect(scanAnnotations('før [](12) etter')).toHaveLength(1);
	});

	it('refuses shapes that are lyrics rather than annotations', () => {
		// A parenthetical that is not an id, a bracket pair with nothing attached,
		// and a section header: brackets a transcriber wrote as text or structure.
		expect(scanAnnotations('[shoutout](hey)')).toHaveLength(0);
		expect(scanAnnotations('[Chorus] again')).toHaveLength(0);
		expect(scanAnnotations('[Vers 4: Amara]')).toHaveLength(0);
		// A fragment cannot contain brackets, so the scan restarts inside.
		const nested = scanAnnotations('[a [b](1)');
		expect(nested).toHaveLength(1);
		expect(nested[0]?.from).toBe(3);
	});
});
