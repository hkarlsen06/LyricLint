<script lang="ts">
	import type { Diagnostic, SourceReference, TextRange } from '#lib/core/types.js';
	import { tick, type Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import ChecksIcon from 'phosphor-svelte/lib/ChecksIcon';
	import { groupDecisions, type Decision } from '#lib/diagnostics/decisions.js';
	import { diagnosticKey, orderDiagnostics } from '#lib/diagnostics/order.js';
	import { describeControl } from '#lib/ui/state/control-tooltip.svelte.js';
	import DiagnosticMeta from '#lib/diagnostics/DiagnosticMeta.svelte';
	import DiagnosticDetails from './DiagnosticDetails.svelte';

	let {
		diagnostics,
		decisions,
		rowKey,
		active = true,
		overview = false,
		focusedOnly = false,
		sources,
		activeDiagnosticKey,
		activeDiagnosticRange,
		emptyState,
		emptyActions,
		lineFor,
		onNavigate,
		onChooseHeader,
		canAssignPerformers = () => true,
		onAssignPerformers = () => {},
		onLinkSections,
		onSetLanguage,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		fixBatchSize,
		onApplyFixBatch,
		onIgnore,
		onAnnounce
	}: {
		diagnostics: readonly Diagnostic[];
		/**
		 * The rows in the order to draw them, from the shell, which shares one
		 * grouping per snapshot with every count of them and keeps their order.
		 * Without it the list groups `diagnostics` itself.
		 */
		decisions?: readonly Decision[];
		rowKey: (diagnostic: Diagnostic) => string;
		active?: boolean;
		overview?: boolean;
		focusedOnly?: boolean;
		sources: ReadonlyMap<string, SourceReference>;
		activeDiagnosticKey?: string;
		activeDiagnosticRange?: TextRange;
		/** Empty, clean, and set-aside reviews have distinct composed states.
		 * Filtered findings stay beside the controls that reveal them. */
		emptyState: {
			title: string;
			detail: string;
			clean?: boolean;
			settled?: boolean;
			waiting?: boolean;
			status?: boolean;
		};
		/**
		 * What the reader can do about the empty state, when there is anything.
		 * Only the untouched-document case has an answer worth a control; the
		 * other three are already resolved by something elsewhere in the panel.
		 */
		emptyActions?: Snippet;
		lineFor?: (offset: number) => number;
		onNavigate: (diagnostic: Diagnostic) => void;
		onChooseHeader: (diagnostic: Diagnostic) => void;
		/**
		 * Whether the expanded card offers the performer assignment. A section
		 * that cannot take one (no header, or two styled voices and no plain
		 * lyrics) gets no button rather than one that only explains itself.
		 */
		canAssignPerformers?: (diagnostic: Diagnostic) => boolean;
		onAssignPerformers?: (diagnostic: Diagnostic) => void;
		/** Open the link picker on a repeated section. The rule found the group;
		 *  the picker is what names it before anything is overwritten. */
		onLinkSections?: (diagnostic: Diagnostic) => void;
		onSetLanguage: (language: string) => void;
		onPreviewFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		onCancelPreview: () => void;
		onApplyFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		/**
		 * The batch behind a fix, and the way to apply it. Both come from the
		 * shell, which plans against the whole visible list; a card only knows
		 * its own finding.
		 */
		fixBatchSize?: (
			diagnostic: Diagnostic,
			fix: NonNullable<Diagnostic['fixes']>[number]
		) => number;
		onApplyFixBatch?: (
			diagnostic: Diagnostic,
			fix: NonNullable<Diagnostic['fixes']>[number]
		) => void;
		onIgnore: (diagnostic: Diagnostic) => void;
		/** Say something to a screen reader without drawing it. */
		onAnnounce?: (message: string) => void;
	} = $props();

	// The panel's reading order is shared with the state that follows it: after a
	// fix the workbench hands the editor to the diagnostic this list leads with,
	// so the two may not sort by different rules.
	const cardKey = diagnosticKey;
	const activeKey = $derived(active ? activeDiagnosticKey : undefined);
	// One row per decision. A decision whose findings cannot share a row is keyed
	// by its one finding's row identity, so it survives edits above it.
	const latest = $derived(decisions ?? groupDecisions(orderDiagnostics(diagnostics), rowKey));
	let lastRows: Array<Decision & { location: string | undefined }> = [];
	const rows = $derived.by(() => {
		// Keep the same controls while hidden, without numbering or updating
		// their contents for a pane the user cannot see. Activation reads the
		// latest complete snapshot before these controls become actionable.
		if (active) {
			lastRows = latest.map((decision) => ({
				...decision,
				location: location(decision.members)
			}));
		}
		return lastRows;
	});

	// A grouped row says how many places it stands for and nothing more, so its
	// meta line stays one line; the stepper says which place is open and where.
	function location(members: readonly Diagnostic[]): string | undefined {
		const [first] = members;
		if (!first) return undefined;
		if (members.length > 1) return `${members.length} places`;
		if (!lineFor) return undefined;
		return `Line ${lineFor(cardKey(first) === activeKey ? (activeDiagnosticRange?.from ?? first.from) : first.from)}`;
	}

	// Exactly one row sits expanded at a time, open on one of its places; before
	// any explicit choice the top row starts expanded so the panel is never a wall
	// of closed rows. The place is held by its row identity, never by ordinal, so
	// an answered place hands over to its decision's next one rather than to
	// whatever now sits at its index.
	let chosenKey = $state<string | undefined>();
	let chosenDecision = $state<string | undefined>();
	let collapsedKey = $state<string | undefined>();
	let list = $state<HTMLOListElement>();
	const selected = $derived.by(() => {
		const find = (matches: (member: Diagnostic) => boolean) => {
			for (const row of rows) {
				const member = row.members.find(matches);
				if (member) return { row, member };
			}
		};
		const opening = (row: Decision | undefined) => row && { row, member: row.members[0]! };
		return (
			(activeKey ? find((member) => cardKey(member) === activeKey) : undefined) ??
			(chosenKey ? find((member) => rowKey(member) === chosenKey) : undefined) ??
			opening(rows.find((row) => row.key === chosenDecision)) ??
			opening(rows[0])
		);
	});
	const selectedKey = $derived(selected?.row.key);
	const place = $derived(selected ? selected.row.members.indexOf(selected.member) : -1);

	const expandedKey = $derived(
		active && !overview && (focusedOnly || selectedKey !== collapsedKey) ? selectedKey : undefined
	);
	const currentIndex = $derived(rows.findIndex((row) => row.key === selectedKey));
	const shownMember = (row: Decision) =>
		row.key === selectedKey && selected ? selected.member : row.members[0]!;
	const placeText = (row: Decision, index: number) =>
		`Place ${index + 1} of ${row.members.length}${lineFor ? `, line ${lineFor(row.members[index]!.from)}` : ''}`;

	// A choice belongs to the row it was made on. A row that leaves the list takes
	// its choice with it, so the same question arriving later starts fresh. Read
	// from the current rows rather than the drawn ones, so a row that leaves
	// while the list is hidden still takes its choice with it.
	$effect(() => {
		const drawn = (key: string) => latest.some((row) => row.key === key);
		if (collapsedKey && !drawn(collapsedKey)) collapsedKey = undefined;
		if (chosenDecision && !drawn(chosenDecision)) chosenDecision = undefined;
		if (
			chosenKey &&
			!latest.some((row) => row.members.some((member) => rowKey(member) === chosenKey))
		)
			chosenKey = undefined;
	});

	// The open grouped row's reserved heights in pixels: its explanation's, the
	// tallest of its places' at the current width, and what sits under the
	// explanation, which loses `Fix all` when one place is left. Neither stepping
	// nor answering moves its actions or the rows below. Each only grows while
	// the row stays open at one width, and a new width measures afresh. A row
	// that opens with one place reserves nothing.
	type Extent = { width: number; height: number };
	let reserve = $state<{ key: string; explanation?: Extent; actions?: Extent }>();
	const openReserve = $derived(reserve?.key === expandedKey ? reserve : undefined);
	const reserving = $derived(
		expandedKey !== undefined &&
			selected?.row.key === expandedKey &&
			(selected.row.members.length > 1 || openReserve !== undefined)
	);

	$effect(() => {
		if (reserve && reserve.key !== expandedKey) reserve = undefined;
	});

	const measure =
		(
			key: string,
			part: 'explanation' | 'actions',
			height: (element: HTMLElement) => number
		): Attachment<HTMLElement> =>
		(element) => {
			// Unrounded, because `offsetHeight` would add up to half a pixel to the
			// row; and once on arrival, so the reserve is in place before a press
			// can land in the first frame.
			const take = () => {
				const extent = { width: element.getBoundingClientRect().width, height: height(element) };
				const kept = reserve?.key === key ? reserve : { key };
				const current = kept[part];
				if (current?.width === extent.width && current.height >= extent.height) return;
				reserve = { ...kept, [part]: extent };
			};
			take();
			const observer = new ResizeObserver(take);
			observer.observe(element);
			return () => observer.disconnect();
		};

	const boxHeight = (element: Element | null | undefined) =>
		element?.getBoundingClientRect().height ?? 0;
	// Measured without the explanation, so this reserve never feeds on the other.
	const belowExplanation = (body: HTMLElement) =>
		boxHeight(body.querySelector('.diagnostic-details')) -
		boxHeight(body.querySelector('.diagnostic-explanation'));

	/** Each distinct explanation among a row's places, the candidates for its tallest. */
	const explanations = (row: Decision) => [
		...new Set(row.members.map((member) => member.explanation))
	];

	$effect(() => {
		const key = activeKey;
		const currentList = list;
		if (!active || !key || !currentList) return;
		void tick().then(() => {
			const card = Array.from(currentList.children).find(
				(candidate) => candidate.getAttribute('data-diagnostic-key') === key
			);
			if (!(card instanceof HTMLElement)) return;
			// A row taller than the panel aligns its top, so its heading stays in
			// view: `nearest` would push the heading out, and focusing it after a
			// fix would scroll the panel back.
			let port = card.parentElement;
			while (port && port.scrollHeight <= port.clientHeight) port = port.parentElement;
			if (!port) return;
			// A sticky header inside the port, the tab strip on a narrow desktop,
			// covers the top of what it scrolls.
			const header = Array.from(port.children).find(
				(child) => !child.contains(card) && getComputedStyle(child).position === 'sticky'
			);
			const covered = header?.getBoundingClientRect().height ?? 0;
			const view = port.getBoundingClientRect();
			const box = card.getBoundingClientRect();
			const top = view.top + covered;
			// Like `block: 'nearest'`, but measured from below the header, and a
			// row too tall to fit shows its heading rather than its end.
			if (box.top < top || box.height > view.bottom - top) port.scrollTop += box.top - top;
			else if (box.bottom > view.bottom) port.scrollTop += box.bottom - view.bottom;
		});
	});

	function open(row: Decision, member: Diagnostic): void {
		collapsedKey = undefined;
		chosenDecision = row.key;
		chosenKey = rowKey(member);
		onNavigate(member);
	}

	function activate(row: Decision): void {
		if (!focusedOnly && expandedKey === row.key) {
			collapsedKey = row.key;
			return;
		}
		open(row, shownMember(row));
	}

	function step(direction: -1 | 1): void {
		const target = rows[currentIndex + direction];
		if (target) open(target, target.members[0]!);
	}

	// Landing on an end disables the button that was pressed, and a disabled
	// button drops focus to the page; the other direction is still a step. It is
	// decided from the target when pressed and carried out once the target is
	// drawn, because on a phone the open place follows a tick later.
	let handoff: { target: string; from: HTMLButtonElement; to: HTMLButtonElement } | undefined;
	$effect(() => {
		const drawn = selected && rowKey(selected.member);
		if (!handoff || drawn !== handoff.target) return;
		const { from, to } = handoff;
		handoff = undefined;
		if (document.activeElement === from) to.focus();
	});

	function stepPlace(direction: -1 | 1, trigger: HTMLButtonElement): void {
		if (!selected) return;
		const { row } = selected;
		const index = place + direction;
		const target = row.members[index];
		if (!target) return;
		const other = Array.from(trigger.parentElement?.querySelectorAll('button') ?? []).find(
			(button) => button !== trigger
		);
		handoff =
			other && (index === 0 || index === row.members.length - 1)
				? { target: rowKey(target), from: trigger, to: other }
				: undefined;
		open(row, target);
		// Announced here and nowhere else, since after a fix the reader has just
		// heard what the fix did; from the target, for the same reason as above.
		onAnnounce?.(placeText(row, index));
	}

	function navigateWithKeyboard(event: KeyboardEvent): void {
		if (
			!active ||
			event.defaultPrevented ||
			!event.altKey ||
			!event.shiftKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.isComposing
		)
			return;
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
		)
			return;
		// Pickers own their keyboard interaction even when the pointer opened them
		// without moving focus. Only visible surfaces count, not parked dialogs.
		if (
			Array.from(
				document.querySelectorAll('dialog, [role="dialog"], [role="menu"], [role="listbox"]')
			).some((surface) => surface.getClientRects().length > 0)
		)
			return;
		const direction = event.key === 'ArrowUp' ? -1 : 1;
		if (!rows[currentIndex + direction]) return;
		event.preventDefault();
		step(direction);
	}

	async function runRemovingAction(
		trigger: HTMLButtonElement,
		action: () => void,
		fallbackSelector: string
	): Promise<void> {
		const row = trigger.closest('li');
		const index = row && list ? Array.from(list.children).indexOf(row) : 0;
		const nextKey = row?.nextElementSibling?.getAttribute('data-diagnostic-key');
		// The target may only become stable after the diagnostic disappears, so
		// look it up after the action and its resulting render have settled.
		const panel = trigger.closest('.right-panel');
		action();
		await tick();
		const rows = Array.from(list?.children ?? []);
		const next =
			rows.find((candidate) => candidate.classList.contains('diagnostic-card--expanded')) ??
			rows.find((candidate) => candidate.getAttribute('data-diagnostic-key') === nextKey) ??
			rows[Math.min(index, rows.length - 1)];
		const nextControl = next?.querySelector<HTMLButtonElement>('.diagnostic-list__navigate');
		if (nextControl) {
			nextControl.focus();
			return;
		}
		const fallback = [
			panel?.querySelector<HTMLButtonElement>(fallbackSelector),
			focusedOnly
				? document.querySelector<HTMLButtonElement>('#mobile-review-control')
				: panel?.querySelector<HTMLButtonElement>('#linter-panel-tab')
		].find((control) => control && control.getClientRects().length > 0);

		fallback?.focus();
	}

	function fixAndMoveFocus(action: () => void): void {
		const trigger = document.activeElement;
		if (trigger instanceof HTMLButtonElement && list?.contains(trigger)) {
			void runRemovingAction(trigger, action, '#linter-panel-tab');
		} else action();
	}

	function ignoreAndMoveFocus(diagnostic: Diagnostic, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onIgnore(diagnostic), '.ignored-rules__toggle');
	}

	function setLanguageAndMoveFocus(language: string, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onSetLanguage(language), '#linter-panel-tab');
	}
