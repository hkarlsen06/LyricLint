import type { Action } from 'svelte/action';

/** Native sticky titles sit over independently reserved text, so shrinking cannot move content. */
export const stickyTopics: Action<HTMLElement, unknown> = (node) => {
	const port = node.closest<HTMLElement>('.site-split__index, .site-split__detail');
	if (!port) return;
	const finder = port.querySelector<HTMLElement>('.site-finder');
	const glass = node.querySelector<HTMLElement>('.guide-glass')!;
	let groups: HTMLElement[] = [];
	let titles: HTMLElement[] = [];
	let headings: HTMLElement[][] = [];
	let heights: number[] = [];
	let offset = 0;
	let frame = 0;
	let disposed = false;

	function update() {
		frame = 0;
		const top = port!.getBoundingClientRect().top;
		const bounds = groups.map((group) => group.getBoundingClientRect());
		titles.forEach((title, index) => {
			const rect = title.getBoundingClientRect();
			title.style.setProperty('--topic-clip', `${Math.max(0, top + offset - rect.top)}px`);
			title.style.setProperty(
				'--topic-clip-end',
				`${Math.max(0, rect.bottom - bounds[index].bottom)}px`
			);
		});
		const stuck = bounds.map((bounds) => bounds.top <= top + offset);
		const active = bounds.findIndex(
			(bounds, index) => stuck[index] && bounds.bottom > top + offset
		);
		let bottom = top + (port!.scrollTop > 0 ? offset : 0);
		if (active !== -1) {
			const topicBottom = Math.max(top, titles[active].getBoundingClientRect().bottom);
			bottom = Math.max(bottom, topicBottom);
			for (const heading of headings[active]) {
				const bounds = heading.getBoundingClientRect();
				// Outgoing entry text passes beneath the topic's shared glass, never over its text.
				heading.style.setProperty('--heading-clip', `${Math.max(0, topicBottom - bounds.top)}px`);
				// An entry still down the page must not blur the prose leading into it.
				if (bounds.top <= top + heights[active] + 1) bottom = Math.max(bottom, bounds.bottom);
			}
		}
		glass.style.setProperty('--guide-glass-height', `${Math.max(0, bottom - top)}px`);
		groups.forEach((group, index) => group.toggleAttribute('data-stuck', stuck[index]));
	}

	function scroll() {
		if (!frame) frame = requestAnimationFrame(update);
	}

	function measure() {
		if (disposed) return;
		groups = Array.from(node.querySelectorAll<HTMLElement>('.guide-topic'));
		titles = groups.map((group) => group.querySelector<HTMLElement>('.guide-topic-title')!);
		headings = groups.map((group) =>
			Array.from(group.querySelectorAll<HTMLElement>('.guidelines__entry-heading'))
		);
		offset = finder?.getBoundingClientRect().height ?? 0;
		node.style.setProperty('--topic-offset', `${offset}px`);
		glass.style.inlineSize = `${port!.clientWidth}px`;
		heights = groups.map(
			(group) =>
				group.querySelector<HTMLElement>('.guide-topic-compact')!.getBoundingClientRect().height
		);
		groups.forEach((group, index) => {
			group.style.setProperty('--topic-compact-height', `${heights[index]}px`);
		});
		headingObserver.disconnect();
		for (const heading of [...titles, ...headings.flat()]) headingObserver.observe(heading);
		cancelAnimationFrame(frame);
		update();
	}

	// Font interpolation and source disclosures resize the glass without moving any content.
	const headingObserver = new ResizeObserver(update);
	const observer = new ResizeObserver(measure);
	observer.observe(port);
	if (finder) observer.observe(finder);
	port.addEventListener('scroll', scroll, { passive: true });
	void document.fonts.ready.then(measure);
	measure();
	return {
		update: measure,
		destroy() {
			disposed = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
			headingObserver.disconnect();
			port.removeEventListener('scroll', scroll);
		}
	};
};
