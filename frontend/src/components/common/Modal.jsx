import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Accessible modal: focus trap, Escape to close, ARIA dialog.
 * Use aria-labelledby and optionally aria-describedby on the content div for a11y.
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {string} [ariaLabelledby] - id of the modal title element
 * @param {string} [ariaDescribedby] - id of the modal description
 * @param {boolean} [closeOnBackdropClick=true]
 * @param {React.ReactNode} children
 */
function Modal({
	isOpen,
	onClose,
	ariaLabelledby,
	ariaDescribedby,
	closeOnBackdropClick = true,
	children,
	className = '',
	...rest
}) {
	const overlayRef = useRef(null);
	const previousActiveElement = useRef(null);

	const handleKeyDown = useCallback(
		(e) => {
			if (e.key !== 'Tab') return;
			const el = overlayRef.current;
			if (!el) return;
			const focusable = el.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			const list = Array.from(focusable).filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null);
			if (list.length === 0) return;
			const first = list[0];
			const last = list[list.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		},
		[]
	);

	useEffect(() => {
		if (!isOpen) return;
		previousActiveElement.current = document.activeElement;
		const firstFocusable = overlayRef.current?.querySelector(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (firstFocusable && typeof firstFocusable.focus === 'function') {
			firstFocusable.focus();
		}
		return () => {
			if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
				previousActiveElement.current.focus();
			}
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const handler = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby={ariaLabelledby || undefined}
			aria-describedby={ariaDescribedby || undefined}
			className={`va-modal-overlay ${className}`}
			onKeyDown={handleKeyDown}
			onClick={closeOnBackdropClick ? (e) => e.target === overlayRef.current && onClose() : undefined}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 9999,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(0,0,0,0.5)',
				padding: 'var(--space-4)',
			}}
			{...rest}
		>
			<div
				className="va-modal-content"
				role="document"
				onClick={(e) => e.stopPropagation()}
				style={{
					background: 'var(--bg-elevated)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-xl)',
					maxWidth: '100%',
					maxHeight: '100%',
					overflow: 'auto',
				}}
			>
				{children}
			</div>
		</div>
	);
}

export default Modal;
