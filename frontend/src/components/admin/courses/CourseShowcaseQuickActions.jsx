import React from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import { isCoursePublished } from '../../../hooks/useCoursePublishFromCard';
import { PublishSwitch } from '../../ui/PublishSwitch';
import './CourseShowcaseQuickActions.css';

export function CourseShowcasePublishToggle({
	course,
	onStatusClick,
	statusBusy = false,
}) {
	const isPublished = isCoursePublished(course);

	return (
		<PublishSwitch
			className="admin-courses-showcase-publish"
			published={isPublished}
			disabled={statusBusy}
			onToggle={() => onStatusClick?.(course)}
			aria-label={isPublished ? 'Curs publicat' : 'Curs în ciornă'}
		/>
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
