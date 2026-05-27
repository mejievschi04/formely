import React, { useRef, useEffect } from 'react';
import Modal from './Modal';
import './ConfirmModal.css';

/**
 * Modal de confirmare reutilizabil (înlocuiește window.confirm).
 * @param {boolean} open - vizibil
 * @param {function} onClose - la Anulare / Escape / backdrop
 * @param {function} onConfirm - la confirmare (ex. Șterge)
 * @param {string} title - titlu (ex. "Confirmă ștergerea")
 * @param {string} message - mesaj (ex. "Ești sigur că vrei să ștergi?")
 * @param {string} [confirmLabel="Confirmă"] - text buton principal
 * @param {string} [cancelLabel="Anulare"] - text buton anulare
 * @param {'danger'|'primary'} [variant='danger'] - danger = buton roșu pentru ștergere
 * @param {boolean} [loading=false] - dezactivează butoanele și arată că se procesează
 */
function ConfirmModal({
	open,
	onClose,
	onConfirm,
	title,
	message,
	confirmLabel = 'Confirmă',
	cancelLabel = 'Anulare',
	variant = 'danger',
	loading = false,
}) {
	const cancelBtnRef = useRef(null);
	const confirmBtnRef = useRef(null);

	useEffect(() => {
		if (!open) return;
		// La acțiuni distructive (danger): focus pe Anulare ca Enter să nu confirme din greșeală.
		// La acțiuni normale (primary): focus pe Confirmă.
		const frameId = requestAnimationFrame(() => {
			if (variant === 'danger') {
				cancelBtnRef.current?.focus();
			} else {
				confirmBtnRef.current?.focus();
			}
		});
		return () => cancelAnimationFrame(frameId);
	}, [open, variant]);

	const handleConfirm = () => {
		if (loading) return;
		onConfirm?.();
	};

	if (!open) return null;

	return (
		<Modal
			isOpen={open}
			onClose={onClose}
			closeOnBackdropClick={!loading}
			ariaLabelledby="confirm-modal-title"
			ariaDescribedby="confirm-modal-desc"
			className="confirm-modal-overlay"
		>
			<div className="confirm-modal">
				<h2 id="confirm-modal-title" className="confirm-modal-title">
					{title}
				</h2>
				<p id="confirm-modal-desc" className="confirm-modal-message">
					{message}
				</p>
				<div className="confirm-modal-actions">
					<button
						ref={cancelBtnRef}
						type="button"
						data-confirm-cancel
						className="lms-btn-secondary"
						onClick={onClose}
						disabled={loading}
						aria-label={cancelLabel}
					>
						{cancelLabel}
					</button>
					<button
						ref={confirmBtnRef}
						type="button"
						className={variant === 'danger' ? 'lms-btn-secondary va-btn-danger' : 'lms-btn-primary'}
						onClick={handleConfirm}
						disabled={loading}
						aria-label={confirmLabel}
					>
						{loading ? 'Se procesează...' : confirmLabel}
					</button>
				</div>
			</div>
		</Modal>
	);
}

export default ConfirmModal;
