<script lang="ts">
	import DiffExcerpt from './DiffExcerpt.svelte';
	import { Switch } from 'bits-ui';
	import { tick, untrack } from 'svelte';
	import type { LinkDifference, SectionLinkChoice } from '$lib/core/types.js';
	import type { LinkOccurrence } from '$lib/editor/section-links.js';
	import { describeControl } from '$lib/ui/state/control-tooltip.svelte.js';

	interface Props {
		occurrences: readonly LinkOccurrence[];
		currentHeaderFrom: number;
		sectionNames?: ReadonlyMap<number, string>;
		initialSelected?: readonly number[];
		fromOverview?: boolean;
		comparedHeaders?: readonly number[];
		differencesFor: (headers: number[]) => LinkDifference[];
		onApply: (choice: SectionLinkChoice) => void;
		onBack: () => void;
		onNavigate?: (headerFrom: number) => void;
		documentText?: string;
		onNavigateLyric?: (from: number) => void;
		typeOnlyHereAvailable?: boolean;
		typeOnlyHereActive?: boolean;
		onTypeOnlyHere?: () => void;
	}
	let {
		occurrences,
		currentHeaderFrom,
		sectionNames,
		initialSelected = [],
		fromOverview = false,
		comparedHeaders,
		differencesFor,
		onApply,
		onBack,
		onNavigate,
		documentText = '',
		onNavigateLyric,
		typeOnlyHereAvailable = false,
		typeOnlyHereActive = false,
		onTypeOnlyHere
	}: Props = $props();
	const id = $props.id();
	const current = $derived(occurrences.find((item) => item.headerFrom === currentHeaderFrom));
	const kind = $derived(current?.label.replace(/\s+\d+$/u, '') ?? 'Section');
	const wasLinked = $derived(initialSelected.length > 0);
	const initialHeaders = $derived([currentHeaderFrom, ...initialSelected]);
	let selected = $state<number[]>(
		untrack(() =>
			fromOverview
				? [
						...(comparedHeaders ??
							(initialSelected.length > 0
								? [currentHeaderFrom, ...initialSelected]
								: occurrences.map((item) => item.headerFrom)))
					]
				: [currentHeaderFrom, ...initialSelected]
		)
	);
	let winners = $state<Record<number, number>>({});
	let fullVersion = $state<number | undefined>();
	let reviewing = $state(false);
	let topActionVisible = $state(true);
	let topAction: HTMLDivElement;
	let approach = $state<'differences' | 'full' | undefined>();
	let root: HTMLDivElement;
	const headers = $derived(
		fromOverview
			? occurrences
					.filter((item) => selected.includes(item.headerFrom))
					.map((item) => item.headerFrom)
			: [currentHeaderFrom, ...selected.filter((header) => header !== currentHeaderFrom)]
	);
	const membershipChanged = $derived(
		headers.length !== initialHeaders.length ||
			headers.some((header) => !initialHeaders.includes(header))
	);
	const differences = $derived(headers.length > 1 ? differencesFor(headers) : []);
	const emptyHeaders = $derived(
		occurrences.filter((item) => item.comparison === 'empty').map((item) => item.headerFrom)
	);
	const selectedEmpty = $derived(headers.filter((header) => emptyHeaders.includes(header)));
	// An entirely untyped copy is a fill, not an absent phrase the writer chose.
	const fillsOnlyEmptyCopies = $derived(
		membershipChanged &&
			differences.length > 0 &&
			differences.every((difference) => {
				const populated = difference.wordings.filter(
					(wording) => !emptyHeaders.includes(wording.headerFrom)
				);
				return (
					populated.length > 0 &&
					populated.some((wording) => wording.text.trim()) &&
					populated.every((wording) => wording.text === populated[0]?.text) &&
					difference.wordings.some((wording) => emptyHeaders.includes(wording.headerFrom))
				);
			})
	);
	const fillSource = $derived(headers.find((header) => !emptyHeaders.includes(header)));
	const changeCount = $derived(Object.keys(winners).length);
	const changed = $derived(membershipChanged || changeCount > 0);
	const canApply = $derived(
		changed &&
			(headers.length > 1 || (!fromOverview && wasLinked)) &&
			!(
				reviewing &&
				approach === 'full' &&
				differences.length > 0 &&
				!fillsOnlyEmptyCopies &&
				fullVersion === undefined
			)
	);
	const applyLabel = $derived.by(() => {
		if (headers.length < 2)
			return !fromOverview && wasLinked ? 'Unlink this section' : 'Link sections';
		if (fillsOnlyEmptyCopies) return `Fill ${groupName(selectedEmpty)} and link`;
		if (changeCount > 0)
			return `${membershipChanged ? 'Link and apply' : 'Apply'} ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`;
		return wasLinked ? 'Update links' : `Link ${headers.length} sections`;
	});
	const fullVersions = $derived.by(() => {
		const versions: { key: string; headers: number[] }[] = [];
		for (const header of headers.filter((header) => !emptyHeaders.includes(header))) {
			const key = JSON.stringify(
				differences.map(
					(difference) => difference.wordings.find((wording) => wording.headerFrom === header)?.text
				)
			);
			const same = versions.find((version) => version.key === key);
			if (same) same.headers.push(header);
			else versions.push({ key, headers: [header] });
		}
		return versions;
	});
	const mac = 'navigator' in globalThis && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);
	const shortcut = mac ? '⇧⌘L' : 'Ctrl+Shift+L';

	$effect(() => {
		if (!topAction) return;
		const observer = new IntersectionObserver(([entry]) => {
			topActionVisible = entry?.isIntersecting ?? true;
		});
		observer.observe(topAction);
		return () => observer.disconnect();
	});

	function sectionName(item: LinkOccurrence): string {
		return (
			sectionNames?.get(item.headerFrom) ??
			(current?.sameKind && item.sameKind ? `${kind} ${item.ordinal}` : item.label)
		);
	}
	function groupName(group: readonly number[]): string {
		const members = occurrences.filter((item) => group.includes(item.headerFrom));
		const labels = members.map(sectionName);
		const parts = labels.map((label) => /^(.*?) (\d+)$/u.exec(label));
		const prefix = parts[0]?.[1];
		const sharedPrefix = prefix !== undefined && parts.every((part) => part?.[1] === prefix);
		const names = sharedPrefix ? parts.map((part) => part![2]!) : labels;
		const joined =
			names.length < 3 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
		return sharedPrefix ? `${prefix} ${joined}` : joined;
	}
	function versionsFor(difference: LinkDifference) {
		const versions: {
			text: string;
			headers: number[];
			wording: LinkDifference['wordings'][number];
		}[] = [];
		for (const wording of difference.wordings) {
			const existing = versions.find((version) => version.text === wording.text);
			if (existing) {
				existing.headers.push(wording.headerFrom);
				if (
					emptyHeaders.includes(existing.wording.headerFrom) &&
					!emptyHeaders.includes(wording.headerFrom)
				)
					existing.wording = wording;
			} else versions.push({ text: wording.text, headers: [wording.headerFrom], wording });
		}
		return versions;
	}
	async function setReviewing(next: boolean): Promise<void> {
		if (!next && changeCount > 0) return;
		reviewing = next;
		if (next) approach = undefined;
		await tick();
		root.querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus();
	}
	function setApproach(next: 'differences' | 'full'): void {
		if (approach === next) return;
		resetChoices();
		approach = next;
	}
	function clearWording(): void {
		winners = {};
		fullVersion = undefined;
	}
	function resetChoices(): void {
		approach = undefined;
		clearWording();
	}
	function toggle(header: number): void {
		selected = selected.includes(header)
			? selected.filter((item) => item !== header)
			: [...selected, header];
		resetChoices();
	}
	function chooseFullVersion(header: number): void {
		fullVersion = header;
		winners = Object.fromEntries(differences.map((difference) => [difference.index, header]));
	}
	function chooseWording(index: number, header: number): void {
		fullVersion = undefined;
		winners = { ...winners, [index]: header };
	}
	function keep(index: number): void {
		const next = { ...winners };
		delete next[index];
		winners = next;
		fullVersion = undefined;
	}
	function winningText(difference: LinkDifference): string | undefined {
		const winner = fillsOnlyEmptyCopies ? fillSource : winners[difference.index];
		return difference.wordings.find((wording) => wording.headerFrom === winner)?.text;
	}
	// Context must never show a neighboring variation as though it disappeared.
	function beforeContext(text: string, multiline: boolean, hasPrevious: boolean): string {
		const end = multiline && text.endsWith('\n') ? text.length - 1 : text.length;
		const start = text.lastIndexOf('\n', end - 1) + 1;
		return `${hasPrevious && start === 0 && !text.startsWith('\n') ? '…' : ''}${text.slice(start)}`;
	}
	function afterContext(text: string, multiline: boolean, hasNext: boolean): string {
		const end = text.indexOf('\n', multiline && text.startsWith('\n') ? 1 : 0);
		return `${end < 0 ? text : text.slice(0, end)}${hasNext && end < 0 && !text.endsWith('\n') ? '…' : ''}`;
	}
	function apply(): void {
		if (!canApply) return;
		onApply({
			headers,
			keepDifferent: differences.map(
				(difference) => !fillsOnlyEmptyCopies && winners[difference.index] === undefined
			),
			replaceFromByDifference: differences.map((difference) =>
				fillsOnlyEmptyCopies ? fillSource : winners[difference.index]
			)
		});
	}
	function handleKeydown(event: KeyboardEvent): void {
		if (!(event.target instanceof Node) || !root?.contains(event.target)) return;
		if (
			!fromOverview &&
			wasLinked &&
			typeOnlyHereAvailable &&
			onTypeOnlyHere &&
			!changed &&
			(mac ? event.metaKey : event.ctrlKey) &&
			event.shiftKey &&
			!event.altKey &&
			(event.code === 'KeyL' || event.key.toLocaleLowerCase() === 'l')
		) {
			event.preventDefault();
			event.stopPropagation();
			onTypeOnlyHere();
		}
	}
