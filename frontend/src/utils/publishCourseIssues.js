export function parsePublishIssue(err) {
	const path = String(err?.path || '');
	const message = err?.message || String(err ?? '');
	const lessonMatch = path.match(/^lessons\.(\d+)/);
	if (lessonMatch) {
		return {
			group: 'lessons',
			groupLabel: 'Lecții',
			kind: 'lesson',
			id: Number(lessonMatch[1]),
			actionLabel: 'Deschide lecția',
			message,
			path,
		};
	}
	const moduleMatch = path.match(/^modules\.(\d+)/);
	if (moduleMatch) {
		return {
			group: 'modules',
			groupLabel: 'Module',
			kind: 'module',
			id: Number(moduleMatch[1]),
			actionLabel: 'Deschide modulul',
			message,
			path,
		};
	}
	const testMatch = path.match(/^course_tests\.(\d+)/);
	if (testMatch) {
		return {
			group: 'tests',
			groupLabel: 'Teste',
			kind: 'test',
			id: Number(testMatch[1]),
			actionLabel: 'Deschide testul',
			message,
			path,
		};
	}
	return {
		group: 'course',
		groupLabel: 'Curs',
		kind: 'course',
		id: null,
		actionLabel: null,
		message,
		path,
	};
}

export function groupPublishIssues(errors) {
	const list = Array.isArray(errors) ? errors.map(parsePublishIssue) : [];
	const order = ['lessons', 'tests', 'modules', 'course'];
	const buckets = new Map(order.map((key) => [key, []]));
	for (const issue of list) {
		if (!buckets.has(issue.group)) buckets.set(issue.group, []);
		buckets.get(issue.group).push(issue);
	}
	return order
		.map((key) => {
			const items = buckets.get(key) || [];
			if (!items.length) return null;
			return { key, label: items[0].groupLabel, items };
		})
		.filter(Boolean);
}

const draftKey = (courseId) => `volta-publish-draft-${courseId}`;

export function readPublishDraft(courseId) {
	if (!courseId || typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(draftKey(courseId));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed;
	} catch {
		return null;
	}
}

export function writePublishDraft(courseId, draft) {
	if (!courseId || typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(draftKey(courseId), JSON.stringify(draft));
	} catch {
		/* ignore quota */
	}
}

export function clearPublishDraft(courseId) {
	if (!courseId || typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(draftKey(courseId));
	} catch {
		/* ignore */
	}
}
