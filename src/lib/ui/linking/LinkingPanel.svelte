<script lang="ts">
	// Decision record: docs/subsystems/section-links.md.
	import { tick } from 'svelte';
	import { Link2, GitCompareArrows } from 'lucide-svelte';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	import type { SectionLinkChoice } from '$lib/core/types.js';
	import { linkOccurrences } from '$lib/editor/section-links.js';
	import { getLanguagePack } from '$lib/languages/registry.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import LinkingDetail from './LinkingDetail.svelte';
	import { linkingOverview, linkingSectionNames, type LinkingOverviewGroup } from './overview.js';

	let {
		controller,
		onShowEditor
	}: { controller: WorkbenchController; onShowEditor?: () => void | Promise<void> } = $props();
	let root: HTMLDivElement;
	const parsed = $derived(controller.snapshot.parsed);
	const sectionNames = $derived(linkingSectionNames(parsed));
	const links = $derived(controller.sectionLinks);
	const pack = $derived(getLanguagePack(controller.language));
	const headerFrom = $derived(controller.linkingHeaderFrom);
	const overview = $derived(linkingOverview(parsed, pack, links));
	const session = $derived.by(() => {
		if (headerFrom === undefined) return undefined;
		const header = parsed.sections.find((section) => section.header?.from === headerFrom)?.header;
		if (!header) return undefined;
		const line = lineNumberAt(parsed.text, headerFrom);
		const group = links.find((link) => link.lines.includes(line));
		const members = parsed.sections.flatMap((section) =>
			section.header && group?.lines.includes(lineNumberAt(parsed.text, section.header.from))
				? [section.header.from]
				: []
		);
		const signature = JSON.stringify(links);
		return {
			headerFrom,
			fromOverview: controller.linkingFromOverview,
			comparedHeaders: controller.linkingComparedHeaders,
			text: parsed.text,
			signature,
			key: JSON.stringify([
				controller.draftId,
				parsed.text,
				signature,
				headerFrom,
				controller.language,
				controller.linkingFromOverview,
				controller.linkingComparedHeaders
			]),
			occurrences: linkOccurrences(parsed, pack, headerFrom, { includeHeaderOffsets: members }),
			selected: members.filter((from) => from !== headerFrom)
		};
	});
	const sectionOnlyActive = $derived.by(() => {
		void links;
		return headerFrom !== undefined && (controller.editor.isTypeOnlyHere?.(headerFrom) ?? false);
	});

	function names(group: LinkingOverviewGroup): string {
		return group.occurrences
			.map((occurrence) => sectionNames.get(occurrence.headerFrom) ?? occurrence.label)
			.join(', ');
	}

	async function navigate(headerFrom: number): Promise<void> {
		await onShowEditor?.();
		const header = controller.editor
			.getSnapshot()
			.parsed.sections.find((section) => section.header?.from === headerFrom)?.header;
		if (!header) return;
		controller.editor.setSelection({ anchor: header.from, head: header.to });
		controller.editor.revealRange({ from: header.from, to: header.to });
	}

	async function navigateLyric(from: number): Promise<void> {
		await onShowEditor?.();
		const text = controller.editor.getSnapshot().parsed.text;
		if (from < 0 || from > text.length) return;
		const start = text.lastIndexOf('\n', from - 1) + 1;
		const end = text.indexOf('\n', from);
		const range = { from: start, to: end < 0 ? text.length : end };
		controller.editor.setSelection({ anchor: range.from, head: range.to });
		controller.editor.revealRange(range);
	}

	async function open(group: LinkingOverviewGroup): Promise<void> {
		controller.openLinking(group.headerFrom, {
			fromOverview: true,
			comparedHeaders: group.occurrences.map((occurrence) => occurrence.headerFrom)
		});
		await tick();
		root.querySelector<HTMLElement>('[data-linking-heading]')?.focus();
	}

	async function back(): Promise<void> {
		controller.closeLinking();
		await tick();
		root.querySelector<HTMLElement>('[data-linking-heading]')?.focus();
	}

	function report(message: string): void {
		controller.feedback.announce(message);
		controller.feedback.addToast({ message });
	}

	function apply(choice: SectionLinkChoice, baseline: NonNullable<typeof session>): void {
		const editor = controller.editor;
		if (
			!editor.linkSections ||
			editor.getSnapshot().text !== baseline.text ||
			JSON.stringify(editor.getSectionLinks?.() ?? []) !== baseline.signature
		) {
			report('The lyrics or links changed. Review the sections again before applying.');
			void back();
			return;
		}
		try {
			editor.linkSections(choice);
			controller.onSectionLinksChanged();
			void back();
		} catch {
			report('These sections could not be linked. Review the current lyrics and try again.');
		}
	}

	function toggleSectionOnly(): void {
		if (headerFrom === undefined || !controller.editor.typeOnlyHere?.(headerFrom)) {
			report('This section is no longer linked. Choose its current group in Linking.');
			return;
		}
		controller.onSectionLinksChanged();
	}
