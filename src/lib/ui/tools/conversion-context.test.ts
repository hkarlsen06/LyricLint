import { expect, it } from 'vitest';
import { conversionContext } from './conversion-context.js';

it('keeps short surrounding lyrics exact without offering an expansion', () => {
	expect(conversionContext('I said ', ' beside café 🌙')).toEqual({
		before: 'I said ',
		after: ' beside café 🌙',
		clipped: false
	});
});

it('omits a distant long word completely rather than showing a fragment', () => {
	expect(conversionContext('a'.repeat(80), 'b'.repeat(80))).toEqual({
		before: '…',
		after: '…',
		clipped: true
	});
});

it('keeps whole emoji clusters on either side of the selected word', () => {
	const emoji = '👩🏽‍🚀';
	const context = conversionContext(emoji.repeat(20) + ' ', ' ' + emoji.repeat(20));
	expect(context.before).toMatch(/^…(?:👩🏽‍🚀)+ $/u);
	expect(context.after).toMatch(/^ (?:👩🏽‍🚀)+…$/u);
	expect(context.clipped).toBe(true);
});

it('preserves exact visible Japanese context from each side', () => {
	const before = '銀色の月の下で'.repeat(20);
	const after = '遠くの星を見ながら'.repeat(20);
	const context = conversionContext(before, after);
	expect(context.clipped).toBe(true);
	expect(before.endsWith(context.before.slice(1))).toBe(true);
	expect(after.startsWith(context.after.slice(0, -1))).toBe(true);
	expect(context.before.length).toBeLessThan(before.length);
	expect(context.after.length).toBeLessThan(after.length);
});
