import type { RightPanelTab } from './panel-view.svelte.js';

const defaultRightPanelTab: RightPanelTab = 'linter';

export function rightPanelTabFromUrl(url: URL): RightPanelTab {
	const panel = url.searchParams.get('panel');
	// `tools` was the id of the catch-all tab before it was split into `song`
	// (metadata and exports) and `preferences` (workspace and app settings). A
	// bookmarked or shared `?panel=tools` lands on the song half, which is where
	// the metadata and exports it named now live.
	if (panel === 'tools') return 'song';
	return panel === 'performers' ||
		panel === 'song' ||
		panel === 'preferences' ||
		panel === 'assistant'
		? panel
		: defaultRightPanelTab;
}

export function urlForRightPanelTab(url: URL, tab: RightPanelTab): URL {
	const next = new URL(url);
	if (tab === defaultRightPanelTab) next.searchParams.delete('panel');
	else next.searchParams.set('panel', tab);
	return next;
}
