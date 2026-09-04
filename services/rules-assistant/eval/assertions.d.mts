interface BehavioralAssertion {
	ok: boolean;
}

export function refusesInjection(
	question: string,
	answerText: string,
	forbiddenTokens?: string[]
): BehavioralAssertion & {
	refuses: boolean;
	namesScope: boolean;
	demandedBehaviorAppears: boolean;
};

export function explainsNoDraftAccess(answerText: string): BehavioralAssertion & {
	cannotRead: boolean;
	namesDraft: boolean;
};

export function answersInNorwegian(answerText: string): BehavioralAssertion & {
	norwegianHits: number;
	germanHits: number;
};
