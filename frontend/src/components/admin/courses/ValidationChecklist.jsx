import React, { useMemo } from 'react';

const parseValidationPath = (path) => {
	if (typeof path !== 'string') return null;
	const moduleMatch = path.match(/^modules\.(\d+)\./);
	if (moduleMatch) {
		return { kind: 'module', id: Number(moduleMatch[1]) };
	}
	const lessonMatch = path.match(/^lessons\.(\d+)\./);
	if (lessonMatch) {
		return { kind: 'lesson', id: Number(lessonMatch[1]) };
	}
	if (path.startsWith('course.')) return { kind: 'course', id: null };
	return null;
};

const ValidationItem = ({ item, tone = 'error', contextLabel, onClick }) => {
	const color =
		tone === 'error' ? 'var(--color-error)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--text-secondary)';

	return (
		<button
			type="button"
			onClick={onClick}
			className="admin-card"
			style={{
				width: '100%',
				textAlign: 'left',
				padding: 0,
				borderLeft: `4px solid ${color}`,
				cursor: onClick ? 'pointer' : 'default',
			}}
			disabled={!onClick}
			title={onClick ? 'Click pentru a naviga la problemă' : undefined}
		>
			<div className="admin-card-body" style={{ display: 'grid', gap: 'var(--space-1)' }}>
				{contextLabel ? (
					<div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{contextLabel}</div>
				) : null}
				<div style={{ color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)' }}>{item.message}</div>
				{item.code ? (
					<div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{item.code}</div>
				) : null}
			</div>
		</button>
	);
};

const Section = ({ title, count, children }) => {
	return (
		<div style={{ marginTop: 'var(--space-4)' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
				<div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{title}</div>
				<span className="lms-tag">{count}</span>
			</div>
			<div style={{ display: 'grid', gap: 'var(--space-3)' }}>{children}</div>
		</div>
	);
};

const ValidationChecklist = ({ report, modules, lessons, onGoToLesson, onGoToModule }) => {
	const items = useMemo(() => {
		const errors = Array.isArray(report?.errors) ? report.errors : [];
		const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
		return { errors, warnings };
	}, [report]);

	const lessonMap = useMemo(() => {
		const map = new Map();
		(lessons || []).forEach((l) => map.set(l.id, l));
		return map;
	}, [lessons]);

	const moduleMap = useMemo(() => {
		const map = new Map();
		(modules || []).forEach((m) => map.set(m.id, m));
		return map;
	}, [modules]);

	const mkContextLabel = (parsed) => {
		if (!parsed) return null;
		if (parsed.kind === 'course') return 'Curs';
		if (parsed.kind === 'module') {
			const m = moduleMap.get(parsed.id);
			return m?.title ? `Modul: ${m.title}` : `Modul #${parsed.id}`;
		}
		if (parsed.kind === 'lesson') {
			const l = lessonMap.get(parsed.id);
			return l?.__moduleTitle ? `Lecție: ${l.title} • Modul: ${l.__moduleTitle}` : l?.title ? `Lecție: ${l.title}` : `Lecție #${parsed.id}`;
		}
		return null;
	};

	const mkOnClick = (parsed) => {
		if (!parsed) return null;
		if (parsed.kind === 'lesson') return () => onGoToLesson?.(parsed.id);
		if (parsed.kind === 'module') return () => onGoToModule?.(parsed.id);
		return null;
	};

	if (!report) return null;

	return (
		<div style={{ marginTop: 'var(--space-6)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span className="lms-tag">{report.ok ? 'OK' : 'Necesită atenție'}</span>
				<span className="lms-tag">Erori: {items.errors.length}</span>
				<span className="lms-tag">Avertismente: {items.warnings.length}</span>
			</div>

			{items.errors.length > 0 && (
				<Section title="Erori (trebuie rezolvate)" count={items.errors.length}>
					{items.errors.map((it, idx) => {
						const parsed = parseValidationPath(it.path);
						return (
							<ValidationItem
								key={`${it.code || 'err'}-${idx}`}
								item={it}
								tone="error"
								contextLabel={mkContextLabel(parsed)}
								onClick={mkOnClick(parsed)}
							/>
						);
					})}
				</Section>
			)}

			{items.warnings.length > 0 && (
				<Section title="Avertismente (recomandat)" count={items.warnings.length}>
					{items.warnings.map((it, idx) => {
						const parsed = parseValidationPath(it.path);
						return (
							<ValidationItem
								key={`${it.code || 'warn'}-${idx}`}
								item={it}
								tone="warning"
								contextLabel={mkContextLabel(parsed)}
								onClick={mkOnClick(parsed)}
							/>
						);
					})}
				</Section>
			)}
		</div>
	);
};

export default ValidationChecklist;

