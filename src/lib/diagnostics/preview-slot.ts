interface PreviewOwner {
	show: () => void;
	onEmpty: () => void;
}

/**
 * The document has one preview slot even when several surfaces are mounted.
 * The newest owner draws; releasing any owner re-shows the newest survivor, or
 * lets that releaser clear the slot when nobody remains. This makes teardown
 * order irrelevant when a panel card and its popover show the same finding.
 */
const shownPreviews: PreviewOwner[] = [];

export function acquirePreview(show: () => void, onEmpty: () => void): () => void {
	const owner = { show, onEmpty };
	shownPreviews.push(owner);
	show();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const index = shownPreviews.indexOf(owner);
		if (index !== -1) shownPreviews.splice(index, 1);
		const remaining = shownPreviews.at(-1);
		if (remaining) {
			remaining.show();
		} else {
			onEmpty();
		}
	};
}
