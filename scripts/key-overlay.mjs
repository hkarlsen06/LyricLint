/** Shared keyboard overlay for Playwright capture scripts. Decision record: docs/subsystems/site.md.
 * Times are filmed seconds, independent of the browser clock or playback speed.
 * Call press() for real input, render() before each screenshot, and dispose() when done.
 */
export async function createKeyOverlay(page, { duration = 2 } = {}) {
	const badge = await page.evaluateHandle(() => {
		const badge = document.createElement('div');
		badge.id = '__shot_keys';
		badge.setAttribute('aria-hidden', 'true');
		badge.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;
					display:none;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);
					border-radius:var(--radius-overlay);
					background:color-mix(in oklch,var(--color-fill-strong) 80%,transparent);color:var(--color-text);
					backdrop-filter:blur(var(--space-6)) saturate(0.5);
					font:var(--font-weight-semibold) var(--font-size-md) var(--font-ui);transform:translate(-50%,-50%);`;
		badge.innerHTML = '<kbd></kbd><span class="count"></span><span class="action"></span>';
		badge.querySelector('.count').style.cssText = 'min-width:3ch;font-variant-numeric:tabular-nums';
		badge.querySelector('kbd').style.cssText =
			'font:inherit;border:var(--border-width) solid var(--color-border-strong);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2)';
		document.body.append(badge);
		return badge;
	});
	let until = 0;
	let label = '';
	let action = '';
	let count = 0;
	let showCount = false;
	return {
		get count() {
			return count;
		},
		async press(
			key,
			{
				at,
				label: nextLabel = key,
				action: nextAction = '',
				continueCount = false,
				showCount: nextShowCount = false
			}
		) {
			await page.keyboard.press(key);
			count = label === nextLabel && (continueCount || at < until) ? count + 1 : 1;
			label = nextLabel;
			action = nextAction;
			showCount = nextShowCount;
			until = at + duration;
		},
		async render(at, { x, y }) {
			await badge.evaluate(
				(element, { visible, label, action, count, showCount, x, y }) => {
					// A native modal occupies the top layer, above every body z-index.
					// Follow it so filmed paste/submit keys remain visible in the picker.
					const parent = document.querySelector('dialog:modal') ?? document.body;
					if (element.parentElement !== parent) parent.append(element);
					element.style.left = `${x}px`;
					element.style.top = `${y}px`;
					element.style.display = visible ? 'flex' : 'none';
					element.querySelector('kbd').textContent = label;
					element.querySelector('.count').textContent = `× ${count}`;
					element.querySelector('.count').style.display = showCount || count > 1 ? '' : 'none';
					element.querySelector('.action').textContent = action;
					element.querySelector('.action').style.display = action ? '' : 'none';
				},
				{ visible: at < until, label, action, count, showCount, x, y }
			);
		},
		async dispose() {
			await badge.evaluate((element) => element.remove());
			await badge.dispose();
		}
	};
}
