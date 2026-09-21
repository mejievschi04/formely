import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
import { ArrowLeft, Info, ArrowRight } from '@phosphor-icons/react';
import { DragGripIcon } from '../components/common/DragGripIcon';
import { courseMapsService, adminService } from '../services/api';
import { courseCoverSrc } from '../utils/imageUrl';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CourseShowcaseCard, COURSE_SHOWCASE_FALLBACK_IMAGE } from '../components/ui/course-showcase-card';
import { hexToHslSpace } from '../lib/hexToHsl';
import { isStudentVisibleMap } from '../utils/courseMapVisibility';
import CourseMapHeaderStyleEditor from '../components/admin/course-maps/CourseMapHeaderStyleEditor';
import {
	CourseShowcaseEditButton,
	CourseShowcasePublishToggle,
} from '../components/admin/courses/CourseShowcaseQuickActions';
import { useCoursePublishFromCard } from '../hooks/useCoursePublishFromCard';
import './CourseMapPage.css';

/**
 * Pagina unei mape de cursuri (folder).
 */
function sortableCourseId(courseId) {
	return `course-map-page-course-${courseId}`;
}

function CourseMapCourseCard({ course, onNavigateCourse, themeHsl }) {
	const coverSrc = courseCoverSrc(course);
	const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
	return (
		<div className="course-map-course-card course-map-course-card--showcase-wrap">
			<CourseShowcaseCard
				imageUrl={imageUrl}
				title={course.title}
				progress={course.progress_percentage ?? 0}
				themeHsl={themeHsl}
				showAccentRibbon
				onOpen={() => onNavigateCourse(course.id)}
				ctaLabel="Începe"
			/>
		</div>
	);
}

function SortableCourseMapCourseCard({
	course,
	onNavigateCourse,
	themeHsl,
	canMutate,
	canEdit,
	onStatusClick,
	onEdit,
	statusBusy,
}) {
	const sid = sortableCourseId(course.id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sid });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.88 : 1,
		zIndex: isDragging ? 2 : undefined,
	};
	const coverSrc = courseCoverSrc(course);
	const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
	const dragHandle = (
		<span
			className="course-showcase-dnd-handle"
			{...attributes}
			{...listeners}
			aria-label="Trage pentru a reordona cursul în mapă"
			title="Reordonare"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
			}}
		>
			<DragGripIcon size={14} />
		</span>
	);
	return (
		<div
			ref={setNodeRef}
			style={style}
			className="course-map-course-card course-map-course-card--admin-sortable course-map-course-card--showcase-wrap"
		>
			<CourseShowcaseCard
				imageUrl={imageUrl}
				title={course.title}
				themeHsl={themeHsl}
				showAccentRibbon
				onOpen={() => onNavigateCourse(course.id)}
				ctaLabel="Deschide"
				topLeftSlot={dragHandle}
				topRightSlot={canEdit ? <CourseShowcaseEditButton onEdit={onEdit} /> : null}
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
		</div>
	);
}

