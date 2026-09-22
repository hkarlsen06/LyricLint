import { createContext } from 'svelte';

/** The root owns navigation visuals; the mounted workbench reports readiness. */
export const [finishWorkbenchNavigation, provideWorkbenchNavigation] = createContext<() => void>();

/**
 * Dispatched on `window` the frame the navigation cover's explosion starts. The
 * cover also carries `data-blasting` from then on, so a listener that attaches
 * late can read the state instead of waiting for an event that already fired.
 */
export const bootBlastEvent = 'lyriclint:boot-blast';
