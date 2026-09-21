import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, Plus } from '@phosphor-icons/react';

/**
 * Meniu „Adaugă” cu subopțiuni (ex. departament / echipă).
 */
export default function OrgAddMenu({
	items,
	label = 'Adaugă',
	variant = 'primary',
	className = '',
	disabled = false,
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef(null);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (rootRef.current && !rootRef.current.contains(e.target)) {
				setOpen(false);
			}
		};
		const onKey = (e) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const btnClass =
		variant === 'secondary'
			? 'lms-btn-secondary lms-btn-sm admin-org-add-menu__trigger'
			: 'lms-btn-primary admin-org-add-menu__trigger';

	return (
		<div className={`admin-org-add-menu ${className}`.trim()} ref={rootRef}>
			<button
				type="button"
				className={btnClass}
				disabled={disabled}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<Plus size={16} weight="bold" aria-hidden />
				<span>{label}</span>
				<CaretDown size={14} weight="bold" aria-hidden className={open ? 'admin-org-add-menu__caret--open' : ''} />
			</button>
			{open && (
				<div className="admin-org-add-menu__panel" role="menu">
					{items.map((item) => (
						<button
							key={item.key}
							type="button"
							role="menuitem"
							className="admin-org-add-menu__item"
							onClick={() => {
								item.onClick();
								setOpen(false);
							}}
						>
							{item.icon ? <span className="admin-org-add-menu__item-icon">{item.icon}</span> : null}
							<span>{item.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
