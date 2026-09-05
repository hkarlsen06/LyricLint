import { browser, building } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';

// The host handles full navigations; this also redirects old links followed by the client router.
export const load: PageLoad = ({ url }) => {
	redirect(308, `/guidelines/${building ? '' : url.search}${browser ? url.hash : ''}`);
};
