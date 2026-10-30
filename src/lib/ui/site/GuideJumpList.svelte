<script lang="ts">
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	/** Same-page headings only: each row is a fragment link to `#id`, never a route. */
	let { items }: { items: readonly { id: string; label: string }[] } = $props();
</script>

<!-- Neutral rows with a downward cue, so a jump within the page never reads as leaving it. -->
<nav class="guide-jump" aria-label="On this page">
	<ul>
		{#each items as item (item.id)}
			<li>
				<a href={`#${item.id}`}
					><ArrowDownIcon class="guide-jump__cue" size={14} aria-hidden="true" /><span
						>{item.label}</span
					></a
				>
			</li>
		{/each}
	</ul>
</nav>

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		margin: 0;
	}
	a {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		min-height: var(--control-height-md);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-control);
		color: var(--color-text);
		line-height: var(--line-height-tight);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a:hover {
		background: var(--color-fill-subtle);
		color: var(--color-text);
	}
	a :global(.guide-jump__cue) {
		flex: none;
		color: var(--color-text-muted);
	}
	a:hover :global(.guide-jump__cue),
	a:focus-visible :global(.guide-jump__cue) {
		color: var(--color-text);
	}
	@media (pointer: coarse) {
		a {
			min-height: var(--control-height-touch);
		}
	}
</style>
