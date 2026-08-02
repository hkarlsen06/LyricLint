import type { RightPanelTab } from './panel-view.svelte.js';

export const defaultRightPanelTab: RightPanelTab = 'linter';

export function rightPanelTabFromUrl(url: URL): RightPanelTab {
	const panel = url.searchParams.get('panel');
	return panel === 'performers' || panel === 'tools' || panel === 'assistant'
		? panel
		: defaultRightPanelTab;
}

export function urlForRightPanelTab(url: URL, tab: RightPanelTab): URL {
	const next = new URL(url);
	if (tab === defaultRightPanelTab) next.searchParams.delete('panel');
	else next.searchParams.set('panel', tab);
	return next;
}
