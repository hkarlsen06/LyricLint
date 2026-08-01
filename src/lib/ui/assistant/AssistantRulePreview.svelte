<script lang="ts">
	/**
	 * A compact attachment to the answer passage it supports. Canonical details
	 * still come only from the local corpus; the complete reference opens on the
	 * rule's own page in a new tab.
	 */
	import { resolve } from '$app/paths';
	import type { Severity } from '$lib/core/types.js';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import type { RulePreview } from '$lib/assistant/rule-previews.js';

	let { rule }: { rule: RulePreview } = $props();

	const fixDescription = $derived(
		rule.fix === 'safe'
			? 'Fixed automatically'
			: rule.fix === 'preview'
				? 'Previewed fix, confirmed one at a time'
				: 'No automatic fix'
	);
</script>

<section class="assistant-rule" aria-label={`Rule reference: ${rule.title}`}>
	<p class="assistant-rule__attachment">
		<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
			<path
				d="M5.5 8.5l4-4a2.1 2.1 0 013 3l-5.25 5.25a3.2 3.2 0 01-4.5-4.5L8 3"
				fill="none"
				stroke="currentColor"
				stroke-width="1.35"
				stroke-linecap="round"
			/>
		</svg>
		Attached rule
	</p>
	<div class="assistant-rule__head">
		<h4 class="assistant-rule__title">
			<a
				href={resolve('/(site)/rules/[rule]', { rule: rule.slug })}
				target="_blank"
				rel="noopener noreferrer"
			>
				{rule.title}
				<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
					<path
						d="M4 2h6v6M10 2L3 9M8 10H2V4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
		</h4>
		<span class="assistant-rule__meta">
			<SeverityTag severity={rule.severity as Severity} />
			<span class="site-code">{rule.id}</span>
			<span>{fixDescription}{rule.fixLabel ? ` · ${rule.fixLabel}` : ''}</span>
		</span>
	</div>
</section>
