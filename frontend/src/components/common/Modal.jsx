import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
	'button:not([disabled])',
	'[href]',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container) {
	if (!container) return [];
	return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
		if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') return false;
		return node.getClientRects().length > 0;
	});
}

/**
 * Accessible modal: focus trap, ARIA dialog, restore focus on close.
 * Prefer [data-modal-initial-focus] for the first focus target.
 */
function Modal({
	isOpen,
	onClose,
	ariaLabelledby,
	ariaDescribedby,
	closeOnBackdropClick = false,
	closeOnEscape = false,
	children,
	className = '',
	contentClassName = '',
	unstyledContent = false,
	...rest
}) {
	const overlayRef = useRef(null);
	const previousActiveElement = useRef(null);

	const handleKeyDown = useCallback(
		(e) => {
			if (e.key !== 'Tab') return;
			const list = getFocusable(overlayRef.current);
			if (list.length === 0) return;
			const first = list[0];
			const last = list[list.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		},
		[]
	);

	useEffect(() => {
		if (!isOpen) return;
		previousActiveElement.current = document.activeElement;
		const frameId = requestAnimationFrame(() => {
			const root = overlayRef.current;
			const preferred = root?.querySelector('[data-modal-initial-focus]');
			const firstField = root?.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
			const target = preferred || firstField || getFocusable(root)[0];
			if (target && typeof target.focus === 'function') {
				target.focus();
			}
		});
		return () => {
			cancelAnimationFrame(frameId);
			if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
				previousActiveElement.current.focus();
			}
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || !closeOnEscape) return;
		const handler = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [isOpen, onClose, closeOnEscape]);

	if (!isOpen) return null;

	return createPortal(
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
				background: 'rgba(15, 23, 42, 0.55)',
				padding: '24px 16px',
			}}
			{...rest}
		>
			<div
				className={`va-modal-content ${contentClassName}`.trim()}
				role="document"
				onClick={(e) => e.stopPropagation()}
				style={unstyledContent ? {
					background: 'transparent',
					boxShadow: 'none',
					overflow: 'visible',
				} : {
					background: 'var(--bg-elevated)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-xl)',
					maxWidth: 'calc(100vw - 2rem)',
					maxHeight: 'min(90vh, 44rem)',
					overflow: 'auto',
				}}
			>
				{children}
			</div>
		</div>,
		document.body
	);
}

export default Modal;
