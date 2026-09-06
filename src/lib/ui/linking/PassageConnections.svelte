<script lang="ts">
	import type { LinkConnectionPreview } from '$lib/core/types.js';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	import DiffExcerpt from './DiffExcerpt.svelte';

	let {
		connectionsFor,
		nameFor,
		documentText,
		onNavigate,
		onReconnect
	}: {
		connectionsFor: () => LinkConnectionPreview[];
		nameFor: (header: number) => string;
		documentText: string;
		onNavigate?: (from: number) => void;
		onReconnect: () => void;
	} = $props();
	const id = $props.id();
	let expanded = $state(false);
	const connections = $derived(
		connectionsFor()
			.filter((connection) => connection.added)
			.map((connection) => ({
				...connection,
				from: connection.text.trim()
					? connection.from + connection.text.length - connection.text.trimStart().length
					: connection.from,
				text: connection.text.trim() || connection.text
			}))
	);
	const groups = $derived.by(() => {
		const result: {
			key: string;
			headers: number[];
			passages: LinkConnectionPreview[];
		}[] = [];
		for (const connection of connections) {
			const headers = [...connection.headers].sort((a, b) => a - b);
			const key = JSON.stringify(headers);
			const existing = result.find((group) => group.key === key);
			if (existing) existing.passages.push(connection);
			else result.push({ key, headers, passages: [connection] });
		}
		return result;
	});
	function wordContext(passage: LinkConnectionPreview) {
		// A stored connection can end mid-word after a local edit. Show the
		// adjacent letters as context, without claiming they are being reconnected.
		const before = /^[\p{L}\p{M}\p{N}'’\-‐‑]/u.test(passage.text)
			? (documentText.slice(0, passage.from).match(/[\p{L}\p{M}\p{N}'’\-‐‑]+$/u)?.[0] ?? '')
			: '';
		const after = /[\p{L}\p{M}\p{N}'’\-‐‑]$/u.test(passage.text)
			? (documentText
					.slice(passage.from + passage.text.length)
					.match(/^[\p{L}\p{M}\p{N}'’\-‐‑]+/u)?.[0] ?? '')
			: '';
		return { before, after };
	}

	const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
</script>

{#if connections.length > 0}
	<div class="passage-connections">
		<button
			type="button"
			class="button button--quiet button--flush disclosure"
			aria-expanded={expanded}
			aria-controls={`${id}-connections`}
			onclick={() => (expanded = !expanded)}>Link matching lyrics again</button
		>
		{#if expanded}
			<section id={`${id}-connections`} aria-labelledby={`${id}-title`}>
				<h3 id={`${id}-title`}>Lyrics to link again</h3>
				<p>
					Edits to the highlighted lyrics will update the other listed sections, even where you
					previously edited them separately. Their wording stays as written.
				</p>
				{#each groups as group (group.key)}
					<section class="connection-group" aria-label={list.format(group.headers.map(nameFor))}>
						<h4>{list.format(group.headers.map(nameFor))}</h4>
						<ul>
							{#each group.passages as passage, index (index)}
								{@const context = wordContext(passage)}
								<li>
									{#if passage.text.trim()}
										<DiffExcerpt
											before={context.before}
											text={passage.text}
											after={context.after}
											hidden={false}
											{documentText}
											sources={[
												{
													from: passage.from - context.before.length,
													name: nameFor(passage.headers[0]!)
												}
											]}
											{onNavigate}
										/>
									{:else}
										<div class="empty-passage">
											<p>
												{passage.text.length
													? 'Keep these spaces and line breaks in sync.'
													: 'Keep text typed at this position in sync.'}
											</p>
											{#if onNavigate}
												<button
													type="button"
													class="button button--quiet"
													aria-label={`Go to ${nameFor(passage.headers[0]!)}, line ${lineNumberAt(documentText, passage.from)}`}
													onclick={() => onNavigate?.(passage.from)}
													>Line {lineNumberAt(documentText, passage.from)}</button
												>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
				<button type="button" class="button button--contrast reconnect" onclick={onReconnect}
					>Link these lyrics again</button
				>
			</section>
		{/if}
	</div>
{/if}

<style>
	.passage-connections,
	section,
	ul {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	.disclosure {
		justify-self: start;
		text-align: start;
	}
	h3,
	h4,
	p,
	ul {
		margin: 0;
	}
	h3,
	h4 {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		overflow-wrap: anywhere;
	}
	p {
		color: var(--color-text-muted);
		line-height: var(--line-height-body);
	}
	.connection-group {
		gap: var(--space-2);
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		min-width: 0;
	}
	.empty-passage {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.empty-passage button {
		flex: none;
	}
	.reconnect {
		white-space: normal;
	}
</style>
