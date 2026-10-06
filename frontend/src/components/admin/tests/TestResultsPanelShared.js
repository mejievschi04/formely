export function rowMatchesResultFilters(row, { statusFilter = 'all', dateFrom = '', dateTo = '' } = {}) {
	if (statusFilter === 'passed' && !row?.passed) return false;
	if (statusFilter === 'failed' && (row?.passed || row?.needs_manual_review || row?.status === 'pending_review')) return false;
	if (statusFilter === 'pending' && !(row?.needs_manual_review || row?.status === 'pending' || row?.status === 'pending_review')) {
		return false;
	}
	if (dateFrom || dateTo) {
		if (!row?.completed_at) return false;
		const completed = new Date(row.completed_at);
		if (dateFrom) {
			const from = new Date(`${dateFrom}T00:00:00`);
			if (completed < from) return false;
		}
		if (dateTo) {
			const to = new Date(`${dateTo}T23:59:59`);
			if (completed > to) return false;
		}
	}
	return true;
}
