import { describe, expect, it } from 'vitest';
import {
	emptyReferenceSearch,
	readReferenceSearch,
	referenceSearchHref,
	writeReferenceSearch,
	type ReferenceSearchState
} from './reference-url.js';

describe('shared reference URLs', () => {
	it('carries searches and filters between sections without losing deep links', () => {
		const state: ReferenceSearchState = {
			...emptyReferenceSearch(),
			query: 'two singers & a duet',
			scope: 'rules' as const,
			topic: 'performers',
			severities: ['warning'],
			fixabilities: ['preview']
		};
		const href = referenceSearchHref('/guidelines/performers/#voices', state);
		const url = new URL(href, 'https://lyriclint.com');
		expect(url.hash).toBe('#voices');
		expect(readReferenceSearch(url)).toEqual(state);
	});
	it('replaces stale filters, preserves unrelated parameters, and clears to a clean URL', () => {
		const url = new URL(
			'https://lyriclint.com/guidelines/?q=old&scope=rules&topic=spelling&browse=all&source=link#example'
		);
		expect(writeReferenceSearch(url, emptyReferenceSearch())).toBe(
			'/guidelines/?source=link#example'
		);
	});
	it('allows task links to name a new query or topic explicitly', () => {
		const href = referenceSearchHref('/guidelines/?q=brackets&topic=sections#example', {
			...emptyReferenceSearch(),
			query: 'singers',
			topic: 'performers'
		});
		expect(href).toBe('/guidelines/?q=brackets&topic=sections#example');
	});
	it('ignores invalid scopes and unsupported diagnostic filters', () => {
		const state = readReferenceSearch(
			new URL(
				'https://lyriclint.com/guidelines/?scope=nope&severity=warning,unknown&fix=none,unknown'
			)
		);
		expect(state.scope).toBe('all');
		expect(state.severities).toEqual(['warning']);
		expect(state.fixabilities).toEqual(['none']);
	});
});
