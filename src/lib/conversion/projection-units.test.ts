import { describe, expect, it } from 'vitest';
import { importDocument } from './import.js';
import { renderProfile } from './projection.js';
import { resolveDecision } from './decisions.js';
import { retainProjectionUnits } from './projection-units.js';

function imported(text: string) {
	const result = importDocument({ text, profile: 'musixmatch', language: 'en' });
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

describe('retained projection units', () => {
	it('retains unordered local spellings without crossing owners or duplicating ranges', () => {
		const document = imported('a ?\nb ?');
		const result = retainProjectionUnits(document, 'musixmatch', [
			{ from: 5, to: 6, text: '' },
			{ from: 1, to: 2, text: '' },
			{ from: 1, to: 2, text: 'ignored duplicate' },
			{ from: 2, to: 6, text: '?\nb' }
		]);
		expect(result.ok && result.value.text).toBe('a?\nb?');
		expect(document.forms.map(({ from, to, text }) => ({ from, to, text }))).toEqual([
			{ from: 1, to: 2, text: '' },
			{ from: 5, to: 6, text: '' }
		]);
		const genius = renderProfile(document, 'genius');
		expect(genius.ok && genius.value.text).toBe('a ?\nb ?');
	});

	it('keeps existing authored wording and skips overlapping new units', () => {
		const document = imported('abcde');
		const projection = renderProfile(document, 'musixmatch');
		if (!projection.ok) throw new Error(projection.refusal.message);
		const formed = resolveDecision(document, projection.value, {
			kind: 'setForm',
			range: { from: 1, to: 3 },
			profile: 'musixmatch',
			text: 'LONG'
		});
		if (!formed.ok) throw new Error(formed.refusal.message);
		const original = structuredClone(formed.value.document.forms[0]);
		const result = retainProjectionUnits(formed.value.document, 'musixmatch', [
			{ from: 2, to: 4, text: 'overlap' },
			{ from: 3, to: 4, text: 'D' },
			{ from: 3, to: 5, text: 'overlapping new spelling' },
			{ from: 4, to: 5, text: 'E' }
		]);
		expect(result.ok && result.value.text).toBe('aLONGDE');
		expect(formed.value.document.forms[0]).toEqual(original);
		expect(formed.value.document.forms).toHaveLength(3);
	});
});
