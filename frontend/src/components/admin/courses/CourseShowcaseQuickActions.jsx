import React from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import { isCoursePublished } from '../../../hooks/useCoursePublishFromCard';
import './CourseShowcaseQuickActions.css';

export function CourseShowcasePublishToggle({
	course,
	onStatusClick,
	statusBusy = false,
}) {
	const isPublished = isCoursePublished(course);

	return (
		<div className="admin-courses-showcase-publish" onClick={(e) => e.stopPropagation()}>
			<span
				className={`admin-courses-showcase-publish__label ${isPublished ? 'is-published' : 'is-draft'}`}
			>
				{isPublished ? 'Publicat' : 'Ciornă'}
			</span>
			<button
				type="button"
				role="switch"
				aria-checked={isPublished}
				className={`admin-courses-showcase-publish__switch ${isPublished ? 'is-on' : ''}`}
				onClick={(e) => {
					e.stopPropagation();
					onStatusClick?.(course);
				}}
				disabled={statusBusy}
				title={isPublished ? 'Publicat — oprește pentru ciornă' : 'Ciornă — activează pentru publicare'}
				aria-label={isPublished ? 'Curs publicat' : 'Curs în ciornă'}
			>
				<span className="admin-courses-showcase-publish__thumb" aria-hidden="true" />
			</button>
		</div>
	);
}

export function CourseShowcaseEditButton({ onEdit }) {
	if (!onEdit) return null;

	return (
		<button
			type="button"
			className="admin-courses-showcase-edit-btn va-card-icon-btn"
			onClick={(e) => {
				e.stopPropagation();
				onEdit();
			}}
			aria-label="Editează cursul: titlu, copertă, module și setări"
			title="Editează detaliile cursului"
		>
			<span className="admin-courses-showcase-edit-btn__icon" aria-hidden="true">
				<PencilSimple size={15} weight="bold" />
			</span>
			<span className="admin-courses-showcase-edit-btn__text">Editează</span>
		</button>
	);
}

export default function CourseShowcaseQuickActions({
	course,
	canMutate,
	canEdit,
	onStatusClick,
	onEdit,
	statusBusy = false,
}) {
	if (!canMutate && !canEdit) return null;

	return (
		<div className="admin-courses-showcase-actions" onClick={(e) => e.stopPropagation()}>
			{canMutate ? (
				<CourseShowcasePublishToggle
					course={course}
					onStatusClick={onStatusClick}
					statusBusy={statusBusy}
				/>
			) : null}
			{canEdit ? <CourseShowcaseEditButton onEdit={onEdit} /> : null}
		</div>
	);
}