</script>

{#snippet applyControl(footer: boolean)}
	<button type="button" class="button button--contrast" disabled={!canApply} onclick={apply}>
		<span class="action-label">
			<span class="layout-measure" aria-hidden="true">Keep differences and link</span>
			<span
				>{footer && changeCount === 0 && membershipChanged && !wasLinked
					? 'Keep differences and link'
					: applyLabel}</span
			>
			{#if differences.length > 0 && !fillsOnlyEmptyCopies}<span
					class="layout-measure"
					aria-hidden="true"
					>{membershipChanged ? 'Link and apply' : 'Apply'}
					{differences.length}
					{differences.length === 1 ? 'change' : 'changes'}</span
				>{/if}
		</span>
	</button>
{/snippet}

{#snippet secondaryControl(footer = false)}
	{#if differences.length > 0 && !fillsOnlyEmptyCopies && (!footer || changeCount > 0)}
		<button
			type="button"
			class="button button--quiet"
			aria-expanded={changeCount > 0 ? undefined : reviewing}
			onclick={() => (changeCount > 0 ? clearWording() : setReviewing(!reviewing))}
		>
			<span class="action-label"
				><span
					>{changeCount > 0
						? 'Cancel'
						: reviewing
							? 'Hide differences'
							: 'Review differences'}</span
				><span class="layout-measure" aria-hidden="true">Hide differences</span><span
					class="layout-measure"
					aria-hidden="true">Review differences</span
				></span
			>
		</button>
	{/if}
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<div class="linking-detail" bind:this={root}>
	<button type="button" class="button button--quiet button--flush back" onclick={onBack}
		>← Back to linking</button
	>
	<h2 tabindex="-1" data-linking-heading>
		{fromOverview
			? wasLinked
				? 'Manage linked sections'
				: 'Link sections'
			: `${wasLinked ? 'Manage' : 'Link'} ${current ? sectionName(current) : 'sections'}`}
	</h2>
	<fieldset class="members">
		<legend>Sections to link</legend>
		{#each occurrences as item (item.headerFrom)}
			{@const isSource = !fromOverview && item.headerFrom === currentHeaderFrom}
			<div class="member">
				<label class="member__choice">
					<input
						type="checkbox"
						aria-labelledby={`${id}-member-${item.headerFrom} ${id}-line-${item.headerFrom}`}
						aria-describedby={['same', 'different', 'similar'].includes(item.comparison)
							? `${id}-comparison-${item.headerFrom}`
							: undefined}
						checked={selected.includes(item.headerFrom)}
						disabled={isSource}
						onchange={() => toggle(item.headerFrom)}
					/>
					<span id={`${id}-member-${item.headerFrom}`} class="member__identity"
						><span class="member__name">{sectionName(item)}</span>{#if isSource}<span
								class="member__state">This section</span
							>{:else if item.comparison === 'empty'}<span class="member__state">No lyrics yet</span
							>{/if}</span
					>
				</label>
				{#if item.comparison === 'same' || item.comparison === 'different' || item.comparison === 'similar'}
					<span
						id={`${id}-comparison-${item.headerFrom}`}
						class="member__comparison"
						title={current?.comparison === 'empty'
							? 'Compared with the first populated matching section'
							: `Compared with ${current ? sectionName(current) : 'the reference section'}`}
					>
						{item.comparison === 'same' ? '✓ Same lyrics' : '≠ Differs'}
					</span>
				{/if}
				{#if onNavigate}<button
						id={`${id}-line-${item.headerFrom}`}
						type="button"
						class="button button--quiet member__line"
						onclick={() => onNavigate?.(item.headerFrom)}>Line {item.line}</button
					>
				{:else}<span id={`${id}-line-${item.headerFrom}`} class="member__line"
						>Line {item.line}</span
					>{/if}
			</div>
		{/each}
	</fieldset>
	{#if headers.length > 1}
		{#if fillsOnlyEmptyCopies && fillSource !== undefined}
			<p class="outcome">
				Fill {groupName(selectedEmpty)} with {groupName([fillSource])}’s lyrics and link them.
			</p>
		{:else if differences.length === 0}
			<p class="outcome">
				These sections have the same lyrics. Linked edits will update them together.
			</p>
		{:else}
			<p class="outcome">
				Differences stay as written unless you choose replacements. Edits to shared lyrics update
				linked sections.
			</p>
			{#if selectedEmpty.length > 0}<p class="outcome">
					{groupName(selectedEmpty)} will stay empty unless you choose wording to add.
				</p>{/if}
		{/if}
	{:else if !fromOverview && wasLinked}
		<p class="outcome">Unlinking keeps this section’s lyrics as written.</p>
	{:else}
		<p class="outcome">Select at least two sections to link.</p>
	{/if}
	<div class="actions">
		<div
			bind:this={topAction}
			class:layout-measure={reviewing && !topActionVisible}
			inert={reviewing && !topActionVisible}
			aria-hidden={reviewing && !topActionVisible ? true : undefined}
		>
			{@render applyControl(false)}
		</div>
		<div
			class:layout-measure={reviewing && !topActionVisible}
			inert={reviewing && !topActionVisible}
			aria-hidden={reviewing && !topActionVisible ? true : undefined}
		>
			{@render secondaryControl()}
		</div>
	</div>
	{#if differences.length > 0 && (fillsOnlyEmptyCopies || reviewing)}
		<section class="differences" aria-labelledby={`${id}-differences-title`}>
			<h3 id={`${id}-differences-title`}>
				{fillsOnlyEmptyCopies
					? 'Fill preview'
					: approach === 'full'
						? 'Replacement preview'
						: 'Differences'}
			</h3>
			{#if !fillsOnlyEmptyCopies}<p class="outcome">
					Compare the highlighted wording. Differences stay as written unless you choose
					replacements below.
				</p>{/if}
			{#each differences as difference, position (difference.index)}
				{@const winning = winningText(difference)}
				{@const versions = versionsFor(difference)}
				{@const multiline = difference.wordings.some((wording) => wording.text.includes('\n'))}
				<section class="difference" aria-labelledby={`${id}-difference-${difference.index}`}>
					<div class="difference__heading">
						<h4 id={`${id}-difference-${difference.index}`}>Difference {position + 1}</h4>
					</div>
					{#each versions as version (version.text)}
						{@const changing = winning !== undefined && winning !== version.text}
						{@const before = beforeContext(version.wording.before, multiline, position > 0)}
						{@const after = afterContext(
							version.wording.after,
							multiline,
							position < differences.length - 1
						)}
						{@const selectable =
							!fillsOnlyEmptyCopies &&
							approach === 'differences' &&
							!emptyHeaders.includes(version.wording.headerFrom)}
						{@const choiceId = `${id}-wording-${difference.index}-${version.wording.headerFrom}`}
						<div class="version">
							<div class="version__choice">
								{#if selectable}
									<input
										id={choiceId}
										type="checkbox"
										checked={winning === version.text}
										aria-label={`Use ${groupName(version.headers)} wording for difference ${position + 1} in all ${headers.length} sections`}
										onchange={() =>
											winning === version.text
												? keep(difference.index)
												: chooseWording(difference.index, version.wording.headerFrom)}
									/>
								{:else}
									<span class="version__bullet" aria-hidden="true">•</span>
								{/if}
								<h5>
									{#if selectable}<label for={choiceId}>{groupName(version.headers)}</label
										>{:else}{groupName(version.headers)}{/if}
								</h5>
								<span class="version__state action-label">
									<span>{changing ? 'Preview' : winning !== undefined ? 'Selected' : ''}</span>
									<span class="layout-measure" aria-hidden="true">Selected</span>
									<span class="layout-measure" aria-hidden="true">Preview</span>
								</span>
							</div>
							<div class="wording-preview">
								{#each [undefined, ...(changing ? [winning] : []), ...versions
										.filter((candidate) => candidate.text !== version.text && !emptyHeaders.includes(candidate.wording.headerFrom))
										.map((candidate) => candidate.text)] as replacement, previewIndex (previewIndex)}
									{@const hidden =
										previewIndex === 0 ? changing : !(changing && previewIndex === 1)}
									<div
										class:layout-measure={hidden}
										class:lyrics--original={previewIndex === 0}
										aria-hidden={hidden ? true : undefined}
									>
										<DiffExcerpt
											{before}
											text={version.text}
											{after}
											{replacement}
											{hidden}
											{documentText}
											leadingEllipsis={before.length > version.wording.before.length}
											sources={difference.wordings
												.filter((wording) => version.headers.includes(wording.headerFrom))
												.map((wording) => ({
													from:
														wording.from -
														before.length +
														(before.length > version.wording.before.length ? 1 : 0),
													name: groupName([wording.headerFrom])
												}))}
											onNavigate={onNavigateLyric}
										/>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</section>
			{/each}
		</section>
	{/if}

	{#if reviewing && differences.length > 0 && !fillsOnlyEmptyCopies}
		<section class="approach-picker" aria-labelledby={`${id}-approach-heading`}>
			<div class="decision-heading">
				<h3 id={`${id}-approach-heading`}>What would you like to do?</h3>
				<button
					type="button"
					class="button button--quiet"
					class:layout-measure={changeCount === 0 || topActionVisible}
					inert={changeCount === 0 || topActionVisible}
					aria-hidden={changeCount === 0 || topActionVisible ? true : undefined}
					onclick={clearWording}>Cancel</button
				>
			</div>
			<div class="actions footer-actions">
				<div
					class:layout-measure={topActionVisible}
					inert={topActionVisible}
					aria-hidden={topActionVisible ? true : undefined}
				>
					{@render applyControl(true)}
				</div>
			</div>
			<div class="choice-divider" class:choice-divider--pending={changeCount > 0}>
				<span
					class:layout-measure={changeCount > 0}
					aria-hidden={changeCount > 0 ? true : undefined}>or</span
				>
			</div>
			{#each [{ value: 'differences', label: 'Choose wording per difference', description: 'Keep or change individual passages.' }, { value: 'full', label: 'Use one section’s full version', description: 'Make the selected sections identical.' }] as option (option.value)}
				<button
					type="button"
					class="button approach-choice"
					aria-label={option.label}
					aria-describedby={`${id}-approach-note`}
					aria-pressed={approach === option.value}
					onclick={() => setApproach(option.value as 'differences' | 'full')}
				>
					<span class="approach-choice__copy"
						><span class="approach-choice__title">{option.label}</span><span
							class="approach-choice__description">{option.description}</span
						></span
					>
					<span aria-hidden="true">{approach === option.value ? '✓' : '→'}</span>
				</button>
			{/each}
			<p id={`${id}-approach-note`} class="sr-only">
				Changing approach clears pending wording choices.
			</p>
		</section>
		{#if approach === 'full'}
			<fieldset class="wording-policy">
				<legend>Which full version?</legend>
				<p class="outcome">Replace every selected section’s lyrics with this version.</p>
				{#each fullVersions as version (version.key)}
					<label class="policy-choice"
						><input
							type="radio"
							name={`${id}-version`}
							checked={fullVersion !== undefined && version.headers.includes(fullVersion)}
							onchange={() => chooseFullVersion(version.headers[0]!)}
						/><span>Use {groupName(version.headers)}’s full version</span></label
					>
				{/each}
			</fieldset>
		{/if}
	{/if}
	<p class="sr-only" aria-live="polite">
		{changeCount > 0
			? `${changeCount} wording ${changeCount === 1 ? 'change' : 'changes'} pending. Lyrics have not changed yet.`
			: ''}
	</p>
	{#if !fromOverview && wasLinked && typeOnlyHereAvailable && onTypeOnlyHere}
		<div class="section-only">
			<div class="toggle-field">
				<label for={`${id}-section-only`}>Edit this section only</label><Switch.Root
					id={`${id}-section-only`}
					class="switch"
					checked={typeOnlyHereActive}
					disabled={changed}
					onCheckedChange={() => onTypeOnlyHere?.()}
					aria-keyshortcuts={mac ? 'Meta+Shift+L' : 'Control+Shift+L'}
					{@attach describeControl(() => ({ label: 'Edit this section only', shortcut }))}
					><Switch.Thumb class="switch__thumb" /></Switch.Root
				>
			</div>
			<p>
				{typeOnlyHereActive
					? 'On: edits in this section stay here.'
					: 'Off: edits to shared lyrics update linked sections.'} <kbd>{shortcut}</kbd>
			</p>
		</div>
	{/if}
</div>

<style>
	.linking-detail {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	h2,
	h3,
	h4,
	h5,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}
	h3,
	legend {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}
	h4 {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}
	h5 {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	p {
		line-height: var(--line-height-body);
	}
	.back {
		justify-self: start;
	}
	.approach-picker {
		display: grid;
		gap: var(--space-3);
	}
	.approach-choice {
		width: 100%;
		height: auto;
		justify-content: space-between;
		text-align: start;
		padding: var(--space-3);
		gap: var(--space-3);
		white-space: normal;
	}
	.approach-choice[aria-pressed='true'] {
		background: var(--color-control-hover);
	}
	.approach-choice__copy {
		display: grid;
		gap: var(--space-1);
	}
	.approach-choice__title {
		font-weight: var(--font-weight-semibold);
	}
	.approach-choice__description {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-regular);
	}
	.members,
	.wording-policy {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	legend {
		margin-bottom: var(--space-3);
	}
	.member {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		min-height: var(--control-height-md);
		padding-block: var(--space-2);
	}
	.member__choice {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: 1;
		min-width: 0;
	}
	button.member__line {
		text-decoration: underline;
		text-underline-offset: var(--space-0-5);
	}
	.member input,
	.policy-choice input {
		margin: 0;
		accent-color: var(--color-accent);
		flex: none;
	}
	.member__identity {
		display: grid;
		gap: var(--space-0-5);
		flex: 1;
		min-width: 0;
	}
	.member__name {
		font-weight: var(--font-weight-medium);
		overflow-wrap: anywhere;
	}
	.member__state,
	.member__line {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.member__line {
		font-family: var(--font-mono);
		white-space: nowrap;
	}
	.policy-choice {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--control-height-md);
		padding-block: var(--space-2);
	}
	.policy-choice span {
		line-height: var(--line-height-body);
	}
	.outcome {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.differences {
		display: grid;
		gap: var(--space-4);
	}
	.difference {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--color-fill-subtle);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-control);
		min-width: 0;
	}
	.version + .version {
		padding-block-start: var(--space-3);
		border-block-start: var(--border-width) solid var(--color-border);
	}
	.difference__heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.version {
		display: grid;
		gap: var(--space-2);
	}
	.version__choice {
		display: grid;
		grid-template-columns: 1em minmax(0, 1fr) max-content;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--control-height-md);
	}
	@media (pointer: coarse) {
		.version__choice {
			min-height: var(--control-height-touch);
		}
	}
	.version__bullet {
		text-align: center;
		color: var(--color-text-muted);
	}
	.version__choice h5 {
		grid-column: 2;
	}
	.version__choice input {
		margin: 0;
		accent-color: var(--color-accent);
	}
	.member__comparison {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.version__state {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-2);
	}
	.choice-divider {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.choice-divider::before,
	.choice-divider::after {
		content: '';
		flex: 1;
		border-block-start: var(--border-width) solid var(--color-border);
	}
	.choice-divider--pending::after {
		position: absolute;
		inset-inline: 0;
		inset-block-start: 50%;
	}
	.footer-actions {
		grid-template-columns: minmax(0, 1fr);
	}
	.decision-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.decision-heading > button {
		flex: none;
	}
	.actions > div > button {
		width: 100%;
		height: 100%;
		min-width: 0;
		white-space: normal;
	}
	.action-label,
	.wording-preview {
		display: grid;
		min-width: 0;
	}
	.action-label > span,
	.wording-preview > div {
		grid-area: 1 / 1;
		min-width: 0;
	}
	.action-label > span {
		align-self: center;
	}
	.layout-measure {
		visibility: hidden;
		pointer-events: none;
		user-select: none;
	}
	.section-only {
		display: grid;
		gap: var(--space-2);
		padding-block-start: var(--space-4);
		border-block-start: var(--border-width) solid var(--color-border);
	}
	.section-only p {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.member input:focus-visible,
	.policy-choice input:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
</style>
