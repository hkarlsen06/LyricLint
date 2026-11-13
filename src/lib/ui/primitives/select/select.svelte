<script lang="ts" module>
	export interface SelectOption<Value extends string = string> {
		value: Value;
		label: string;
		/** A second, quieter line of the row: what choosing it means. */
		detail?: string;
		disabled?: boolean;
	}
</script>

<script lang="ts" generics="Value extends string">
	import { Select as SelectPrimitive } from 'bits-ui';
	import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDownIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';

	let {
		value,
		options,
		onchange,
		label,
		labelHidden = false,
		placeholder = 'Choose',
		disabled = false,
		compact = false,
		id,
		class: className
	}: {
		/** The chosen option's value. `''` or `undefined` shows the placeholder. */
		value: Value | '' | undefined;
		options: readonly SelectOption<Value>[];
		/** A choice the caller cannot carry out leaves `value`, and so the trigger, as it was. */
		onchange: (value: Value) => void;
		/** Names the control. Drawn above it unless `labelHidden`. */
		label: string;
		labelHidden?: boolean;
		placeholder?: string;
		disabled?: boolean;
		/** Hugs its value instead of filling the row, for a control inside a row of others. */
		compact?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const uid = $props.id();
	const labelId = `${uid}-label`;
	const selected = $derived(options.find((option) => option.value === value));
	let trigger = $state<HTMLElement | null>(null);
	/**
	 * A modal `<dialog>` is in the top layer, above anything portalled to the
	 * body, so a list opened inside one is portalled into that dialog instead.
	 */
	const portalTarget = $derived(trigger?.closest('dialog') ?? undefined);
</script>

<div class={['ui-select', compact && 'ui-select--compact', className]}>
	<span id={labelId} class={['ui-select__label', labelHidden && 'sr-only']}>{label}</span>
	<SelectPrimitive.Root
		type="single"
		bind:value={
			() => value ?? '',
			(next) => {
				const option = options.find((entry) => entry.value === next);
				if (option && option.value !== value) onchange(option.value);
			}
		}
		items={options.map(({ value, label, disabled }) => ({ value, label, disabled }))}
		{disabled}
	>
		<SelectPrimitive.Trigger
			bind:ref={trigger}
			{id}
			class="ui-select__trigger"
			aria-labelledby={labelId}
			data-placeholder={selected ? undefined : ''}
		>
			<span class="ui-select__value">{selected?.label ?? placeholder}</span>
			<CaretUpDownIcon class="ui-select__caret" size="1em" aria-hidden="true" />
		</SelectPrimitive.Trigger>
		<SelectPrimitive.Portal to={portalTarget}>
			<SelectPrimitive.Content
				class="ui-select__content"
				sideOffset={4}
				align="start"
				collisionPadding={8}
				aria-labelledby={labelId}
			>
				<SelectPrimitive.Viewport class="ui-select__viewport">
					{#each options as option (option.value)}
						<SelectPrimitive.Item
							class="ui-select__item"
							value={option.value}
							label={option.label}
							disabled={option.disabled}
						>
							{#snippet children({ selected })}
								<span class="ui-select__item-text">
									<span>{option.label}</span>
									{#if option.detail}<span class="ui-select__item-detail">{option.detail}</span
										>{/if}
								</span>
								{#if selected}<CheckIcon
										class="ui-select__check"
										size="1em"
										weight="bold"
										aria-hidden="true"
									/>{/if}
							{/snippet}
						</SelectPrimitive.Item>
					{/each}
				</SelectPrimitive.Viewport>
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	</SelectPrimitive.Root>
</div>

<style>
	/*
	 * The one dropdown in the product. A native `<select>` opens the operating
	 * system's own list, which shares nothing with the surfaces around it; this
	 * is the same field with a list drawn from the overlay tokens.
	 *
	 * The trigger is a form field, so it wears the field tier (the control
	 * surface and its ring), and the list is a floating surface.
	 */
	.ui-select {
		display: grid;
		min-width: 0;
		gap: var(--space-2);
	}

	.ui-select--compact {
		display: inline-grid;
	}

	.ui-select :global(.ui-select__trigger) {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		gap: var(--control-gap);
		align-items: center;
		justify-content: space-between;
		background: var(--color-control);
		box-shadow: var(--shadow-control);
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
		text-align: start;
	}

	.ui-select--compact :global(.ui-select__trigger) {
		width: auto;
	}

	.ui-select :global(.ui-select__trigger:hover:not(:disabled)) {
		background: var(--color-control-hover);
	}

	.ui-select :global(.ui-select__trigger[data-state='open']) {
		background: var(--color-control-active);
	}

	/* Unset reads as unset by its ink and its words, never by fading the field. */
	.ui-select :global(.ui-select__trigger[data-placeholder]) {
		color: var(--color-text-muted);
		font-weight: var(--font-weight-regular);
	}

	.ui-select :global(.ui-select__trigger:disabled) {
		background: var(--color-control-disabled);
		box-shadow: none;
		color: var(--color-text-disabled);
		cursor: not-allowed;
	}

	.ui-select__value {
		overflow: hidden;
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ui-select :global(.ui-select__caret) {
		flex: none;
		color: var(--color-text-muted);
	}

	:global(.ui-select__content) {
		z-index: var(--layer-popover);
		min-width: max(var(--bits-select-anchor-width), 9rem);
		max-width: min(22rem, calc(100vw - 1rem));
		max-height: min(20rem, var(--bits-select-content-available-height));
		padding: var(--space-1);
		overflow-y: auto;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		box-shadow: var(--shadow-popover);
		color: var(--color-text);
		font-family: var(--font-ui);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-tight);
	}

	:global(.ui-select__item) {
		display: flex;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border-radius: var(--radius-control);
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		user-select: none;
	}

	/* The row the keys or the pointer are on. The chosen row is told apart by
	   its check and weight, so the two never rely on one fill. */
	:global(.ui-select__item[data-highlighted]) {
		background: var(--color-fill);
	}

	:global(.ui-select__item[data-disabled]) {
		color: var(--color-text-disabled);
		cursor: not-allowed;
	}

	:global(.ui-select__item-text) {
		display: grid;
		min-width: 0;
		gap: var(--space-0-5);
	}

	:global(.ui-select__item-detail) {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}

	:global(.ui-select__check) {
		flex: none;
		color: var(--color-accent);
	}

	@media (pointer: coarse) {
		.ui-select :global(.ui-select__trigger),
		:global(.ui-select__item) {
			min-height: var(--control-height-touch);
		}

		/* Nothing a finger types into or reads a value from is under 16px. */
		.ui-select :global(.ui-select__trigger) {
			font-size: var(--font-size-editor);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.ui-select :global(.ui-select__trigger) {
			transition: background-color var(--duration-fast) var(--ease-out-quart);
		}

		:global(.ui-select__content[data-state='open']) {
			animation: ui-select-in var(--duration-fast) var(--ease-out-quart);
		}
	}

	@keyframes ui-select-in {
		from {
			opacity: 0;
			translate: 0 calc(-1 * var(--space-1));
		}
	}
</style>
