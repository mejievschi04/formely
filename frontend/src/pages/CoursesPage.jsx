import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Books, MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { courseMapsService, adminService, coursesService, profileService, dashboardService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';
import { CourseShowcaseCard } from '../components/ui/course-showcase-card';
import { COURSE_SHOWCASE_FALLBACK_IMAGE } from '../components/ui/course-showcase-cardShared.js';
import CourseMapFolderTile from '../components/ui/CourseMapFolderTile';
import { courseCoverSrc, mapFolderCardImageUrl } from '../utils/imageUrl';
import { hexToHslSpace } from '../lib/hexToHsl';
import { isStudentVisibleMap } from '../utils/courseMapVisibility';
import ResumeLearningWidget from '../components/student/ResumeLearningWidget';
import './CoursesPage.css';
import '../styles/learning-experience.css';
import { courseProgressLabel } from '../utils/courseProgressLabel.js';

const COURSE_MAP_ACCENT_COLORS = [
	'#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e', '#0ea5e9',
];

const STUDENT_COURSE_FILTERS = [
	{ id: 'maps', label: 'Cursuri indicate' },
	{ id: 'unfinished', label: 'Cursuri nepromovate' },
	{ id: 'completed', label: 'Cursuri finalizate', statKey: 'completed' },
];

const STUDENT_FILTER_TITLES = {
	maps: 'Mape',
	unfinished: 'Cursuri nepromovate',
	completed: 'Cursuri finalizate',
};

function courseIsCompleted(course) {
	if (!course) return false;
	if (course.status === 'completed') return true;
	if (course.completed_at) return true;
	return Number(course.progress_percentage ?? course.progress ?? 0) >= 100;
}

const CoursesPage = () => {
	const navigate = useNavigate();
	const { user, loading: authLoading } = useAuth();
	const isAdmin = user?.role === 'admin' || user?.role === 'instructor';
	const isStudent = !isAdmin;

	const [courseMaps, setCourseMaps] = useState([]);
	const [standaloneCourses, setStandaloneCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [studentFilter, setStudentFilter] = useState('maps');
	const [assignedCourses, setAssignedCourses] = useState({
		all: [],
		in_progress: [],
		not_accessed: [],
		completed: [],
	});
	const [nextLesson, setNextLesson] = useState(null);
	const fetchingRef = useRef(false);

	useEffect(() => {
		if (fetchingRef.current || authLoading) return;

		const fetchCourses = async () => {
			if (fetchingRef.current) return;
			fetchingRef.current = true;

			try {
				setLoading(true);
				setError(null);

				if (isAdmin) {
					const mapsData = await adminService.getCourseMaps({ per_page: 100, include_virtual: 1 });
					const list = mapsData?.data ?? (Array.isArray(mapsData) ? mapsData : []);
					setCourseMaps(Array.isArray(list) ? list : []);
				} else {
					const [mapsData, profileData, dashboardData] = await Promise.all([
						courseMapsService.getMaps(),
						profileService.getProfile().catch((profileErr) => {
							console.error('Error fetching profile courses:', profileErr);
							return null;
						}),
						dashboardService.getStudentDashboard().catch((dashErr) => {
							console.error('Error fetching resume lesson:', dashErr);
							return null;
						}),
					]);
					setNextLesson(dashboardData?.next_lesson || null);

					const rows = Array.isArray(mapsData) ? mapsData : [];
					setCourseMaps(rows.filter(isStudentVisibleMap));

					if (profileData) {
						setAssignedCourses({
							all: profileData.coursesAssigned || profileData.courses_assigned || [],
							in_progress: profileData.coursesInProgress || profileData.courses_in_progress || [],
							not_accessed: profileData.coursesNotAccessed || profileData.courses_not_accessed || [],
							completed: profileData.coursesCompleted || profileData.courses_completed || [],
						});
					}

					try {
						const courseRows = await coursesService.listStandalone();
						setStandaloneCourses(Array.isArray(courseRows) ? courseRows : []);
					} catch (courseErr) {
						console.error('Error fetching standalone courses:', courseErr);
						setStandaloneCourses([]);
					}
				}

			} catch (err) {
				console.error('Error fetching courses:', err);
				setError('Nu s-au putut încărca mapele.');
			} finally {
				setLoading(false);
				fetchingRef.current = false;
			}
		};

		fetchCourses();
	}, [authLoading, isAdmin]);

	const filteredCourseMaps = useMemo(() => {
		let rows = Array.isArray(courseMaps) ? [...courseMaps] : [];
		if (isStudent) {
			rows = rows.filter(isStudentVisibleMap);
		}
		if (searchQuery.trim()) {
			const needle = searchQuery.trim().toLowerCase();
			rows = rows.filter((map) =>
				String(map?.name || '').toLowerCase().includes(needle) ||
				String(map?.description || '').toLowerCase().includes(needle)
			);
		}
		return rows;
	}, [courseMaps, isStudent, searchQuery]);

	const filteredStandaloneCourses = useMemo(() => {
		let rows = (Array.isArray(standaloneCourses) ? standaloneCourses : []).filter(
			(course) => !courseIsCompleted(course)
		);
		if (searchQuery.trim()) {
			const needle = searchQuery.trim().toLowerCase();
			rows = rows.filter((course) =>
				String(course?.title || '').toLowerCase().includes(needle) ||
				String(course?.short_description || '').toLowerCase().includes(needle) ||
				String(course?.description || '').toLowerCase().includes(needle)
			);
		}
		return rows;
	}, [standaloneCourses, searchQuery]);

	const completedCourseRows = useMemo(() => {
		const rows = [];
		const seen = new Set();
		const push = (course) => {
			const id = Number(course?.id);
			if (!Number.isFinite(id) || seen.has(id) || !courseIsCompleted(course)) return;
			seen.add(id);
			rows.push({ ...course, status: 'completed' });
		};
		(assignedCourses.completed || []).forEach(push);
		(Array.isArray(standaloneCourses) ? standaloneCourses : []).forEach(push);
		return rows;
	}, [assignedCourses.completed, standaloneCourses]);

	const filteredAssignedCourses = useMemo(() => {
		if (studentFilter !== 'completed' && studentFilter !== 'unfinished') return [];
		const source = studentFilter === 'completed'
			? completedCourseRows
			: [...(assignedCourses.in_progress || []), ...(assignedCourses.not_accessed || [])].filter(
				(course) => !courseIsCompleted(course)
			);
		const seen = new Set();
		let rows = [];
		(Array.isArray(source) ? source : []).forEach((course) => {
			if (!course?.id || seen.has(course.id)) return;
			seen.add(course.id);
			rows.push(course);
		});
		if (searchQuery.trim()) {
			const needle = searchQuery.trim().toLowerCase();
			rows = rows.filter((course) =>
				String(course?.title || '').toLowerCase().includes(needle) ||
				String(course?.description || '').toLowerCase().includes(needle) ||
				String(course?.short_description || '').toLowerCase().includes(needle)
			);
		}
		return rows;
	}, [assignedCourses, completedCourseRows, studentFilter, searchQuery]);

	const getStudentFilterCount = (filter) => {
		if (filter.id === 'maps') {
			const mapCount = (Array.isArray(courseMaps) ? courseMaps.filter(isStudentVisibleMap) : []).length;
			const standaloneCount = (Array.isArray(standaloneCourses) ? standaloneCourses : []).filter(
				(course) => !courseIsCompleted(course)
			).length;
			return mapCount + standaloneCount;
		}
		if (filter.id === 'unfinished') {
			const seen = new Set();
			return [...(assignedCourses.in_progress || []), ...(assignedCourses.not_accessed || [])].filter((course) => {
				const id = Number(course?.id);
				if (!Number.isFinite(id) || seen.has(id) || courseIsCompleted(course)) return false;
				seen.add(id);
				return true;
			}).length;
		}
		if (filter.id === 'completed') return completedCourseRows.length;
		return null;
	};

	const renderAssignedCourseCard = (course, index) => {
		const status = course.status || studentFilter;
		const accentColor = COURSE_MAP_ACCENT_COLORS[(index + 2) % COURSE_MAP_ACCENT_COLORS.length];
		const coverSrc = courseCoverSrc(course);
		const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
		const progress = course.progress_percentage ?? course.progress ?? 0;
		const subtitleParts = [];
		if (course.short_description?.trim()) subtitleParts.push(String(course.short_description).trim());
		if (status === 'completed' || Number(progress) >= 100) subtitleParts.push('Finalizat');
		else if (status === 'in_progress') subtitleParts.push(`Progres ${courseProgressLabel(progress)}`);
		else subtitleParts.push('Neaccesat');
		const subtitle = subtitleParts.join(' · ');
		const ctaLabel = status === 'not_accessed'
			? 'Începe cursul'
			: status === 'completed'
				? 'Vezi cursul'
				: 'Continuă cursul';

		return (
			<article key={`assigned-course-${course.id}`} className="course-map-showcase-tile">
				<CourseShowcaseCard
					className="courses-page-map-tile-showcase"
					imageUrl={imageUrl}
					title={course.title || 'Curs'}
					subtitle={subtitle}
					progress={status === 'in_progress' ? progress : status === 'completed' ? 100 : 0}
					themeHsl={hexToHslSpace(accentColor)}
					onOpen={() => navigate(`/courses/${course.id}`)}
					ctaLabel={ctaLabel}
				/>
			</article>
		);
	};

	if (loading || authLoading) {
		return (
			<div className="courses-page-modern">
				<div className="courses-page-loading">
					<div className="courses-page-spinner" />
					<p>Se încarcă cursurile...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="courses-page-modern">
				<div className="courses-page-error">
					<div className="courses-page-error-icon">
						<WarningCircle size={28} weight="duotone" aria-hidden />
					</div>
					<h2>Eroare</h2>
					<p>{error}</p>
					<button
						className="courses-page-btn lms-btn-primary courses-page-btn-primary"
						onClick={() => window.location.reload()}
					>
						Incearca din nou
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={`courses-page-modern ${!isAdmin ? 'courses-page-student' : ''}`}>
			<div className={!isAdmin ? 'courses-page-student-main' : undefined}>
				{!isAdmin && nextLesson ? (
					<div className="courses-page-resume-wrap">
						<ResumeLearningWidget variant="banner" nextLesson={nextLesson} />
					</div>
				) : null}
				<div className="courses-page-hero">
					<div className={`courses-page-hero-content${!isAdmin ? ' courses-page-hero-content--student' : ''}`}>
						<div className="courses-page-hero-text">
							<h1 className="courses-page-hero-title">{isAdmin ? 'Mape cursuri' : STUDENT_FILTER_TITLES[studentFilter]}</h1>
							{!isAdmin ? (
								<div className="courses-page-student-filters" role="group" aria-label="Filtrare mape și cursuri">
									{STUDENT_COURSE_FILTERS.map((filter) => {
										const count = getStudentFilterCount(filter);
										const active = studentFilter === filter.id;
										return (
											<button
												key={filter.id}
												type="button"
												aria-pressed={active}
												className={`courses-page-student-filter${active ? ' is-active' : ''}`}
												onClick={() => setStudentFilter(filter.id)}
											>
												{count != null ? (
													<span className="courses-page-student-filter-count">{count}</span>
												) : null}
												<span className="courses-page-student-filter-label">{filter.label}</span>
											</button>
										);
									})}
								</div>
							) : null}
						</div>
						<div className="courses-page-search-wrapper courses-page-hero-search">
							<MagnifyingGlass className="courses-page-search-icon" size={20} weight="bold" aria-hidden />
							<input
								type="text"
								className="courses-page-search-input"
								aria-label={
									studentFilter === 'completed'
										? 'Caută cursuri finalizate'
										: studentFilter === 'unfinished'
											? 'Caută cursuri nepromovate'
											: 'Caută mape'
								}
								placeholder={
									!isAdmin && studentFilter === 'completed'
										? 'Caută un curs finalizat...'
										: !isAdmin && studentFilter === 'unfinished'
											? 'Caută un curs nepromovat...'
											: 'Caută după titlu sau descriere...'
								}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
							{searchQuery && (
								<button
									type="button"
									className="courses-page-search-clear"
									onClick={() => setSearchQuery('')}
									aria-label="Șterge căutarea"
								>
									<X size={16} weight="bold" aria-hidden />
								</button>
							)}
						</div>
						{isAdmin && (
							<div className="courses-page-admin-hero-actions">
								<button
									className="courses-page-create-btn courses-page-create-btn-secondary"
									onClick={() => navigate('/admin/content?tab=course-maps')}
								>
									<span>Administrare mape</span>
								</button>
								<button
									className="courses-page-create-btn"
									onClick={() => navigate('/admin/courses/new')}
								>
									<Plus size={20} weight="bold" aria-hidden />
									<span>Creeaza Curs Nou</span>
								</button>
							</div>
						)}
					</div>
				</div>

				<div className="courses-page-content">
					{!isAdmin ? (
						<>
							{(assignedCourses.all || []).length === 0
								&& !nextLesson
								&& standaloneCourses.length === 0
								&& (Array.isArray(courseMaps) ? courseMaps : []).length === 0 ? (
								<section className="courses-page-empty-assigned" aria-label="Cursuri atribuite">
									<h2 className="courses-page-empty-title">Nu ai încă un curs atribuit</h2>
									<p className="courses-page-empty-text">
										Când un administrator îți alocă un curs, îl vei găsi aici și vei putea continua lecția din acest ecran.
										Dacă ai nevoie de acces, contactează administratorul academiei.
									</p>
								</section>
							) : null}
						</>
					) : null}
					{!isAdmin && (studentFilter === 'completed' || studentFilter === 'unfinished') ? (
						<section className="courses-page-filtered-section" aria-label={STUDENT_FILTER_TITLES[studentFilter]}>
							<div className="courses-page-filtered-header">
								<h2 className="courses-page-filtered-title">{STUDENT_FILTER_TITLES[studentFilter]}</h2>
								<span className="courses-page-filtered-count">{filteredAssignedCourses.length}</span>
							</div>
							<div className="courses-page-maps-grid">
								{filteredAssignedCourses.map(renderAssignedCourseCard)}
								{filteredAssignedCourses.length === 0 ? (
									<div className="courses-page-empty">
										<div className="courses-page-empty-icon">
											<Books size={64} weight="duotone" aria-hidden />
										</div>
										<h3 className="courses-page-empty-title">
											{searchQuery ? 'Nu am găsit cursuri' : 'Niciun curs în această categorie'}
										</h3>
										<p className="courses-page-empty-text">
											{searchQuery
												? 'Incearca un alt termen de cautare.'
												: studentFilter === 'unfinished'
													? 'Cursurile începute sau încă neaccesate vor apărea aici.'
													: 'Cursurile pe care le finalizezi vor apărea aici.'}
										</p>
										{searchQuery ? (
											<button
												className="courses-page-btn courses-page-btn-secondary"
												onClick={() => setSearchQuery('')}
											>
												Goleste cautarea
											</button>
										) : null}
									</div>
								) : null}
							</div>
						</section>
					) : null}

					{(isAdmin || studentFilter === 'maps') ? (
						<section className="courses-page-filtered-section" aria-label={isAdmin ? 'Mape cursuri' : 'Mape'}>
							{!isAdmin ? (
								<div className="courses-page-filtered-header">
									<h2 className="courses-page-filtered-title">Mape</h2>
									<span className="courses-page-filtered-count">{filteredCourseMaps.length + filteredStandaloneCourses.length}</span>
								</div>
							) : null}
							<div className="courses-page-maps-grid">
							{filteredCourseMaps.map((map, index) => {
								const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
								const subtitle = map.description?.trim() ? String(map.description).trim() : null;

								return (
									<article key={map.id} className="course-map-showcase-tile">
										<CourseMapFolderTile
											className="courses-page-map-tile-showcase"
											title={map.name || 'Mapa'}
											subtitle={subtitle}
											count={map.courses_count ?? 0}
											color={accentColor}
											imageUrl={mapFolderCardImageUrl(map)}
											coverFocus={map.cover_focus}
											progress={map.progress_percentage ?? map.progress ?? 0}
											onOpen={() => navigate(`/courses/map/${map.id}`)}
											ctaLabel="Deschide mapa"
										/>
									</article>
								);
							})}

							{!isAdmin
								? filteredStandaloneCourses.map((course, index) => {
										const accentColor = COURSE_MAP_ACCENT_COLORS[(index + 1) % COURSE_MAP_ACCENT_COLORS.length];
										const coverSrc = courseCoverSrc(course);
										const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
										const subtitleParts = [];
										if (course.short_description?.trim()) subtitleParts.push(String(course.short_description).trim());
										if (course.estimated_duration_minutes) subtitleParts.push(`${course.estimated_duration_minutes} min`);
										const subtitle = subtitleParts.join(' · ') || 'Curs direct';
										return (
											<article key={`standalone-course-${course.id}`} className="course-map-showcase-tile">
												<CourseShowcaseCard
													className="courses-page-map-tile-showcase"
													imageUrl={imageUrl}
													title={course.title || 'Curs'}
													subtitle={subtitle}
													progress={course.progress_percentage ?? 0}
													themeHsl={hexToHslSpace(accentColor)}
													onOpen={() => navigate(`/courses/${course.id}`)}
													ctaLabel="Deschide cursul"
												/>
											</article>
										);
									})
								: null}

							{filteredCourseMaps.length === 0 && (isAdmin || filteredStandaloneCourses.length === 0) ? (
								<div className="courses-page-empty">
									<div className="courses-page-empty-icon">
										<Books size={64} weight="duotone" aria-hidden />
									</div>
									<h3 className="courses-page-empty-title">
										{searchQuery ? 'Nu am găsit mape' : 'Nu există mape disponibile'}
									</h3>
									<p className="courses-page-empty-text">
										{searchQuery
											? 'Incearca un alt termen de cautare.'
											: 'Cursurile atribuite apar în mape; cele care nu sunt în nicio mapă apar direct aici.'}
									</p>
									{searchQuery ? (
										<button
											className="courses-page-btn courses-page-btn-secondary"
											onClick={() => setSearchQuery('')}
										>
											Goleste cautarea
										</button>
									) : (
										isAdmin && (
											<button
												className="courses-page-btn lms-btn-primary courses-page-btn-primary"
												onClick={() => navigate('/admin/content?tab=course-maps')}
											>
												<Plus size={20} weight="bold" aria-hidden />
												<span>Creeaza prima mapa</span>
											</button>
										)
									)}
								</div>
							) : null}
						</div>
						</section>
					) : null}

				</div>
			</div>
		</div>
	);
};

export default CoursesPage;
