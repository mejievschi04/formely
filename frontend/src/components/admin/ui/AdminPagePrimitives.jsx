import React from 'react';

const toneStyles = {
	success: { background: 'rgba(22, 163, 74, 0.12)', color: '#166534', borderColor: 'rgba(22, 163, 74, 0.25)' },
	warning: { background: 'rgba(217, 119, 6, 0.12)', color: '#92400e', borderColor: 'rgba(217, 119, 6, 0.25)' },
	danger: { background: 'rgba(220, 38, 38, 0.1)', color: '#991b1b', borderColor: 'rgba(220, 38, 38, 0.22)' },
	neutral: { background: 'rgba(100, 116, 139, 0.1)', color: '#334155', borderColor: 'rgba(100, 116, 139, 0.25)' },
};

export const getSemanticTone = (value, context = 'status') => {
	const normalized = String(value || '').toLowerCase();
	if (context === 'type') {
		if (normalized === 'final' || normalized === 'critical') return 'danger';
		if (normalized === 'practice' || normalized === 'info') return 'neutral';
		if (normalized === 'graded') return 'warning';
		return 'neutral';
	}

	if (normalized === 'published' || normalized === 'active' || normalized === 'completed' || normalized === 'passed') return 'success';
	if (normalized === 'draft' || normalized === 'pending' || normalized === 'review') return 'warning';
	if (normalized === 'archived' || normalized === 'inactive' || normalized === 'disabled') return 'neutral';
	if (normalized === 'failed' || normalized === 'error' || normalized === 'rejected') return 'danger';
	return 'neutral';
};

export const AdminPageHeader = ({ title, subtitle, actions, children }) => (
	<header style={{ marginBottom: '1rem' }}>
		<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
			<div>
				<h1 style={{ margin: 0, fontSize: '1.45rem' }}>{title}</h1>
				{subtitle ? <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)' }}>{subtitle}</p> : null}
			</div>
			{actions ? <div>{actions}</div> : null}
		</div>
		{children ? <div style={{ marginTop: '0.9rem' }}>{children}</div> : null}
	</header>
);

export const AdminToolbar = ({ children }) => (
	<div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
		{children}
	</div>
);

export const AdminSearchField = ({ value, onChange, placeholder, ariaLabel }) => (
	<input
		className="form-input"
		value={value}
		onChange={onChange}
		placeholder={placeholder}
		aria-label={ariaLabel}
		style={{ minWidth: 260 }}
	/>
);

export const AdminFilterSelect = ({ value, onChange, options, ariaLabel }) => (
	<select className="form-select" value={value} onChange={onChange} aria-label={ariaLabel}>
		{options.map((option) => (
			<option key={option.value} value={option.value}>{option.label}</option>
		))}
	</select>
);

export const AdminEmptyState = ({ message, action }) => (
	<div style={{ border: '1px solid var(--border-primary)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-primary)' }}>
		<p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
		{action ? <div style={{ marginTop: '0.75rem' }}>{action}</div> : null}
	</div>
);

export const AdminLoadingState = ({ message }) => (
	<div style={{ border: '1px solid var(--border-primary)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-primary)' }}>
		<p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message || 'Se încarcă...'}</p>
	</div>
);

export const AdminStatusBadge = ({ label, tone = 'neutral' }) => {
	const style = toneStyles[tone] || toneStyles.neutral;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				padding: '0.2rem 0.5rem',
				fontSize: '0.75rem',
				fontWeight: 600,
				borderRadius: '999px',
				border: `1px solid ${style.borderColor}`,
				background: style.background,
				color: style.color,
			}}
		>
			{label}
		</span>
	);
};

export const AdminHeroPanel = ({ title, subtitle, metrics = [] }) => (
	<section style={{ border: '1px solid var(--border-primary)', borderRadius: '14px', padding: '0.95rem 1rem', marginBottom: '1rem', background: 'var(--bg-primary)' }}>
		<h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>
		{subtitle ? <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{subtitle}</p> : null}
		{metrics.length > 0 ? (
			<div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
				{metrics.map((metric) => (
					<div key={metric.label} style={{ minWidth: 120 }}>
						<div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{metric.label}</div>
						<div style={{ fontWeight: 700 }}>{metric.value}</div>
					</div>
				))}
			</div>
		) : null}
	</section>
);

export const AdminModalPagination = ({
	currentPage,
	totalPages,
	totalItems,
	perPage,
	onPerPageChange,
	onPrev,
	onNext,
}) => (
	<div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-primary)' }}>
		<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
			<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
				Pagină {currentPage} / {totalPages} · {totalItems} întrebări
			</span>
			<select
				className="form-select"
				value={perPage}
				onChange={(e) => onPerPageChange(Number(e.target.value))}
				style={{ width: 90, padding: '4px 6px', fontSize: '0.8rem' }}
			>
				<option value={5}>5</option>
				<option value={10}>10</option>
				<option value={20}>20</option>
			</select>
		</div>
		<div style={{ display: 'flex', gap: '0.35rem' }}>
			<button type="button" className="btn btn-secondary btn-sm" onClick={onPrev} disabled={currentPage <= 1}>
				Anterior
			</button>
			<button type="button" className="btn btn-secondary btn-sm" onClick={onNext} disabled={currentPage >= totalPages}>
				Următor
			</button>
		</div>
	</div>
);

export const AdminModalQuestionRow = ({ title, meta, actions }) => (
	<div style={{ border: '1px solid var(--border-primary)', borderRadius: '10px', padding: '0.6rem', background: 'var(--bg-primary)' }}>
		<div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
			<strong style={{ fontSize: '0.9rem' }}>{title}</strong>
			{actions ? <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>{actions}</div> : null}
		</div>
		{meta ? (
			<div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
				{meta}
			</div>
		) : null}
	</div>
);

export const AdminCardSection = ({ children }) => (
	<section style={{ marginBottom: '1rem' }}>{children}</section>
);
