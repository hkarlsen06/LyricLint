import type { ClientInit } from '@sveltejs/kit/hooks';
import { resolve } from '$app/paths';
import { captureHandoffLinks } from '#lib/ui/state/handoff-links.js';

export const init: ClientInit = () => {
	captureHandoffLinks(resolve('workbench/'));
};
