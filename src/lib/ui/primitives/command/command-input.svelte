<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div class="ui-command__input-row" data-slot="command-input-wrapper">
	<MagnifyingGlassIcon class="ui-command__input-icon" aria-hidden="true" size="1em" />
	<CommandPrimitive.Input
		data-slot="command-input"
		class={['ui-command__input', className]}
		bind:ref
		{...restProps}
		bind:value
	/>
</div>

<style>
	/* The row, not the field, is the visible edge; the field itself is bare so
	   the hairline under the row is the only line in the dialog. */
	.ui-command__input-row {
		display: flex;
		padding-inline: var(--space-4);
		border-block-end: var(--border-width) solid var(--color-border);
		gap: var(--space-2);
		align-items: center;
		color: var(--color-text-muted);
	}

	/* Never under 16px: a finger types here (docs/subsystems/responsive.md). */
	:global(.ui-command__input) {
		width: 100%;
		min-width: 0;
		min-height: var(--control-height-touch);
		padding: 0;
		border: 0;
		background: transparent;
		/* The form fields' ring (controls.css) would draw a second box inside
		   the row. */
		box-shadow: none;
		color: var(--color-text);
		font-size: var(--font-size-editor);
	}

	:global(.ui-command__input::placeholder) {
		color: var(--color-text-muted);
	}

	/* The dialog is the field's only content, and focus sits in it from the
	   moment it opens; the caret says so. The ring moves to the row so it is
	   drawn around something the reader can see as the field. */
	:global(.ui-command__input:focus-visible) {
		outline: none;
	}

	.ui-command__input-row:has(:global(.ui-command__input:focus-visible)) {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
</style>
