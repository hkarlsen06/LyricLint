import type { Attachment } from 'svelte/attachments';
import { prefersReducedMotion } from '$lib/interaction/motion.js';

function secondsFromCssTime(value: string): number {
	const time = value.trim();
	// Production CSS may spell 400ms as .4s. Motion expects seconds, so the
	// suffix (not the spelling in tokens.css) decides whether to convert.
	return parseFloat(time) / (time.endsWith('ms') ? 1000 : 1);
}

/** A best-effort startup flourish, never a condition of readiness. */
export const workspaceEntrance: Attachment<HTMLElement> = (root) => {
	if (prefersReducedMotion() || document.hidden) return;

	let retired = false;
	let frame = 0;
	let lyricsSeen = false;
	let diagnosticsSeen = false;
	let pending = 0;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let animate: typeof import('motion/mini').animate | undefined;
	const animations: Array<() => void> = [];
	const preference = matchMedia('(prefers-reduced-motion: reduce)');
	const events = [
		'pointerdown',
		'keydown',
		'beforeinput',
		'wheel',
		'touchstart',
		'focusin'
	] as const;
	const observer = new MutationObserver(schedule);
	// Arm before the async editor/list can paint, avoiding visible → hidden →
	// revealed flicker. Failure or interaction always removes this mask.
	root.dataset.workspaceEntrance = 'lyrics diagnostics';
	const maskTimeout = setTimeout(retire, 2000);

	function unmask(group: string): void {
		root.dataset.workspaceEntrance = (root.dataset.workspaceEntrance ?? '')
			.split(' ')
			.filter((name) => name !== group)
			.join(' ');
		if (!root.dataset.workspaceEntrance) {
			root.removeAttribute('data-workspace-entrance');
			clearTimeout(maskTimeout);
		}
	}

	function retire(): void {
		if (retired) return;
		retired = true;
		clearTimeout(timeout);
		clearTimeout(maskTimeout);
		root.removeAttribute('data-workspace-entrance');
		cancelAnimationFrame(frame);
		observer.disconnect();
		for (const cancel of animations) cancel();
		for (const event of events) window.removeEventListener(event, retire, true);
		preference.removeEventListener('change', retire);
		document.removeEventListener('visibilitychange', retire);
	}

	function finishIfDone(): void {
		if (!lyricsSeen || !diagnosticsSeen) return;
		observer.disconnect();
		if (pending === 0) retire();
	}

	function enter(container: HTMLElement, selector: string, port: HTMLElement): void {
		if (!animate || container.closest('[hidden], [inert]')) return;
		const clip = port.getBoundingClientRect();
		const top = Math.max(0, clip.top);
		const bottom = Math.min(window.innerHeight, clip.bottom);
		const left = Math.max(0, clip.left);
		const right = Math.min(window.innerWidth, clip.right);
		// Read geometry in one batch before starting any animations. CodeMirror's
		// viewport DOM is the source: never materialize or decorate the document.
		const visible: HTMLElement[] = [];
		for (let index = 0; index < Math.min(container.children.length, 64); index++) {
			const child = container.children[index];
			if (!(child instanceof HTMLElement) || !child.matches(selector)) continue;
			const rect = child.getBoundingClientRect();
			if (rect.top >= bottom) break;
			if (rect.bottom > top && rect.right > left && rect.left < right && rect.height > 0) {
				visible.push(child);
				if (visible.length === 48) break;
			}
		}
		const style = getComputedStyle(root);
		const duration = secondsFromCssTime(style.getPropertyValue('--duration-workspace-entrance'));
		const stagger = secondsFromCssTime(style.getPropertyValue('--duration-workspace-stagger'));
		const staggerLimit = secondsFromCssTime(
			style.getPropertyValue('--duration-workspace-stagger-limit')
		);
		const step = Math.min(stagger, staggerLimit / Math.max(1, visible.length - 1));
		const [x1, y1, x2, y2] = style
			.getPropertyValue('--ease-in-out-cubic')
			.trim()
			.slice('cubic-bezier('.length, -1)
			.split(',')
			.map(Number);
		const ease: [number, number, number, number] = [x1, y1, x2, y2];
		for (const [index, element] of visible.entries()) {
			const originalOpacity = element.style.opacity;
			const restore = () => {
				if (originalOpacity) element.style.opacity = originalOpacity;
				else element.style.removeProperty('opacity');
			};
			pending++;
			const control = animate(
				element,
				{ opacity: [0, 1] },
				{
					duration,
					delay: index * step,
					ease,
					onComplete: () => {
						restore();
						pending--;
						finishIfDone();
					}
				}
			);
			animations.push(() => {
				control.cancel();
				restore();
			});
		}
	}

	function scan(): void {
		frame = 0;
		if (retired || !animate || root.dataset.entrancePending === 'true') return;
		// The budget is for the flourish, not for downloading/constructing the
		// recovered workspace. A cold load must not spend it before rows exist.
		timeout ??= setTimeout(retire, 2000);
		try {
			if (!lyricsSeen) {
				const content = root.querySelector<HTMLElement>('.cm-content');
				const port = root.querySelector<HTMLElement>('.cm-scroller');
				if (content && port) {
					lyricsSeen = true;
					const placeholder = content.querySelector<HTMLElement>('.ll-placeholder');
					if (placeholder) enter(placeholder, '.ll-placeholder-line', port);
					else enter(content, '.cm-line', port);
					unmask('lyrics');
				}
			}
			if (!diagnosticsSeen) {
				const list = root.querySelector<HTMLElement>('.diagnostic-list');
				if (list) {
					diagnosticsSeen = true;
					enter(list, 'li:not([hidden])', list.closest<HTMLElement>('.right-panel__body') ?? root);
					unmask('diagnostics');
				} else if (root.querySelector('.diagnostic-list__empty:not([role="status"])')) {
					diagnosticsSeen = true;
					unmask('diagnostics');
				}
			}
			finishIfDone();
		} catch {
			// Animation is optional. A browser/API failure must leave usable text.
			retire();
		}
	}

	function schedule(): void {
		if (!retired && !frame) frame = requestAnimationFrame(scan);
	}

	for (const event of events)
		window.addEventListener(event, retire, { capture: true, passive: true });
	preference.addEventListener('change', retire);
	document.addEventListener('visibilitychange', retire);
	void import('motion/mini').then((motion) => {
		if (retired) return;
		animate = motion.animate;
		observer.observe(root, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-entrance-pending']
		});
		schedule();
	}, retire);
	return retire;
};