</script>

<svelte:window onkeydown={navigateWithKeyboard} />

{#if rows.length === 0}
	<div
		class="empty-state diagnostic-list__empty"
		role={emptyState.status ? 'status' : undefined}
		class:diagnostic-list__empty--clean={emptyState.clean}
		class:diagnostic-list__empty--settled={emptyState.settled}
		class:diagnostic-list__empty--waiting={emptyState.waiting}
	>
		{#if emptyState.waiting}
			<BookOpenIcon class="diagnostic-list__empty-mark" aria-hidden="true" />
		{:else if emptyState.settled}
			<ChecksIcon class="diagnostic-list__empty-mark" aria-hidden="true" />
		{:else if emptyState.clean}
			<!-- The check the severity glyphs already use, at reading size and in the
			     success color. `aria-hidden` because the title beside it is the whole
			     of what it says. -->
			<svg
				class="diagnostic-list__empty-mark"
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="8" cy="8" r="6" />
				<path d="M5.4 8.2 7.2 10l3.4-3.6" />
			</svg>
		{/if}
		<p class="diagnostic-list__empty-title">{emptyState.title}</p>
		<p>{emptyState.detail}</p>
		{@render emptyActions?.()}
	</div>
{:else}
	{#if !overview && rows.length > 1}
		<div class="diagnostic-actions" role="group" aria-label="Navigate decisions">
			<button
				type="button"
				class="button button--quiet"
				disabled={currentIndex <= 0}
				aria-label="Previous decision"
				aria-keyshortcuts="Alt+Shift+ArrowUp"
				{@attach describeControl(() => ({ label: 'Previous decision', shortcut: 'Alt+Shift+↑' }))}
				onclick={() => step(-1)}>Previous</button
			>
			<span aria-live="polite">{currentIndex + 1} of {rows.length}</span>
			<button
				type="button"
				class="button button--quiet"
				disabled={currentIndex >= rows.length - 1}
				aria-label="Next decision"
				aria-keyshortcuts="Alt+Shift+ArrowDown"
				{@attach describeControl(() => ({ label: 'Next decision', shortcut: 'Alt+Shift+↓' }))}
				onclick={() => step(1)}>Next</button
			>
		</div>
	{/if}
	<ol bind:this={list} class="diagnostic-list" aria-label="Document diagnostics">
		{#each rows as row (row.key)}
			{@const diagnostic = shownMember(row)}
			{@const expanded = row.key === expandedKey}
			<li
				data-diagnostic-key={cardKey(diagnostic)}
				hidden={focusedOnly && row.key !== selectedKey}
				class:diagnostic-error={diagnostic.severity === 'error'}
				class:diagnostic-card--expanded={expanded}
				class:diagnostic-card--active={expanded && cardKey(diagnostic) === activeKey}
			>
				<!--
					The row is still the control: the button stretches over the whole
					head, so a press anywhere on the card opens the diagnostic. It no
					longer *contains* the head, because the meta line ends in a link to
					the cited source, and an `<a>` inside a `<button>` is neither valid
					nor reliably pressable. The link lifts above the stretched layer
					instead, and it is the one place on the card that does something else.
				-->
				<div class="diagnostic-list__head">
					<button
						type="button"
						class="diagnostic-list__navigate"
						aria-label={`Go to ${diagnostic.message}`}
						aria-expanded={expanded}
						onclick={() => activate(row)}
					>
						<span class="diagnostic-list__title">{diagnostic.message}</span>
					</button>
					<DiagnosticMeta {diagnostic} {sources} location={row.location} />
					<!-- Under the meta line that counts the places, above the explanation, so
					     its position never depends on how long the explanation is. The
					     buttons come first so the count's width cannot push them. A row that
					     falls to one place keeps the slot while it stays open. -->
					{#if expanded && row.members.length > 1}
						<div class="diagnostic-list__places" role="group" aria-label="Places">
							<button
								type="button"
								class="icon-button button--quiet"
								aria-label="Previous place"
								disabled={place <= 0}
								{@attach describeControl(() => ({ label: 'Previous place' }))}
								onclick={(event) => stepPlace(-1, event.currentTarget)}
							>
								<CaretLeftIcon aria-hidden="true" size={14} weight="bold" />
							</button>
							<button
								type="button"
								class="icon-button button--quiet"
								aria-label="Next place"
								disabled={place >= row.members.length - 1}
								{@attach describeControl(() => ({ label: 'Next place' }))}
								onclick={(event) => stepPlace(1, event.currentTarget)}
							>
								<CaretRightIcon aria-hidden="true" size={14} weight="bold" />
							</button>
							<span>{placeText(row, place)}</span>
						</div>
					{:else if expanded && reserving}
						<!-- As tall as a stepper button on this device: touch screens raise it. -->
						<div class="diagnostic-list__places" aria-hidden="true">
							<span class="icon-button diagnostic-list__slot"></span>
						</div>
					{/if}
				</div>
				{#if expanded}
					<div
						class="diagnostic-list__body"
						style:min-height={openReserve?.explanation && openReserve.actions
							? `${openReserve.explanation.height + openReserve.actions.height}px`
							: undefined}
						style:--diagnostic-list-explanation-reserve={openReserve?.explanation
							? `${openReserve.explanation.height}px`
							: undefined}
						{@attach reserving && measure(row.key, 'actions', belowExplanation)}
					>
						<!-- One place's card at a time, keyed by that place's row identity so
						     another place never inherits its controls. -->
						{#key rowKey(diagnostic)}
							<DiagnosticDetails
								{diagnostic}
								onChooseHeader={() => onChooseHeader(diagnostic)}
								onAssignPerformers={canAssignPerformers(diagnostic)
									? () => onAssignPerformers(diagnostic)
									: undefined}
								onLinkSections={onLinkSections ? () => onLinkSections(diagnostic) : undefined}
								onSetLanguage={setLanguageAndMoveFocus}
								onPreviewFix={(fix) => onPreviewFix(diagnostic, fix)}
								{onCancelPreview}
								onApplyFix={(fix) => fixAndMoveFocus(() => onApplyFix(diagnostic, fix))}
								fixBatchSize={fixBatchSize ? (fix) => fixBatchSize(diagnostic, fix) : undefined}
								onApplyFixBatch={onApplyFixBatch
									? (fix) => fixAndMoveFocus(() => onApplyFixBatch?.(diagnostic, fix))
									: undefined}
								onIgnore={(trigger) => ignoreAndMoveFocus(diagnostic, trigger)}
							/>
						{/key}
					</div>
					<!-- Every place's explanation at this width, stacked in one cell so the
					     cell is as tall as the tallest. The text is drawn from an attribute,
					     so none of it reaches the page's text or the accessibility tree. -->
					{#if reserving}
						<div
							class="diagnostic-list__reserve"
							aria-hidden="true"
							{@attach measure(row.key, 'explanation', boxHeight)}
						>
							{#each explanations(row) as text (text)}
								<p class="diagnostic-explanation" data-text={text}></p>
							{/each}
						</div>
					{/if}
				{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	/* Cards are edge to edge, but prose is not: inset the empty state to line up
	   with the filter row above it. */
	:global(.linter-panel) > .empty-state {
		padding: var(--space-2) var(--space-3) var(--space-4);
		margin: 0;
	}

	/* One short title naming the state, one muted line saying why and what to do.
	   Prose only: the bare panel canvas is the surface, not a box. */
	.diagnostic-list__empty {
		display: grid;
		gap: var(--space-1);
	}

	/* An empty or completed review should feel settled, not like a missing list.
	   Filtered findings stay beside their filters; the three resting states share
	   a composed, unboxed message. Set-aside findings remain distinct from clean. */
	.diagnostic-list__empty--clean,
	.diagnostic-list__empty--settled,
	.diagnostic-list__empty--waiting {
		flex: 1;
		/* Center against the panel, not a prose-width box parked at its left edge. */
		max-width: none;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		text-align: center;
	}

	.diagnostic-list__empty p {
		margin: 0;
		max-width: var(--measure-prose);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
		white-space: pre-line;
	}

	/* Global because two of the three marks are icon components, which render
	   their own `<svg>`. */
	.diagnostic-list__empty :global(.diagnostic-list__empty-mark) {
		width: var(--space-8);
		height: var(--space-8);
		margin-bottom: var(--space-4);
		color: var(--color-text-muted);
	}

	.diagnostic-list__empty--clean :global(.diagnostic-list__empty-mark) {
		color: var(--color-success);
	}

	.diagnostic-list__empty .diagnostic-list__empty-title {
		color: var(--color-text);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	/* Inset findings separate by space; only the open finding takes depth. */
	.diagnostic-list {
		display: grid;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		gap: var(--space-2);
		list-style: none;
	}

	/* Resting findings read as a list. The open finding is the one surface with
	   an independent decision, so only it takes a fill and elevation. */
	.diagnostic-list > li {
		position: relative;
		border: 0;
		border-radius: var(--radius-panel);
		background: transparent;
	}

	.diagnostic-list > li.diagnostic-card--expanded,
	.diagnostic-list > li.diagnostic-card--active {
		z-index: 1;
		background: var(--color-surface);
		box-shadow: var(--shadow-raised);
	}

	/* The depth answers a press, so it arrives at the control tier's rate rather
	   than snapping. Only the tone, the shadow and the seams ease. The card's own
	   expansion stays instant, because a height between two documents' worth of
	   content has no honest intermediate frame. */
	@media (prefers-reduced-motion: no-preference) {
		.diagnostic-list > li {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				box-shadow var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart);
		}
	}

	/* The head (not the list item) carries the card's padding: there is no dead
	   margin around the heading where a press lands on nothing. It is deliberately
	   unpositioned: the stretched press layer below resolves against the row, so a
	   containing block here would stop it at the head's own bottom edge. */
	.diagnostic-list__head {
		border-radius: inherit;
		display: grid;
		padding: var(--space-3) var(--space-4);
		gap: var(--space-1);
		justify-items: start;
	}

	/* Expanded, the head hands off to the details below it, so its bottom padding
	   becomes the seam between the two rather than a second full inset. */
	.diagnostic-card--expanded > .diagnostic-list__head {
		padding-bottom: var(--space-2);
	}

	/*
	 * The card's whole face is still the control, but the button no longer contains
	 * it: the meta line ends in a link to the cited source, and an `<a>` inside a
	 * `<button>` is neither valid nor reliably pressable. The button holds the
	 * message and stretches its hit area over the whole *row* instead (the head,
	 * the explanation under it, and the slack beside the actions), so a press
	 * anywhere on the card that is not aimed at something else opens the diagnostic.
	 */
	.diagnostic-list__navigate {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-text);
		text-align: start;
	}

	.diagnostic-list__navigate::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	/* Whatever does something else rides above the stretched layer and takes its own
	   press: the citation, its disclosure, and every decision in the expanded card
	   (lifted by `DiagnosticDetails.svelte`). The buttons and not the row they sit
	   in: lifting `.diagnostic-actions` would make the whole band dead, and the
	   slack beside the last control is card. */
	.diagnostic-list__head :global(.source-citation),
	.diagnostic-list__head :global(.diagnostic-meta__disclosure) {
		z-index: 1;
	}

	/* A z-index only counts on a positioned box, and only the citation brings its
	   own. */
	.diagnostic-list__head :global(.diagnostic-meta__disclosure) {
		position: relative;
	}

	/*
	 * Hover and focus belong to the whole head, because that is what the press
	 * target covers. Reading them off the button alone would light up only the
	 * message. Hovering the citation deliberately does not raise the row: the
	 * pointer is over the link, and the link is where the press would land.
	 */
	.diagnostic-list
		> li:not(.diagnostic-card--expanded)
		.diagnostic-list__head:has(.diagnostic-list__navigate:hover) {
		background: var(--color-control-hover);
	}

	/* Inset, because a full-bleed row's ring would otherwise be drawn over the
	   hairline into the neighbouring card. */
	.diagnostic-list__head:has(.diagnostic-list__navigate:focus-visible) {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.diagnostic-list__navigate:focus-visible {
		outline: none;
	}

	.diagnostic-list__title {
		font-weight: var(--font-weight-medium);
	}

	.diagnostic-list__places {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-variant-numeric: tabular-nums;
	}

	.diagnostic-list__places > span {
		margin-inline-start: var(--space-1);
	}

	.diagnostic-list__places > .diagnostic-list__slot {
		margin: 0;
		visibility: hidden;
	}

	.diagnostic-list__body :global(.diagnostic-explanation) {
		min-height: var(--diagnostic-list-explanation-reserve);
	}

	/* Laid out against the same width as the explanation it measures (the
	   details' inline inset) and kept out of the row's flow and hit area. */
	.diagnostic-list__reserve {
		position: absolute;
		top: 0;
		display: grid;
		inset-inline: var(--space-4);
		visibility: hidden;
		pointer-events: none;
	}

	.diagnostic-list__reserve > p {
		grid-area: 1 / 1;
	}

	.diagnostic-list__reserve > p::before {
		content: attr(data-text);
	}

	.diagnostic-list__places > button {
		position: relative;
		z-index: 1;
	}

	/* Keep this query aligned with PHONE_WORKSPACE_QUERY. An opened finding is
	   the task view's whole content, so it sheds the card's depth. */
	@media (pointer: coarse) and (max-width: 68rem) {
		:global(.linter-panel--focused) .diagnostic-list > li {
			background: transparent;
			box-shadow: none;
			padding-inline: 0;
		}

		.diagnostic-list > li[hidden] {
			display: none;
		}
	}
</style>
