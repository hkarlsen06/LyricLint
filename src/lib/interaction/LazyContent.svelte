<script lang="ts" generics="Props extends Record<string, unknown>">
	import { onMount, type Component, type Snippet } from 'svelte';

	let {
		name,
		load,
		panelProps,
		pendingSurface
	}: {
		name: string;
		load: () => Promise<{ default: Component<Props> }>;
		panelProps: Props;
		pendingSurface?: Snippet<[Snippet]>;
	} = $props();

	let Panel = $state<Component<Props>>();
	let failed = $state(false);
	let loading = false;

	async function open(): Promise<void> {
		if (loading) return;
		loading = true;
		failed = false;
		try {
			Panel = (await load()).default;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void open();
	});
</script>

{#snippet pending()}
	{#if failed}
		<p role="alert">Could not load {name}. Check your connection and try again.</p>
		<div><button class="button" onclick={open}>Retry loading {name}</button></div>
	{:else}
		<p class="sr-only" role="status">Loading {name}…</p>
	{/if}
{/snippet}

{#if Panel}
	<Panel {...panelProps} />
{:else if pendingSurface}
	{@render pendingSurface(pending)}
{:else}
	{@render pending()}
{/if}
