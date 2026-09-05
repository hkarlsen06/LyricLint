import { browser, building } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';

export const load: PageLoad = ({ params, url }) => {
	redirect(
		308,
		`/guidelines/checks/${params.rule}/${building ? '' : url.search}${browser ? url.hash : ''}`
	);
};