</script>

<div class="panel-content linking-panel" bind:this={root}>
	{#if session}
		{#key session.key}
			{@const baseline = session}
			<LinkingDetail
				occurrences={baseline.occurrences}
				{sectionNames}
				onNavigate={navigate}
				documentText={parsed.text}
				onNavigateLyric={navigateLyric}
				currentHeaderFrom={baseline.headerFrom}
				initialSelected={baseline.selected}
				fromOverview={baseline.fromOverview}
				comparedHeaders={baseline.comparedHeaders}
				differencesFor={(headers) => controller.editor.getLinkDifferences?.(headers) ?? []}
				onApply={(choice) => apply(choice, baseline)}
				onBack={back}
				typeOnlyHereAvailable={controller.editor.canTypeOnlyHere?.(baseline.headerFrom) ?? false}
				typeOnlyHereActive={sectionOnlyActive}
				onTypeOnlyHere={toggleSectionOnly}
			/>
		{/key}
	{:else}
		<h2 tabindex="-1" data-linking-heading>Link repeated sections</h2>
		{#if overview.available.length === 0 && overview.linked.length === 0}
			<p>Repeated sections will appear here so you can keep their shared lyrics in sync.</p>
		{:else}
			{#each [{ title: 'Available to link', groups: overview.available, linked: false }, { title: 'Linked sections', groups: overview.linked, linked: true }] as category (category.title)}
				{#if category.groups.length > 0}
					<section aria-label={category.title}>
						<h3>{category.title}</h3>
						<ul class="linking-groups">
							{#each category.groups as group (group.headerFrom)}
								<li class="linking-group" class:linking-group--linked={category.linked}>
									<div class="linking-group__members">
										<ul class="linked-members" aria-label="Sections in this group">
											{#each group.occurrences as occurrence (occurrence.headerFrom)}
												<li class="linked-member">
													<span class="linked-member__name"
														>{sectionNames.get(occurrence.headerFrom) ?? occurrence.label}</span
													>
													<button
														type="button"
														class="button button--quiet linked-member__line"
														onclick={() => navigate(occurrence.headerFrom)}
														>Line {occurrence.line}</button
													>
												</li>
											{/each}
										</ul>
									</div>
									<div class="linking-group__footer">
										<span class="linking-group__state">
											{#if category.linked}<Link2
													size={16}
													aria-hidden="true"
												/>{:else}<GitCompareArrows size={16} aria-hidden="true" />{/if}
											<span
												>{category.linked
													? group.differenceCount
														? `${group.differenceCount} ${group.differenceCount === 1 ? 'difference' : 'differences'} kept`
														: 'Same lyrics'
													: 'Not linked together'}</span
											>
										</span>
										<button
											class="button"
											type="button"
											aria-label={`${category.linked ? 'Manage' : 'Set up link'} ${names(group)}`}
											onclick={() => open(group)}
											>{category.linked ? 'Manage' : 'Set up link'}</button
										>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		{/if}
	{/if}
</div>

<style>
	.linking-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}
	h3 {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}
	p {
		color: var(--color-text-muted);
		line-height: var(--line-height-body);
	}
	section {
		display: grid;
		gap: var(--space-5);
	}
	.linking-groups {
		display: grid;
		gap: var(--space-6);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.linking-group {
		display: grid;
		gap: var(--space-3);
	}
	.linking-group + .linking-group {
		border-block-start: var(--border-width) solid var(--color-border);
		padding-block-start: var(--space-6);
	}
	.linking-group__members {
		padding-inline-start: var(--space-2);
	}
	.linked-members {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.linked-member {
		position: relative;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 0 var(--space-2) var(--space-5);
		border-inline-start: var(--border-width) dashed var(--color-border-strong);
	}
	.linking-group--linked .linked-member {
		border-inline-start-style: solid;
	}
	.linked-member::before {
		content: '';
		position: absolute;
		inset-inline-start: 0;
		top: 50%;
		width: var(--space-3);
		border-block-start: var(--border-width) solid var(--color-border-strong);
	}
	.linked-member__name {
		font-weight: var(--font-weight-semibold);
		overflow-wrap: anywhere;
	}
	.linked-member__line {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-variant-numeric: tabular-nums;
		text-decoration: underline;
		text-underline-offset: var(--space-0-5);
	}
	.linking-group__footer {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		justify-content: space-between;
	}
	.linking-group__state {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.linking-group__footer button {
		flex: none;
	}
</style>
