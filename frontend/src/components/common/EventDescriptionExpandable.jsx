import React, { useState } from 'react';
import './EventDescriptionExpandable.css';

/** Peste acest număr de caractere apare butonul de extindere. */
const LONG_TEXT_THRESHOLD = 100;

/**
 * Descriere eveniment cu text complet la apăsarea butonului (fără tăiere permanentă).
 */
export default function EventDescriptionExpandable({
	text,
	className = '',
	textClassName = '',
	clampLines = 3,
	expandLabel = 'Afișează descrierea completă',
	collapseLabel = 'Ascunde descrierea',
}) {
	const content = typeof text === 'string' ? text.trim() : '';
	const [expanded, setExpanded] = useState(false);

	if (!content) return null;

	const isLong = content.length > LONG_TEXT_THRESHOLD;
	const showClamp = isLong && !expanded;

	return (
		<div className={['event-desc-expand', className].filter(Boolean).join(' ')}>
			<p
				className={[
					'event-desc-expand__text',
					textClassName,
					showClamp ? 'event-desc-expand__text--clamp' : '',
				]
					.filter(Boolean)
					.join(' ')}
				style={showClamp ? { WebkitLineClamp: clampLines } : undefined}
			>
				{content}
			</p>
			{isLong ? (
				<button
					type="button"
					className="event-desc-expand__btn"
					onClick={() => setExpanded((v) => !v)}
					aria-expanded={expanded}
				>
					{expanded ? collapseLabel : expandLabel}
				</button>
			) : null}
		</div>
	);
}
