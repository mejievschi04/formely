export function courseGenerationProgress(run) {
	const completed = Number(run?.completed_lessons || 0);
	const total = Number(run?.total_lessons || 0);
	if (run?.status === 'completed') return { title: 'Cursul este gata', description: `${total} lecții validate și salvate.`, percent: 100 };
	if (run?.status === 'failed') return { title: 'Generarea a fost întreruptă', description: `${completed} din ${total} lecții păstrate. Poți relua etapa.`, percent: total ? Math.min(94, Math.round(completed / (total + 1) * 100)) : 0 };
	if (run?.phase === 'outline') return { title: 'Pregătim structura cursului', description: 'Organizăm modulele și obiectivele lecțiilor.', percent: 0 };
	if (completed >= total) return { title: 'Salvăm cursul', description: 'Toate lecțiile sunt validate. Pregătim draftul.', percent: 95 };
	return { title: `Generăm lecția ${completed + 1} din ${total}`, description: `${completed} lecții validate. Verificăm explicația, exemplul și aplicarea.`, percent: total ? Math.min(94, Math.round(completed / (total + 1) * 100)) : 0 };
}
