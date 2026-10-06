import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';

import { useAuth } from '../../contexts/AuthContextShared.js';
import './CourseCreationPage.css';

const TITLE_ID = 'course-create-title';
const TITLE_HINT_ID = 'course-create-title-hint';
const TITLE_ERROR_ID = 'course-create-title-error';
const DESC_ID = 'course-create-description';
const FORM_ERROR_ID = 'course-create-form-error';
const PRIMARY_HINT_ID = 'course-create-primary-hint';

const CourseCreationPage = () => {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea } = useAuth();
	const titleInputRef = useRef(null);

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [titleError, setTitleError] = useState('');

	useEffect(() => {
		if (!canMutateInAdminArea) {
			navigate('/admin/content?tab=courses&view=maps', { replace: true });
		}
	}, [canMutateInAdminArea, navigate]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setTitleError('');
		const t = title?.trim();
		if (!t) {
			setTitleError('Titlul este obligatoriu.');
			titleInputRef.current?.focus();
			return;
		}

		setLoading(true);
		try {
			const cleanDescription = description.trim();
			const payload = {
				title: t,
				description: cleanDescription || '',
				status: 'draft',
				level: 'beginner',
				visibility: 'public',
				sequential_unlock: true,
				min_test_score: 70,
				has_certificate: false,
				access_type: 'free',
				enrollment_type: 'open',
			};
			const result = await adminService.createCourse(payload);
			const courseId = result?.course?.id;
			if (courseId) {
				showToast('Curs creat. Adaugă module și lecții în Builder.', 'success');
				navigate(`/admin/courses/${courseId}/builder`);
			} else {
				setError('Crearea cursului nu a returnat un ID.');
			}
		} catch (err) {
			console.error('Error creating course:', err);
			const msg = err?.response?.data?.message || err?.message || 'Eroare la crearea cursului.';
			setError(msg);
			showToast(msg, 'error');
		} finally {
			setLoading(false);
		}
	};

	const primaryHint = loading ? 'Se creează cursul. Așteaptă finalizarea.' : null;

	if (!canMutateInAdminArea) {
		return null;
	}

	return (
		<div className="admin-container course-creation-simple-page">
			<div className="course-creation-simple-card">
				<header className="course-creation-simple-header">
					<button
						type="button"
						className="course-creation-simple-back va-btn-back admin-back-btn"
						onClick={() => navigate('/admin/courses')}
						aria-label="Înapoi la cursuri"
					>
						← Cursuri
					</button>
					<h1 className="course-creation-simple-title">Creează curs nou</h1>
					<p className="course-creation-simple-subtitle">
						Completezi titlul și descrierea, apoi continui în Builder.
					</p>
				</header>

				<form onSubmit={handleSubmit} className="course-creation-simple-form" noValidate>
					<div className="course-creation-simple-field">
						<label className="course-creation-simple-label" htmlFor={TITLE_ID}>
							Titlu curs <span className="course-creation-simple-required">*</span>
						</label>
						<input
							id={TITLE_ID}
							ref={titleInputRef}
							type="text"
							placeholder="Titlul cursului"
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
								if (titleError) setTitleError('');
							}}
							className="course-creation-simple-input"
							autoFocus
							disabled={loading}
							required
							aria-required="true"
							aria-invalid={titleError ? 'true' : 'false'}
							aria-describedby={`${TITLE_HINT_ID}${titleError ? ` ${TITLE_ERROR_ID}` : ''}`}
						/>
						<p id={TITLE_HINT_ID} className="course-creation-simple-hint">După creare poți adăuga lecții și teste.</p>
						{titleError ? (
							<p id={TITLE_ERROR_ID} className="course-creation-simple-error" role="alert">
								{titleError}
							</p>
						) : null}
					</div>

					<div className="course-creation-simple-field">
						<label className="course-creation-simple-label" htmlFor={DESC_ID}>Descriere</label>
						<textarea
							id={DESC_ID}
							placeholder="Scopul și conținutul cursului (opțional)"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="course-creation-simple-textarea"
							rows={4}
							disabled={loading}
						/>
					</div>

					{error ? (
						<div id={FORM_ERROR_ID} className="course-creation-simple-error" role="alert">{error}</div>
					) : null}

					{primaryHint ? (
						<p id={PRIMARY_HINT_ID} className="course-creation-availability" role="status">{primaryHint}</p>
					) : null}

					<div className="course-creation-simple-actions">
						<button
							type="button"
							className="course-creation-simple-btn-secondary"
							onClick={() => navigate('/admin/courses')}
							disabled={loading}
						>
							Anulare
						</button>
						<button
							type="submit"
							className="lms-btn-primary course-creation-simple-btn-primary"
							disabled={loading}
							aria-describedby={primaryHint ? PRIMARY_HINT_ID : (error ? FORM_ERROR_ID : undefined)}
						>
							{loading ? 'Se creează...' : 'Creează curs'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default CourseCreationPage;
