import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const ModuleCreatorPage = () => {
	const { id } = useParams(); // module ID if editing
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea } = useAuth();
	const courseId = searchParams.get('course_id');

	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState({});
	const [formData, setFormData] = useState({
		course_id: courseId || '',
		title: '',
		description: '',
		order: 0,
		status: 'draft',
		is_locked: false,
		unlock_after_module_id: null,
		unlock_after_lesson_id: null,
	});

	useEffect(() => {
		if (!canMutateInAdminArea) {
			navigate(courseId ? `/admin/courses/${courseId}` : '/admin/content?tab=courses&view=maps', { replace: true });
		}
	}, [canMutateInAdminArea, courseId, navigate]);

	useEffect(() => {
		if (!canMutateInAdminArea) return;
		// Require course_id to create/edit modules
		if (!courseId && !id) {
			showToast('Selectează un curs pentru a crea un modul', 'error');
			navigate('/admin/courses');
			return;
		}
		
		// Only fetch module if id exists and is not "new"
		if (id && id !== 'new') {
			fetchModule();
		} else if (courseId) {
			// Set course_id if provided via URL
			setFormData(prev => ({ ...prev, course_id: courseId }));
		}
	}, [id, courseId, canMutateInAdminArea]);

	const fetchModule = async () => {
		try {
			setLoading(true);
			const module = await adminService.getModule(id);
			setFormData({
				course_id: module.course_id,
				title: module.title || '',
				description: module.description || '',
				order: module.order || 0,
				status: module.status || 'draft',
				is_locked: module.is_locked || false,
				unlock_after_module_id: module.unlock_after_module_id || null,
				unlock_after_lesson_id: module.unlock_after_lesson_id || null,
			});
		} catch (err) {
			console.error('Error fetching module:', err);
			showToast('Eroare la încărcarea modulului', 'error');
		} finally {
			setLoading(false);
		}
	};

	// Validate form
	const validate = () => {
		const newErrors = {};
		if (!formData.course_id) {
			newErrors.course_id = 'Trebuie să selectezi un curs';
		}
		if (!formData.title || formData.title.trim().length < 3) {
			newErrors.title = 'Titlul trebuie să aibă minim 3 caractere';
		}
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		
		// Validate before submit
		if (!validate()) {
			showToast('Completează toate câmpurile obligatorii', 'error');
			return;
		}
		
		try {
			setLoading(true);
			if (id && id !== 'new') {
				await adminService.updateModule(id, formData);
				showToast('Modul actualizat cu succes', 'success');
			} else {
				await adminService.createModule(formData);
				showToast('Modul creat cu succes', 'success');
			}
			
			// Navigate back to course detail page
			if (formData.course_id) {
				navigate(`/admin/courses/${formData.course_id}`);
			} else {
				navigate('/admin/courses');
			}
		} catch (err) {
			console.error('Error saving module:', err);
			showToast(err?.response?.data?.message || err?.message || 'Eroare la salvarea modulului', 'error');
		} finally {
			setLoading(false);
		}
	};

	if (loading && id && id !== 'new') {
		return (
			<div className="admin-module-creator-page">
				<div className="admin-loading-state">
					<p>Se încarcă...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-module-creator-page">
			<div className="admin-module-creator-container">
				<div className="admin-page-header">
					<div>
						<h1 className="admin-page-title">
							{id && id !== 'new' ? 'Editează Modul' : 'Creează Modul Nou'}
						</h1>
						<p className="admin-page-subtitle">
							Completează informațiile pentru {id && id !== 'new' ? 'actualizarea' : 'crearea'} modulului
						</p>
					</div>
					<button 
						className="admin-btn admin-btn-secondary" 
						onClick={() => {
							if (formData.course_id) {
								navigate(`/admin/courses/${formData.course_id}`);
							} else {
								navigate('/admin/courses');
							}
						}}
					>
						← Înapoi
					</button>
				</div>

				<div className="admin-creator-split">
					<div className="admin-creator-form-panel">
						<form onSubmit={handleSubmit} className="admin-form">
							<div className="admin-form-group">
								<label className="admin-label">
									Titlu Modul <span className="admin-form-required">*</span>
								</label>
								<input
									type="text"
									className={`admin-form-input ${errors.title ? 'error' : ''}`}
									value={formData.title}
									onChange={(e) => setFormData({ ...formData, title: e.target.value })}
									placeholder="Titlul modulului"
									maxLength={255}
								/>
								{errors.title && (
									<p className="admin-form-error">{errors.title}</p>
								)}
							</div>

							<div className="admin-form-group">
								<label className="admin-label">
									Descriere
								</label>
								<textarea
									className="admin-form-textarea"
									value={formData.description}
									onChange={(e) => setFormData({ ...formData, description: e.target.value })}
									placeholder="Descrierea modulului (opțional)"
									rows={4}
								/>
							</div>

							<div className="admin-form-actions">
								<button
									type="button"
									className="admin-btn admin-btn-secondary"
									onClick={() => {
										if (formData.course_id) {
											navigate(`/admin/courses/${formData.course_id}`);
										} else {
											navigate('/admin/courses');
										}
									}}
								>
									Anulează
								</button>
								<button
									type="submit"
									className="admin-btn admin-btn-primary"
									disabled={loading}
								>
									{loading ? 'Se salvează...' : (id && id !== 'new' ? 'Actualizează Modul' : 'Creează Modul')}
								</button>
							</div>
						</form>
					</div>

					{/* Preview Panel */}
					<div className="admin-creator-preview-panel">
						<div className="admin-creator-preview-header">
							<h3>Preview Live</h3>
							<p>Vizualizează modificările în timp real</p>
						</div>
						<div className="admin-creator-preview-content">
							<div className="module-preview-card">
								<div className="module-preview-body">
									<h4 className="module-preview-title">{formData.title || 'Titlu modul'}</h4>
									{formData.description && (
										<p className="module-preview-description">{formData.description}</p>
									)}
									<div className="module-preview-meta">
										<div className="module-preview-meta-item">
											<span className="module-preview-meta-label">Status:</span>
											<span className="module-preview-meta-value">{formData.status || 'draft'}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ModuleCreatorPage;
