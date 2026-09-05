<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		connectReferenceSearchUrl,
		restoreReferenceSearchState
	} from './reference-search.svelte.js';
	import { readReferenceSearch, writeReferenceSearch } from './reference-url.js';

	// Effects run only in the browser. Observe shallow URL changes as well as
	// route changes: Back can restore a shallow entry without afterNavigate.
	function restoreFromLocation(): void {
		restoreReferenceSearchState(readReferenceSearch(new URL(window.location.href)));
	}
	$effect(() => {
		void page.url;
		// A cached route can restore its original page.url after Back while the
		// address bar carries the shallow entry's query. The address is authoritative.
		restoreFromLocation();
	});
	onMount(() => {
		const disconnect = connectReferenceSearchUrl((state) => {
			const href = writeReferenceSearch(new URL(window.location.href), state);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- current resolved browser URL, only query fields change.
			replaceState(href, page.state);
		});
		window.addEventListener('popstate', restoreFromLocation);
		return () => {
			disconnect();
			window.removeEventListener('popstate', restoreFromLocation);
		};
	});
</script>