const CourseMapPage = () => {
	const { mapId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user, canMutateInAdminArea, canEditCoursesAsStaff } = useAuth();
	const { showToast } = useToast();
	const headerRef = useRef(null);
	const [headerHeight, setHeaderHeight] = useState(90);
	const isAdminRoute = location.pathname.startsWith('/admin/');
	const canShowMapHeaderEdit = canEditCoursesAsStaff && isAdminRoute;
	const isAdmin = user?.role === 'admin' || user?.role === 'instructor';
	const mapsListPath = isAdmin
		? user?.actualRole === 'instructor'
			? '/admin/content?tab=courses'
			: '/admin/content?tab=courses&view=maps'
		: '/courses';
	const mapsListShortLabel = isAdmin
		? user?.actualRole === 'instructor'
			? 'Înapoi la cursuri'
			: 'Înapoi la mape'
		: 'Înapoi la Cursuri';
	const mapsListAriaLabel = isAdmin
		? user?.actualRole === 'instructor'
			? 'Înapoi la lista de cursuri din admin'
			: 'Înapoi la lista de mape de curs'
		: 'Înapoi la lista de cursuri și mape';
	const [map, setMap] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [orderedCourses, setOrderedCourses] = useState([]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	useEffect(() => {
		if (map?.courses) {
			setOrderedCourses([...map.courses]);
		} else {
			setOrderedCourses([]);
		}
	}, [map]);

	const navigateToCourse = useCallback(
		(courseId) => {
			navigate(isAdmin ? `/admin/courses/${courseId}` : `/courses/${courseId}`);
		},
		[navigate, isAdmin]
	);

	const mergeCourseIntoLists = useCallback((courseId, updatedCourse) => {
		const patch = (c) => (Number(c.id) === Number(courseId) ? { ...c, ...updatedCourse } : c);
		setMap((prev) => {
			if (!prev?.courses) return prev;
			return { ...prev, courses: prev.courses.map(patch) };
		});
		setOrderedCourses((rows) => rows.map(patch));
	}, []);

	const { handleCourseStatusQuick, statusBusyId, publishModal } = useCoursePublishFromCard({
		onCoursePatched: mergeCourseIntoLists,
		showToast,
	});

	const handleCoursesDragEnd = async (event) => {
		if (!isAdmin || !map?.id) return;
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = orderedCourses.findIndex((c) => sortableCourseId(c.id) === active.id);
		const newIndex = orderedCourses.findIndex((c) => sortableCourseId(c.id) === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(orderedCourses, oldIndex, newIndex);
		setOrderedCourses(next);
		try {
			const order = next.map((c, i) => ({ course_id: c.id, order: i }));
			const updated = await adminService.reorderCourseMapCourses(map.id, order);
			setMap(updated);
			showToast('Ordinea cursurilor în mapă a fost salvată.', 'success');
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut salva ordinea cursurilor', 'error');
			setOrderedCourses(map.courses ? [...map.courses] : []);
		}
	};

	useEffect(() => {
		let cancelled = false;
		const fetchMap = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = isAdmin
					? await adminService.getCourseMap(mapId)
					: await courseMapsService.getMap(mapId);
				if (!cancelled) {
					if (data && !isAdmin && !isStudentVisibleMap(data)) {
						setMap(null);
						setError('Mapa nu a fost găsită.');
					} else {
						setMap(data);
					}
				}
			} catch (err) {
				if (!cancelled) setError(err.response?.status === 404 ? 'Mapa nu a fost găsită.' : 'Nu s-a putut încărca mapa.');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		fetchMap();
		return () => { cancelled = true; };
	}, [mapId, isAdmin]);

	useEffect(() => {
		const el = headerRef.current;
		if (!el || isAdmin) return undefined;

		const syncHeight = () => {
			setHeaderHeight(el.getBoundingClientRect().height);
		};

		syncHeight();
		const observer = new ResizeObserver(syncHeight);
		observer.observe(el);
		window.addEventListener('resize', syncHeight);

		return () => {
			observer.disconnect();
			window.removeEventListener('resize', syncHeight);
		};
	}, [isAdmin, map?.name, map?.description]);

	if (loading) {
		return (
			<div className="course-map-page">
				<div className="course-map-page-loading">
					<div className="course-map-page-spinner" />
					<p>Se încarcă...</p>
				</div>
			</div>
		);
	}

	if (error || !map) {
		return (
			<div className="course-map-page">
				<div className="course-map-page-error">
					<p>{error || 'Eroare'}</p>
					<button type="button" className="course-map-page-btn" onClick={() => navigate(mapsListPath)}>
						<ArrowLeft size={18} weight="bold" aria-hidden="true" />
						{mapsListShortLabel}
					</button>
				</div>
			</div>
		);
	}

	const { name, description, courses } = map;
	const displayCourses = isAdmin ? orderedCourses : courses;
	const isVirtualMap = Boolean(map?.is_virtual) || String(map?.id || '') === 'unassigned';
	const accent = map.accent_color || '#059669';
	const mapThemeHsl = hexToHslSpace(accent);
	const headerBgColor = map.header_bg_color?.trim() || '';
	const headerTextColor = map.header_text_color?.trim() || '';
	const hasCustomHeaderColors = Boolean(headerBgColor || headerTextColor);
	const resolvedHeaderText = headerTextColor || '#f8fafc';
	const headerStyle = {
		background: headerBgColor
			? headerBgColor
			: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 65%, var(--formely-bg, #0f172a)))`,
		color: resolvedHeaderText,
		'--map-header-text': resolvedHeaderText,
	};

	return (
		<div
			className={`course-map-page${!isAdmin ? ' course-map-page--student' : ''}`}
			style={!isAdmin ? { '--course-map-header-height': `${headerHeight}px` } : undefined}
		>
			<header
				ref={headerRef}
				className={`course-map-page-header course-map-page-header--branded${hasCustomHeaderColors ? ' course-map-page-header--custom-colors' : ''}${canShowMapHeaderEdit ? ' course-map-page-header--has-edit' : ''}`}
				style={headerStyle}
			>
				<div className="course-map-page-header-inner">
					{canShowMapHeaderEdit ? (
						<CourseMapHeaderStyleEditor map={map} onSaved={setMap} />
					) : null}
					<div className="course-map-page-header-top">
						<button
							type="button"
							className="course-map-page-back"
							onClick={() => navigate(mapsListPath)}
							aria-label={mapsListAriaLabel}
							title={mapsListShortLabel}
						>
							<ArrowLeft size={20} weight="bold" aria-hidden="true" />
							<span className="course-map-page-back-label">Înapoi</span>
						</button>
						<div className="course-map-page-title-block">
							<div className="course-map-page-title-row">
								<h1 className="course-map-page-title">{name}</h1>
								{isVirtualMap && isAdmin ? (
									<span className="course-map-page-virtual-badge">Mapă virtuală</span>
								) : null}
							</div>
							{description ? <p className="course-map-page-description">{description}</p> : null}
						</div>
					</div>
				</div>
			</header>

			<div className="course-map-page-content">
				{isAdmin && displayCourses && displayCourses.length > 0 && (
					<p className="course-map-page-dnd-hint" role="note">
						<Info size={18} weight="bold" aria-hidden />
						<span>
							Trage cursurile din <strong>banda din stânga</strong> (nu acoperi coperta). Poți{' '}
							<strong>adăuga sau schimba imaginea</strong> din zona copertei pe fiecare card.
						</span>
					</p>
				)}
				{displayCourses && displayCourses.length > 0 ? (
					isAdmin ? (
						<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCoursesDragEnd}>
							<SortableContext items={displayCourses.map((c) => sortableCourseId(c.id))} strategy={rectSortingStrategy}>
								<div className="course-map-page-grid">
									{displayCourses.map((course) => (
										<SortableCourseMapCourseCard
											key={course.id}
											course={course}
											onNavigateCourse={navigateToCourse}
											themeHsl={mapThemeHsl}
											canMutate={canMutateInAdminArea}
											canEdit={canEditCoursesAsStaff}
											onStatusClick={handleCourseStatusQuick}
											onEdit={() => navigate(`/admin/courses/${course.id}/builder`)}
											statusBusy={statusBusyId === course.id}
										/>
									))}
								</div>
							</SortableContext>
						</DndContext>
					) : (
						<div className="course-map-page-grid">
							{displayCourses.map((course) => (
								<CourseMapCourseCard
									key={course.id}
									course={course}
									onNavigateCourse={navigateToCourse}
									themeHsl={mapThemeHsl}
								/>
							))}
						</div>
					)
				) : (
					<div className="course-map-page-empty">
						<p>Nu există cursuri în această mapă.</p>
						<button type="button" className="course-map-page-btn" onClick={() => navigate(mapsListPath)}>
							<ArrowLeft size={18} weight="bold" aria-hidden="true" />
							{mapsListShortLabel}
						</button>
					</div>
				)}
			</div>
			{publishModal}
		</div>
	);
};

export default CourseMapPage;
