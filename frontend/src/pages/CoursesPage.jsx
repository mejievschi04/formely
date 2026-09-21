import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Books, MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { courseMapsService, adminService, examService, coursesService, profileService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CourseShowcaseCard, COURSE_SHOWCASE_FALLBACK_IMAGE } from '../components/ui/course-showcase-card';
import CourseMapFolderTile from '../components/ui/CourseMapFolderTile';
import { courseCoverSrc, mapFolderCardImageUrl } from '../utils/imageUrl';
import { hexToHslSpace } from '../lib/hexToHsl';
import { isStudentVisibleMap } from '../utils/courseMapVisibility';
import './CoursesPage.css';

const COURSE_MAP_ACCENT_COLORS = [
	'#0891b2', '#22d3ee', '#0e7490', '#155e75', '#38bdf8', '#0284c7', '#67e8f9', '#0f172a', '#64748b',
];

const STUDENT_COURSE_FILTERS = [
	{ id: 'assigned', label: 'Atribuite' },
	{ id: 'in_progress', label: 'Nefinalizate', statKey: 'in_progress' },
];

const STUDENT_FILTER_TITLES = {
	assigned: 'Cursuri atribuite',
	in_progress: 'Cursuri nefinalizate',
};

const CoursesPage = () => {
	const navigate = useNavigate();
	const { user, loading: authLoading } = useAuth();
	const isAdmin = user?.role === 'admin' || user?.role === 'instructor';
	const isStudent = !isAdmin;

	const [courseMaps, setCourseMaps] = useState([]);
	const [standaloneCourses, setStandaloneCourses] = useState([]);
	const [standaloneExams, setStandaloneExams] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [studentFilter, setStudentFilter] = useState('assigned');
	const [assignedCourseStats, setAssignedCourseStats] = useState(null);
	const [assignedCourses, setAssignedCourses] = useState({
		all: [],
		in_progress: [],
		not_accessed: [],
		completed: [],
	});
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
					const [mapsData, profileData] = await Promise.all([
						courseMapsService.getMaps(),
						profileService.getProfile().catch((profileErr) => {
							console.error('Error fetching profile courses:', profileErr);
							return null;
						}),
					]);

					const rows = Array.isArray(mapsData) ? mapsData : [];
					setCourseMaps(rows.filter(isStudentVisibleMap));

					if (profileData) {
						setAssignedCourseStats(profileData.courseStats || profileData.course_stats || null);
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

				try {
					const examRows = await examService.listStandaloneExams();
					setStandaloneExams(Array.isArray(examRows) ? examRows : []);
				} catch (examErr) {
					console.error('Error fetching standalone exams:', examErr);
					setStandaloneExams([]);
				}
			} catch (err) {
				console.error('Error fetching courses:', err);
				setError('Nu s-au putut incarca mapele.');
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
		let rows = Array.isArray(standaloneCourses) ? [...standaloneCourses] : [];
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

	const filteredStandaloneExams = useMemo(() => {
		let rows = Array.isArray(standaloneExams) ? [...standaloneExams] : [];
		if (searchQuery.trim()) {
			const needle = searchQuery.trim().toLowerCase();
			rows = rows.filter((ex) =>
				String(ex?.title || '').toLowerCase().includes(needle) ||
				String(ex?.description || '').toLowerCase().includes(needle)
			);
		}
		return rows;
	}, [standaloneExams, searchQuery]);

	const filteredAssignedCourses = useMemo(() => {
		if (studentFilter === 'assigned') return [];
		let rows = Array.isArray(assignedCourses[studentFilter]) ? [...assignedCourses[studentFilter]] : [];
		if (searchQuery.trim()) {
			const needle = searchQuery.trim().toLowerCase();
			rows = rows.filter((course) =>
				String(course?.title || '').toLowerCase().includes(needle) ||
				String(course?.description || '').toLowerCase().includes(needle) ||
				String(course?.short_description || '').toLowerCase().includes(needle)
			);
		}
		return rows;
	}, [assignedCourses, studentFilter, searchQuery]);

	const getStudentFilterCount = (filter) => {
		if (filter.id === 'assigned') {
			const mapCount = (Array.isArray(courseMaps) ? courseMaps.filter(isStudentVisibleMap) : []).length;
			const standaloneCount = Array.isArray(standaloneCourses) ? standaloneCourses.length : 0;
			const examCount = Array.isArray(standaloneExams) ? standaloneExams.length : 0;
			return mapCount + standaloneCount + examCount;
		}
		if (!filter.statKey || !assignedCourseStats) return null;
		return assignedCourseStats[filter.statKey] ?? 0;
	};

	const renderAssignedCourseCard = (course, index) => {
		const status = course.status || studentFilter;
		const accentColor = COURSE_MAP_ACCENT_COLORS[(index + 2) % COURSE_MAP_ACCENT_COLORS.length];
		const coverSrc = courseCoverSrc(course);
		const imageUrl = coverSrc || COURSE_SHOWCASE_FALLBACK_IMAGE;
		const progress = course.progress_percentage ?? course.progress ?? 0;
		const subtitleParts = [];
		if (course.short_description?.trim()) subtitleParts.push(String(course.short_description).trim());
		if (status === 'completed') subtitleParts.push('Finalizat');
		else if (status === 'in_progress') subtitleParts.push(`Progres ${progress}%`);
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
					<p>Se incarca cursurile...</p>
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
						className="courses-page-btn courses-page-btn-primary"
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
				<div className="courses-page-hero">
					<div className={`courses-page-hero-content${!isAdmin ? ' courses-page-hero-content--student' : ''}`}>
						<div className="courses-page-hero-text">
							<h1 className="courses-page-hero-title">{isAdmin ? 'Mape cursuri' : 'Cursuri'}</h1>
						</div>
						{!isAdmin ? (
							<div className="courses-page-student-filters" role="tablist" aria-label="Filtrare cursuri">
								{STUDENT_COURSE_FILTERS.map((filter) => {
									const count = getStudentFilterCount(filter);
									return (
										<button
											key={filter.id}
											type="button"
											role="tab"
											aria-selected={studentFilter === filter.id}
											className={`courses-page-student-filter${studentFilter === filter.id ? ' is-active' : ''}`}
											onClick={() => setStudentFilter(filter.id)}
										>
											<span className="courses-page-student-filter-label">{filter.label}</span>
											{count != null ? (
												<span className="courses-page-student-filter-count">{count}</span>
											) : null}
										</button>
									);
								})}
							</div>
						) : null}
						<div className="courses-page-search-wrapper courses-page-hero-search">
							<MagnifyingGlass className="courses-page-search-icon" size={20} weight="bold" aria-hidden />
							<input
								type="text"
								className="courses-page-search-input"
								placeholder="Cauta cursuri..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
							{searchQuery && (
								<button
									type="button"
									className="courses-page-search-clear"
									onClick={() => setSearchQuery('')}
									aria-label="Goleste cautarea"
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
					{!isAdmin && studentFilter === 'in_progress' ? (
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
											{searchQuery ? 'Nu am gasit cursuri' : 'Niciun curs in aceasta categorie'}
										</h3>
										<p className="courses-page-empty-text">
											{searchQuery
												? 'Incearca un alt termen de cautare.'
												: 'Cursurile atribuite de administrator vor aparea aici.'}
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

					{(isAdmin || studentFilter === 'assigned') ? (
						<div className="courses-page-maps-grid">
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

							{filteredCourseMaps.map((map, index) => {
								const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
								const courseCount = map.courses_count ?? 0;
								const descriptionLine = map.description?.trim() ? String(map.description).trim() : null;
								const subtitle = descriptionLine || '';

								return (
									<article key={map.id} className="course-map-showcase-tile">
										<CourseMapFolderTile
											className="courses-page-map-tile-showcase"
											title={map.name || 'Mapa'}
											subtitle={subtitle}
											count={courseCount}
											color={accentColor}
											imageUrl={mapFolderCardImageUrl(map)}
											coverFocus={map.cover_focus}
											progress={isAdmin ? null : (map.progress_percentage ?? map.progress ?? null)}
											onOpen={() => navigate(`/courses/map/${map.id}`)}
											ctaLabel="Deschide mapa"
										/>
									</article>
								);
							})}

							{filteredCourseMaps.length === 0 && (isAdmin || (filteredStandaloneCourses.length === 0 && filteredStandaloneExams.length === 0)) ? (
								<div className="courses-page-empty">
									<div className="courses-page-empty-icon">
										<Books size={64} weight="duotone" aria-hidden />
									</div>
									<h3 className="courses-page-empty-title">
										{searchQuery
											? (isAdmin ? 'Nu am gasit mape' : 'Nu am gasit rezultate')
											: (isAdmin ? 'Nu exista mape disponibile' : 'Nu exista cursuri atribuite')}
									</h3>
									<p className="courses-page-empty-text">
										{searchQuery
											? 'Incearca un alt termen de cautare.'
											: 'Cursurile sunt afisate in mape sau direct in catalog, daca sunt publicate fara mapa.'}
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
												className="courses-page-btn courses-page-btn-primary"
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
					) : null}

					{!isAdmin && studentFilter === 'assigned' && filteredStandaloneExams.length > 0 ? (
						<section className="courses-page-exams-section" aria-label="Examene independente">
							<div className="courses-page-exams-grid courses-page-maps-grid">
								{filteredStandaloneExams.map((ex, index) => {
									const accentColor = COURSE_MAP_ACCENT_COLORS[(index + 3) % COURSE_MAP_ACCENT_COLORS.length];
									const subtitleParts = [];
									if (ex.description?.trim()) subtitleParts.push(String(ex.description).trim());
									if (ex.passing_score != null) subtitleParts.push(`Prag ${ex.passing_score}%`);
									const subtitle = subtitleParts.join(' - ') || 'Examen independent';
									return (
										<article key={ex.id} className="course-map-showcase-tile">
											<CourseShowcaseCard
												className="courses-page-map-tile-showcase"
												imageUrl={COURSE_SHOWCASE_FALLBACK_IMAGE}
												title={ex.title || 'Examen'}
												subtitle={subtitle}
												themeHsl={hexToHslSpace(accentColor)}
												onOpen={() => navigate(`/exams/${ex.id}`)}
												ctaLabel="Deschide examenul"
											/>
										</article>
									);
								})}
							</div>
						</section>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default CoursesPage;
