import React, { useState, useEffect } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import ConfirmModal from '../../../components/common/ConfirmModal';
import './CourseTestsManager.css';

const TYPE_LABELS = { final: 'Test final' };

const CourseTestsManager = ({ courseId, courseData, onUpdate }) => {
	const { showToast } = useToast();
	const [availableTests, setAvailableTests] = useState([]);
	const [linkedTests, setLinkedTests] = useState([]);
	const [loading, setLoading] = useState(false);
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [selectedTest, setSelectedTest] = useState(null);
	const [linkOptions, setLinkOptions] = useState({
		scope: 'course',
		scope_id: null,
		required: false,
		passing_score: 70,
		order: 0,
	});
	const [unlinkConfirm, setUnlinkConfirm] = useState(null);
	const [unlinkLoading, setUnlinkLoading] = useState(false);

	useEffect(() => {
		if (courseId) {
			fetchData();
		}
	}, [courseId]);

	const fetchData = async () => {
		setLoading(true);
		try {
			const [tests, course] = await Promise.all([
				adminService.getTests({ status: 'published' }),
				adminService.getCourse(courseId),
			]);
			
			setAvailableTests(Array.isArray(tests) ? tests : (tests?.data || []));
			setLinkedTests(course.tests || course.courseTests || []);
		} catch (err) {
			console.error('Error fetching data:', err);
			showToast('Eroare la încărcarea datelor', 'error');
		} finally {
			setLoading(false);
		}
	};

	const handleLinkTest = async () => {
		if (!selectedTest) {
			showToast('Selectează un test', 'error');
			return;
		}

		try {
			await adminService.linkTestToCourse(selectedTest.id, courseId, linkOptions);
			showToast('Test atașat cu succes', 'success');
			setShowLinkModal(false);
			setSelectedTest(null);
			fetchData();
		} catch (err) {
			console.error('Error linking test:', err);
			showToast(err.response?.data?.error || 'Eroare la atașarea testului', 'error');
		}
	};

	const handleUnlinkTestClick = (testId, scope, scopeId) => {
		setUnlinkConfirm({ testId, scope, scopeId });
	};

	const handleConfirmUnlinkTest = async () => {
		if (!unlinkConfirm) return;
		setUnlinkLoading(true);
		try {
			await adminService.unlinkTestFromCourse(unlinkConfirm.testId, courseId, unlinkConfirm.scope, unlinkConfirm.scopeId);
			setUnlinkConfirm(null);
			showToast('Test deconectat cu succes', 'success');
			fetchData();
		} catch (err) {
			console.error('Error unlinking test:', err);
			showToast(err.response?.data?.error || 'Eroare la deconectarea testului', 'error');
		} finally {
			setUnlinkLoading(false);
		}
	};

	const getScopeLabel = (scope, scopeId) => {
		if (scope === 'course') return 'Curs complet';
		if (scope === 'module') {
			const module = courseData?.modules?.find(m => m.id === scopeId);
			return module ? `Modul: ${module.title}` : `Modul ID: ${scopeId}`;
		}
		if (scope === 'lesson') {
			// Find lesson in modules
			for (const module of courseData?.modules || []) {
				const lesson = module.lessons?.find(l => l.id === scopeId);
				if (lesson) return `Lecție: ${lesson.title}`;
			}
			return `Lecție ID: ${scopeId}`;
		}
		return scope;
	};

	const getTestTypeBadge = (type) => {
		const normalized = String(type || 'final').toLowerCase();
		const badge = normalized === 'final'
			? { label: 'Test final', color: '#EF4444' }
			: { label: 'Test final', color: '#EF4444' };
		return (
			<span className="test-type-badge" style={{ backgroundColor: `${badge.color}20`, color: badge.color }}>
				{badge.label}
			</span>
		);
	};

	const canAttach = selectedTest && (linkOptions.scope === 'course' || (linkOptions.scope_id != null && linkOptions.scope_id !== ''));

	const openLinkModal = () => {
		setLinkOptions({ scope: 'course', scope_id: null, required: false, passing_score: 70, order: 0 });
		setSelectedTest(null);
		setShowLinkModal(true);
	};

	return (
		<div className="course-tests-manager">
			<div className="course-tests-header">
				<div>
					<h2>Teste & Evaluări</h2>
					<p>Gestionează testele atribuite acestui curs</p>
				</div>
				<button
					className="admin-btn admin-btn-primary"
					onClick={openLinkModal}
					type="button"
				>
					➕ Atașează test
				</button>
			</div>

			{/* Linked Tests */}
			<div className="course-tests-list">
				{linkedTests.length === 0 ? (
					<div className="course-tests-empty">
						<div className="course-tests-empty-icon">📝</div>
						<h3>Nu există teste atașate</h3>
						<p>Adaugă teste pentru a evalua progresul studenților</p>
						<button
							className="admin-btn admin-btn-primary"
							onClick={openLinkModal}
							type="button"
						>
							➕ Atașează primul test
						</button>
					</div>
				) : (
					linkedTests.map((test, index) => {
						const pivot = test.pivot || test;
						return (
							<div key={`${test.id}-${pivot.scope}-${pivot.scope_id}`} className="course-test-card">
								<div className="course-test-card-header">
									<div className="course-test-card-info">
										<h3>{test.title}</h3>
										<div className="course-test-card-meta">
											{getTestTypeBadge(test.type)}
											<span className="test-scope-badge">
												📍 {getScopeLabel(pivot.scope, pivot.scope_id)}
											</span>
											{pivot.required && (
												<span className="test-required-badge">Obligatoriu</span>
											)}
										</div>
									</div>
									<div className="course-test-card-actions">
										<span className="test-passing-score">
											Scor minim: {pivot.passing_score}%
										</span>
										<button
											type="button"
											className="admin-btn admin-btn-danger admin-btn-sm"
											onClick={() => handleUnlinkTestClick(test.id, pivot.scope, pivot.scope_id)}
										>
											Detașează
										</button>
									</div>
								</div>
								{test.description && (
									<p className="course-test-card-description">{test.description}</p>
								)}
								<div className="course-test-card-stats">
									<span>⏱️ {test.time_limit_minutes || 'Fără limită'} min</span>
									<span>🔄 {test.max_attempts || 'Nelimitat'} încercări</span>
									<span>❓ {test.questions_count || 0} întrebări</span>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Link Test Modal */}
			{showLinkModal && (
				<div className="course-tests-modal-overlay" onClick={() => setShowLinkModal(false)}>
					<div className="course-tests-modal" onClick={(e) => e.stopPropagation()}>
						<div className="course-tests-modal-header">
							<h3>Atașează test la curs</h3>
							<button
								type="button"
								className="course-tests-modal-close"
								onClick={() => setShowLinkModal(false)}
								aria-label="Închide"
							>
								✕
							</button>
						</div>

						<div className="course-tests-modal-content">
							<div className="course-tests-form-group">
								<label htmlFor="ctm-select-test">Test</label>
								<select
									id="ctm-select-test"
									className="admin-form-input"
									value={selectedTest?.id || ''}
									onChange={(e) => {
										const test = availableTests.find(t => t.id === parseInt(e.target.value, 10));
										setSelectedTest(test || null);
									}}
								>
									<option value="">— Alege un test —</option>
									{availableTests.map(test => (
										<option key={test.id} value={test.id}>
											{test.title} — {TYPE_LABELS[test.type] || test.type} · {(test.questions_count ?? 0)} întrebări
										</option>
									))}
								</select>
								{availableTests.length === 0 && !loading && (
									<p className="course-tests-modal-hint">Nu există teste publicate. Publică un test din secțiunea Teste.</p>
								)}
							</div>

							<div className="course-tests-form-group">
								<label htmlFor="ctm-scope">Domeniu</label>
								<select
									id="ctm-scope"
									className="admin-form-input"
									value={linkOptions.scope}
									onChange={(e) => {
										setLinkOptions(prev => ({
											...prev,
											scope: e.target.value,
											scope_id: null,
										}));
									}}
								>
									<option value="course">Curs complet</option>
									<option value="module">Modul specific</option>
									<option value="lesson">Lecție specifică</option>
								</select>
							</div>

							{linkOptions.scope === 'module' && (
								<div className="course-tests-form-group">
									<label htmlFor="ctm-module">Modul</label>
									<select
										id="ctm-module"
										className="admin-form-input"
										value={linkOptions.scope_id ?? ''}
										onChange={(e) => {
											const v = e.target.value;
											setLinkOptions(prev => ({ ...prev, scope_id: v ? parseInt(v, 10) : null }));
										}}
									>
										<option value="">— Alege modulul —</option>
										{(courseData?.modules || []).map(m => (
											<option key={m.id} value={m.id}>{m.title}</option>
										))}
									</select>
								</div>
							)}

							{linkOptions.scope === 'lesson' && (
								<div className="course-tests-form-group">
									<label htmlFor="ctm-lesson">Lecție</label>
									<select
										id="ctm-lesson"
										className="admin-form-input"
										value={linkOptions.scope_id ?? ''}
										onChange={(e) => {
											const v = e.target.value;
											setLinkOptions(prev => ({ ...prev, scope_id: v ? parseInt(v, 10) : null }));
										}}
									>
										<option value="">— Alege lecția —</option>
										{(courseData?.modules || []).flatMap(m =>
											(m.lessons || []).map(l => (
												<option key={l.id} value={l.id}>{m.title} → {l.title}</option>
											))
										)}
									</select>
								</div>
							)}

							<div className="course-tests-form-group">
								<label className="course-tests-check-label">
									<input
										type="checkbox"
										checked={!!linkOptions.required}
										onChange={(e) => setLinkOptions(prev => ({ ...prev, required: e.target.checked }))}
									/>
									<span>Test obligatoriu</span>
								</label>
							</div>

							<div className="course-tests-form-group">
								<label htmlFor="ctm-passing">Scor minim trecere (%)</label>
								<input
									id="ctm-passing"
									type="number"
									className="admin-form-input"
									min={0}
									max={100}
									value={linkOptions.passing_score}
									onChange={(e) => setLinkOptions(prev => ({ ...prev, passing_score: parseInt(e.target.value, 10) || 70 }))}
								/>
							</div>
						</div>

						<div className="course-tests-modal-footer">
							<button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowLinkModal(false)}>
								Anulare
							</button>
							<button
								type="button"
								className="admin-btn admin-btn-primary"
								onClick={handleLinkTest}
								disabled={!canAttach}
							>
								Atașează
							</button>
						</div>
					</div>
				</div>
			)}

			<ConfirmModal
				open={!!unlinkConfirm}
				onClose={() => setUnlinkConfirm(null)}
				onConfirm={handleConfirmUnlinkTest}
				title="Detașează test"
				message="Sigur vrei să detașezi acest test de la curs?"
				confirmLabel="Detașează"
				cancelLabel="Anulare"
				variant="danger"
				loading={unlinkLoading}
			/>
		</div>
	);
};

export default CourseTestsManager;
