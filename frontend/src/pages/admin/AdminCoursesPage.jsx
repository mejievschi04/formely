import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragGripIcon } from '../../components/common/DragGripIcon';
import {
	CourseShowcaseEditButton,
	CourseShowcasePublishToggle,
} from '../../components/admin/courses/CourseShowcaseQuickActions';
import { useCoursePublishFromCard } from '../../hooks/useCoursePublishFromCard';
import { adminService } from '../../services/api';
import BuildCourseModal from '../../components/admin/courses/BuildCourseModal';
import AICourseChat from '../../components/admin/ai/AICourseChat';
import { canUseAiFeature, isAiEnabled } from '../../utils/aiAvailability';
import { courseCoverSrc } from '../../utils/imageUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CourseShowcaseCard, COURSE_SHOWCASE_FALLBACK_IMAGE } from '../../components/ui/course-showcase-card';
import { hexToHslSpace } from '../../lib/hexToHsl';
import './AdminCoursesPage.css';

function sortableAdminCourseId(courseId) {
	return `admin-course-${courseId}`;
}

function SortableAdminCourseCard({
	course,
	coverSrc,
	accentHsl,
	statusLabel,
	canMutate,
	canEditCourse,
	onOpen,
	onEdit,
	onStatusClick,
	statusBusy,
}) {
	const sid = sortableAdminCourseId(course.id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sid,
		disabled: !canMutate,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.9 : 1,
		zIndex: isDragging ? 2 : undefined,
	};
	const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
	const dragHandle = canMutate ? (
		<span
			className="course-showcase-dnd-handle va-card-icon-btn"
			{...attributes}
			{...listeners}
			aria-label="Trage pentru a reordona cursul"
			title="Reordonare"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
			}}
		>
			<DragGripIcon size={14} />
		</span>
	) : null;

	return (
		<article
			ref={setNodeRef}
			style={style}
			className={`admin-courses-clean-card--showcase-wrap${canMutate ? ' admin-courses-clean-card--sortable' : ''}`}
		>
			<CourseShowcaseCard
				imageUrl={imageUrl}
				title={course.title || 'Curs fără titlu'}
				subtitle={`${course.modules_count || 0} module • ${course.enrollments_count || 0} elevi`}
				themeHsl={accentHsl}
				onOpen={onOpen}
				ctaLabel="Deschide"
				badge={statusLabel}
				topLeftSlot={dragHandle}
				topRightSlot={canEditCourse ? <CourseShowcaseEditButton onEdit={onEdit} /> : null}
				footerExtraSlot={
					canMutate ? (
						<CourseShowcasePublishToggle
							course={course}
							onStatusClick={onStatusClick}
							statusBusy={statusBusy}
						/>
					) : null
				}
			/>
		</article>
	);
}

function StaticAdminCourseCard({ course, coverSrc, accentHsl, statusLabel, canMutate, canEditCourse, onOpen, onEdit, onStatusClick, statusBusy }) {
	const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
	return (
		<article className="admin-courses-clean-card--showcase-wrap">
			<CourseShowcaseCard
				imageUrl={imageUrl}
				title={course.title || 'Curs fără titlu'}
				subtitle={`${course.modules_count || 0} module • ${course.enrollments_count || 0} elevi`}
				themeHsl={accentHsl}
				onOpen={onOpen}
				ctaLabel="Deschide"
				badge={statusLabel}
				topRightSlot={canEditCourse ? <CourseShowcaseEditButton onEdit={onEdit} /> : null}
				footerExtraSlot={
					canMutate ? (
						<CourseShowcasePublishToggle
							course={course}
							onStatusClick={onStatusClick}
							statusBusy={statusBusy}
						/>
					) : null
				}
			/>
		</article>
	);
}

