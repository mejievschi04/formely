import React, { useEffect, useRef } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import Modal from '../common/Modal';
import './CourseCongratulationsModal.css';

/**
 * Mesaj de felicitare la finalizarea cursului; la închidere → callback (ex. navigare la listă cursuri).
 */
function CourseCongratulationsModal({ open, onClose, courseTitle, closeButtonLabel = 'Închide' }) {
	const closeBtnRef = useRef(null);

	useEffect(() => {
		if (!open) return;
		const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [open]);

	if (!open) return null;

	return (
		<Modal
			isOpen={open}
			onClose={onClose}
			ariaLabelledby="course-congrats-title"
			ariaDescribedby="course-congrats-desc"
			className="course-congrats-overlay"
		>
			<div className="course-congrats">
				<div className="course-congrats-icon" aria-hidden="true">
					<CheckCircle size={56} weight="duotone" aria-hidden />
				</div>
				<h2 id="course-congrats-title" className="course-congrats-title">
					Felicitări!
				</h2>
				<p id="course-congrats-desc" className="course-congrats-message">
					{courseTitle
						? `Ai finalizat cursul „${courseTitle}”.`
						: 'Ai finalizat cursul.'}
				</p>
				<button
					ref={closeBtnRef}
					type="button"
					className="lms-btn-primary course-congrats-btn"
					onClick={onClose}
				>
					{closeButtonLabel}
				</button>
			</div>
		</Modal>
	);
}

export default CourseCongratulationsModal;
