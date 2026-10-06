import React, { useEffect, useId, useRef, useState } from 'react';
import { DotsThreeVertical } from '@phosphor-icons/react';

/**
 * Status is informational. Publish / withdraw / duplicate / delete live in the menu.
 */
export default function OutlineItemMenu({
	statusPublished,
	statusNoun = 'element',
	onPublish,
	onUnpublish,
	onDuplicate,
	onDelete,
	deleteLabel = 'Șterge',
	disabled = false,
}) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef(null);
	const menuId = useId();
	const publishedLabel = statusNoun === 'test' ? 'Publicat' : 'Publicată';
	const draftLabel = 'Ciornă';

	useEffect(() => {
		if (!open) return;
		const onDoc = (event) => {
			if (!wrapRef.current?.contains(event.target)) setOpen(false);
		};
		const onKey = (event) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const run = (fn) => {
		setOpen(false);
		fn?.();
	};

	const statusLabel = statusPublished ? publishedLabel : draftLabel;

	return (
		<div className="builder-outline-item-tools" ref={wrapRef}>
			<span
				className={`builder-outline-status ${statusPublished ? 'is-published' : 'is-draft'}`}
				title={statusLabel}
				aria-label={statusLabel}
			/>
			<button
				type="button"
				className="admin-course-builder-sidebar-lesson-icon-btn builder-outline-menu-trigger"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				aria-label={`Acțiuni ${statusNoun}`}
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
			>
				<DotsThreeVertical aria-hidden="true" size={17} weight="bold" />
			</button>
			{open ? (
				<div id={menuId} role="menu" className="builder-outline-menu">
					{statusPublished ? (
						<button type="button" role="menuitem" onClick={() => run(onUnpublish)}>
							Retrage
						</button>
					) : (
						<button type="button" role="menuitem" onClick={() => run(onPublish)}>
							Publică
						</button>
					)}
					{typeof onDuplicate === 'function' ? (
						<button type="button" role="menuitem" onClick={() => run(onDuplicate)}>
							Duplică
						</button>
					) : null}
					{typeof onDelete === 'function' ? (
						<button type="button" role="menuitem" className="is-danger" onClick={() => run(onDelete)}>
							{deleteLabel}
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