const AdminCoursesPage = () => {
	const { canMutateInAdminArea, canEditCoursesAsStaff, user } = useAuth();
	const { showToast } = useToast();
	const navigate = useNavigate();
	const [courses, setCourses] = useState([]);
	const [orderedCourses, setOrderedCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState(null);
	const [search, setSearch] = useState('');
	const [showCreateMenu, setShowCreateMenu] = useState(false);
	const [showBuildModal, setShowBuildModal] = useState(false);
	const [showAiCourseChat, setShowAiCourseChat] = useState(false);
	const createMenuRef = useRef(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const fetchCourses = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await adminService.getCourses({
				search: undefined,
				sort_by: 'list_order',
				sort_direction: 'asc',
				per_page: 500,
				status: 'all',
			});
			const list = Array.isArray(data) ? data : [];
			setCourses(list);
			setOrderedCourses([...list]);
		} catch (err) {
			console.error('Eroare încărcare cursuri:', err);
			setError('Nu s-au putut încărca cursurile');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchCourses();
	}, [fetchCourses]);

	useEffect(() => {
		const handleOutsideClick = (event) => {
			if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
				setShowCreateMenu(false);
			}
		};
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, []);

	const handleBuildSubmit = async ({ title, description, image, pdfFile }) => {
		setCreating(true);
		try {
			let payload;
			if (image || pdfFile) {
				const formData = new FormData();
				formData.append('title', title);
				formData.append('description', description);
				formData.append('status', 'draft');
				formData.append('level', 'beginner');
				formData.append('visibility', 'public');
				formData.append('sequential_unlock', '1');
				formData.append('min_test_score', '70');
				formData.append('has_certificate', '0');
				formData.append('access_type', 'free');
				formData.append('enrollment_type', 'open');
				if (image) formData.append('image', image);
				if (pdfFile) formData.append('pdf_file', pdfFile);
				payload = formData;
			} else {
				payload = {
					title,
					description,
					status: 'draft',
					level: 'beginner',
					visibility: 'public',
					sequential_unlock: true,
					min_test_score: 70,
					has_certificate: false,
					access_type: 'free',
					enrollment_type: 'open',
				};
			}
			const result = await adminService.createCourse(payload);
			const courseId = result?.course?.id;
			if (courseId) {
				setShowBuildModal(false);
				navigate(`/admin/courses/${courseId}/builder`);
			}
		} catch (err) {
			console.error('Error creating course:', err);
		} finally {
			setCreating(false);
		}
	};

	const handleAiCourseGenerated = (course) => {
		if (course?.id) {
			setShowAiCourseChat(false);
			fetchCourses();
			navigate(`/admin/courses/${course.id}/builder`);
		}
	};

	const filteredCourses = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return orderedCourses;
		return orderedCourses.filter((course) => (course.title || '').toLowerCase().includes(query));
	}, [orderedCourses, search]);

	/** Butonul „Editează” pe card nu depinde de modul admin/student (preview); doar de rolul real. */
	const canEditCourseFromShowcase = canEditCoursesAsStaff;

	const patchCourseInLists = useCallback((courseId, patch) => {
		const merge = (c) => (Number(c.id) === Number(courseId) ? { ...c, ...patch } : c);
		setCourses((rows) => rows.map(merge));
		setOrderedCourses((rows) => rows.map(merge));
	}, []);

	const { handleCourseStatusQuick, statusBusyId, publishModal } = useCoursePublishFromCard({
		onCoursePatched: patchCourseInLists,
		showToast,
	});

	const dndEnabled = canMutateInAdminArea && !search.trim();

	const handleCoursesDragEnd = async (event) => {
		if (!dndEnabled) return;
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = orderedCourses.findIndex((c) => sortableAdminCourseId(c.id) === active.id);
		const newIndex = orderedCourses.findIndex((c) => sortableAdminCourseId(c.id) === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(orderedCourses, oldIndex, newIndex);
		setOrderedCourses(next);
		try {
			await adminService.reorderCoursesList(next.map((c) => c.id));
			setCourses(next);
			showToast('Ordinea cursurilor a fost salvată', 'success');
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut salva ordinea', 'error');
			setOrderedCourses([...courses]);
		}
	};

	if (error) {
		return (
			<div className="admin-container">
				<div className="lms-empty-state">
					<p style={{ color: 'var(--color-error)' }}>{error}</p>
					<button type="button" className="lms-btn-primary" onClick={fetchCourses}>
						Încearcă din nou
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-courses-clean-page">
			{showBuildModal && canMutateInAdminArea && (
				<BuildCourseModal
					onClose={() => { setShowBuildModal(false); }}
					onSubmit={handleBuildSubmit}
					loading={creating}
				/>
			)}
			{showAiCourseChat && canMutateInAdminArea && canUseAiFeature(user, 'ai_creator') && (
				<div className="ai-chat-modal-overlay" onClick={() => setShowAiCourseChat(false)}>
					<div className="ai-chat-modal" onClick={(e) => e.stopPropagation()}>
						<AICourseChat
							onCourseGenerated={handleAiCourseGenerated}
							onClose={() => setShowAiCourseChat(false)}
						/>
					</div>
				</div>
			)}
			<header className="admin-courses-clean-header">
				<div>
					<h1>Cursuri</h1>
					<p>Catalogul Formely — creează, publică și urmărește progresul elevilor.</p>
				</div>
				<div className="admin-courses-clean-right">
					{canMutateInAdminArea && (
					<div className="admin-courses-create-wrap" ref={createMenuRef}>
						<button type="button" className="admin-courses-create-btn" onClick={() => setShowCreateMenu((prev) => !prev)}>
							+ Creează curs
						</button>
						{showCreateMenu && (
							<div className="admin-courses-create-menu">
								<button type="button" onClick={() => { setShowCreateMenu(false); navigate('/admin/courses/new'); }}>
									Curs nou
								</button>
								{canUseAiFeature(user, 'ai_creator') ? (
								<button type="button" onClick={() => {
									setShowCreateMenu(false);
									setShowAiCourseChat(true);
								}}>
									Curs cu Formely AI
								</button>
								) : null}
							</div>
						)}
					</div>
					)}
					<div className="admin-courses-top-links">
					{canMutateInAdminArea && (
						<button type="button" onClick={() => navigate('/admin/content?tab=courses&view=maps&new=1')}>
							Creează mapă
						</button>
						)}
					</div>
				</div>
			</header>

			<div className="admin-courses-clean-search">
				<input
					type="text"
					placeholder="Caută curs…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Caută curs"
				/>
			</div>
			{search.trim() ? (
				<p className="admin-courses-dnd-hint">Golirea câmpului de căutare activează reordonarea cu drag and drop.</p>
			) : null}

			{loading ? (
				<div className="admin-courses-clean-loading"><div className="lms-spinner"></div><p>Se încarcă cursurile...</p></div>
			) : filteredCourses.length === 0 ? (
				<div className="admin-courses-clean-empty">
					<p>Nu există cursuri. Creează primul curs.</p>
				</div>
			) : dndEnabled ? (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCoursesDragEnd}>
					<SortableContext
						items={orderedCourses.map((c) => sortableAdminCourseId(c.id))}
						strategy={rectSortingStrategy}
					>
						<div className="admin-courses-clean-grid">
							{orderedCourses.map((course) => {
								const coverSrc = courseCoverSrc(course);
								const statusLabel = String(course.status || 'draft').toLowerCase() === 'published' ? 'Publicat' : 'Draft';
								const accentColor = course.card_color || '#0891b2';
								return (
									<SortableAdminCourseCard
										key={course.id}
										course={course}
										coverSrc={coverSrc}
										accentHsl={hexToHslSpace(accentColor)}
										statusLabel={statusLabel}
										canMutate={canMutateInAdminArea}
										canEditCourse={canEditCourseFromShowcase}
										onOpen={() => navigate(`/admin/courses/${course.id}`)}
										onEdit={() => navigate(`/admin/courses/${course.id}/builder`)}
										onStatusClick={handleCourseStatusQuick}
										statusBusy={statusBusyId === course.id}
									/>
								);
							})}
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<div className="admin-courses-clean-grid">
					{filteredCourses.map((course) => {
						const coverSrc = courseCoverSrc(course);
						const statusLabel = String(course.status || 'draft').toLowerCase() === 'published' ? 'Publicat' : 'Draft';
						const accentColor = course.card_color || '#0891b2';
						return (
							<StaticAdminCourseCard
								key={course.id}
								course={course}
								coverSrc={coverSrc}
								accentHsl={hexToHslSpace(accentColor)}
								statusLabel={statusLabel}
								canMutate={canMutateInAdminArea}
								canEditCourse={canEditCourseFromShowcase}
								onOpen={() => navigate(`/admin/courses/${course.id}`)}
								onEdit={() => navigate(`/admin/courses/${course.id}/builder`)}
								onStatusClick={handleCourseStatusQuick}
								statusBusy={statusBusyId === course.id}
							/>
						);
					})}
				</div>
			)}
			{publishModal}
		</div>
	);
};

export default AdminCoursesPage;
