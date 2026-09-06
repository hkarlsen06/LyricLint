import { expect, test } from 'vitest';
import { lineNumberAt, lineNumberLookup } from './line-numbers.js';

test('indexed line lookup matches the shared line convention at every boundary', () => {
	for (const text of ['', 'One\nTwo\n', 'One\r\nTwo\r\n', 'One\rTwo\r', '🌙\r\nOne\nTwo\rThree']) {
		const lookup = lineNumberLookup(text);
		for (let offset = text.length + 2; offset >= -1; offset -= 1) {
			expect(lookup(offset), `${JSON.stringify(text)} at ${offset}`).toBe(
				lineNumberAt(text, offset)
			);
		}
	}
});
