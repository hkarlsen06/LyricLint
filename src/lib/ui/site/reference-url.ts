/** Decision record: docs/subsystems/reference.md. URL state belongs to the unified transcription guide. */
import type { Fixability, Severity } from '$lib/core/types.js';

export interface ReferenceSearchState {
	query: string;
	scope: 'all' | 'guidelines' | 'rules';
	topic: string;
	browseAll: boolean;
	severities: Severity[];
	fixabilities: Fixability[];
}

export function emptyReferenceSearch(): ReferenceSearchState {
	return { query: '', scope: 'all', topic: '', browseAll: false, severities: [], fixabilities: [] };
}

export function readReferenceSearch(url: URL): ReferenceSearchState {
	const params = url.searchParams;
	const scope = params.get('scope');
	return {
		query: params.get('q') ?? '',
		scope: scope === 'rules' || scope === 'guidelines' ? scope : 'all',
		topic: params.get('topic') ?? '',
		browseAll: params.get('browse') === 'all',
		severities: (params.get('severity') ?? '')
			.split(',')
			.filter((value): value is Severity =>
				['error', 'warning', 'suggestion', 'manual-review'].includes(value)
			),
		fixabilities: (params.get('fix') ?? '')
			.split(',')
			.filter((value): value is Fixability => ['safe', 'preview', 'none'].includes(value))
	};
}

/** Preserve a destination's fragment and explicit filters; carry the other search fields. */
export function referenceSearchHref(href: string, state: ReferenceSearchState): string {
	const url = new URL(href, 'https://reference.invalid');
	const values = {
		q: state.query,
		scope: state.scope === 'all' ? '' : state.scope,
		topic: state.topic,
		browse: state.browseAll ? 'all' : '',
		severity: state.severities.join(','),
		fix: state.fixabilities.join(',')
	};
	for (const [key, value] of Object.entries(values)) {
		if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
	}
	return `${url.pathname}${url.search}${url.hash}`;
}

/** Write into the current URL, replacing owned fields while retaining unrelated parameters. */
export function writeReferenceSearch(url: URL, state: ReferenceSearchState): string {
	const next = new URL(url);
	for (const key of ['q', 'scope', 'topic', 'browse', 'severity', 'fix'])
		next.searchParams.delete(key);
	return referenceSearchHref(`${next.pathname}${next.search}${next.hash}`, state);
}
