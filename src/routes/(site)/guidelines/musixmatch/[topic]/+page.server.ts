import { error } from '@sveltejs/kit';
import { musixmatchReaderData } from '#lib/profiles/reader.server.js';
import { profileGuidelineTopic } from '#lib/profiles/reference.server.js';
import { referenceTopics } from '#lib/reference/topics.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

export const entries: EntryGenerator = () => referenceTopics.map((topic) => ({ topic: topic.id }));
export const load: PageServerLoad = ({ params }) => {
	const topic = referenceTopics.find((candidate) => candidate.id === params.topic);
	if (!topic) error(404, 'This Musixmatch topic does not exist.');
	const entries = musixmatchReaderData().entries.filter(
		(entry) => profileGuidelineTopic(entry) === topic.id
	);
	return {
		topic,
		entries,
		entryCount: entries.length,
		checkCount: new Set(entries.flatMap((entry) => entry.checks.map((check) => check.slug))).size
	};
};
