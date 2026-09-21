import { createContext } from 'svelte';

/** The root owns navigation visuals; the mounted workbench reports readiness. */
export const [finishWorkbenchNavigation, provideWorkbenchNavigation] = createContext<() => void>();
