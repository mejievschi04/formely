import React, { useEffect } from 'react';
import { Trash, X } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import { LESSON_CALLOUT_FILLS, LESSON_CALLOUT_VARIANTS } from './lessonCallout.js';

export default function LessonCalloutPanel({
	variant,
	fill,
	x,
	y,
	placeBelow,
	onVariant,
	onFill,
	onRemove,
	onClose,
}) {
	useEffect(() => {
		const onKey = (event) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return createPortal(
		<div
			className={`lesson-callout-panel${placeBelow ? ' is-below' : ''}`}
			style={{ left: x, top: y }}
			role="dialog"
			aria-label="Chenar"
			onMouseDown={(event) => event.preventDefault()}
		>
			<div className="lesson-callout-panel-head">
				<span>Chenar</span>
				<button type="button" className="lesson-callout-close va-close-btn" aria-label="Închide" onClick={onClose}>
					<X size={18} weight="bold" aria-hidden="true" />
				</button>
			</div>
			<div className="lesson-callout-variants" role="group" aria-label="Culoare">
				{LESSON_CALLOUT_VARIANTS.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`lesson-callout-variant${variant === item.id ? ' is-selected' : ''}`}
						style={{ '--cv': item.color }}
						aria-pressed={variant === item.id}
						aria-label={item.label}
						title={item.label}
						onClick={() => onVariant(item.id)}
					/>
				))}
			</div>
			<div className="lesson-callout-fills" role="group" aria-label="Stil">
				{LESSON_CALLOUT_FILLS.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`lesson-callout-fill${fill === item.id ? ' is-selected' : ''}`}
						aria-pressed={fill === item.id}
						onClick={() => onFill(item.id)}
					>
						{item.label}
					</button>
				))}
			</div>
			{variant && onRemove ? (
				<button type="button" className="lesson-callout-remove" onClick={onRemove}>
					<Trash size={16} weight="bold" aria-hidden="true" />
					Elimină chenarul
				</button>
			) : null}
		</div>,
		document.body,
	);
}
