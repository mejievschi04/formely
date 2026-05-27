import React from 'react';
import { ArrowsLeftRight, GraduationCap, ShieldCheck } from '@phosphor-icons/react';

/**
 * Comută între panoul admin și vizualizarea student.
 * @param {boolean} isStudentView - true când utilizatorul e în shell-ul student
 */
const AdminViewSwitcher = ({ isStudentView, onSwitch, variant = 'topnav', className = '' }) => {
	const targetLabel = isStudentView ? 'Panou admin' : 'Vizualizare student';
	const TargetIcon = isStudentView ? ShieldCheck : GraduationCap;
	const title = isStudentView ? 'Comută la panoul de administrare' : 'Comută la vizualizarea student';

	return (
		<button
			type="button"
			className={[
				'admin-view-mode-btn',
				isStudentView ? 'is-student-view' : 'is-admin-view',
				variant === 'sidebar' ? 'admin-view-mode-btn--sidebar' : '',
				className,
			]
				.filter(Boolean)
				.join(' ')}
			onClick={onSwitch}
			title={title}
			aria-label={title}
		>
			<span className="admin-view-mode-btn__icon" aria-hidden>
				<TargetIcon size={variant === 'sidebar' ? 18 : 20} weight="duotone" />
			</span>
			<span className="admin-view-mode-btn__text">{targetLabel}</span>
			<span className="admin-view-mode-btn__swap" aria-hidden>
				<ArrowsLeftRight size={14} weight="bold" />
			</span>
		</button>
	);
};

export default AdminViewSwitcher;
