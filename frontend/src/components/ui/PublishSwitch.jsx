import { forwardRef } from 'react';

function joinClass(...parts) {
	return parts.filter(Boolean).join(' ');
}

export const PublishSwitch = forwardRef(function PublishSwitch({
	published = false,
	onToggle,
	disabled = false,
	publishedLabel = 'Publicat',
	draftLabel = 'Ciornă',
	showLabel = true,
	className,
	title,
	'aria-label': ariaLabel,
	...props
}, ref) {
	const label = published ? publishedLabel : draftLabel;
	return (
		<div
			className={joinClass('va-publish', published ? 'is-published' : 'is-draft', className)}
			onClick={(event) => event.stopPropagation()}
		>
			{showLabel ? <span className="va-publish-label">{label}</span> : null}
			<button
				ref={ref}
				type="button"
				role="switch"
				aria-checked={published}
				aria-label={ariaLabel || label}
				title={title || (published ? `${publishedLabel} — oprește pentru ciornă` : `${draftLabel} — activează pentru publicare`)}
				className="va-publish-switch"
				disabled={disabled}
				onClick={(event) => {
					event.stopPropagation();
					onToggle?.(event);
				}}
				{...props}
			>
				<span className="va-publish-switch-thumb" aria-hidden="true" />
			</button>
		</div>
	);
});
