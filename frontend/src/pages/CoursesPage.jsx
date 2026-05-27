import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Books, MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react';
import { courseMapsService, adminService, examService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CourseShowcaseCard, COURSE_SHOWCASE_FALLBACK_IMAGE } from '../components/ui/course-showcase-card';
import CourseMapFolderTile from '../components/ui/CourseMapFolderTile';
import { mapFolderCardImageUrl } from '../utils/imageUrl';
import { hexToHslSpace } from '../lib/hexToHsl';
import { isStudentVisibleMap } from '../utils/courseMapVisibility';
import './CoursesPage.css';

const COURSE_MAP_ACCENT_COLORS = [
	'#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e', '#0ea5e9',
];

const CoursesPage = () => {
	const navigate = useNavigate();
	const { user, loading: authLoading } = useAuth();
	const isAdmin = user?.role === 'admin' || user?.role === 'instructor';
	const isStudent = !isAdmin;

	const [courseMaps, setCourseMaps] = useState([]);
	const [standaloneExams, setStandaloneExams] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [studentTab, setStudentTab] = useState('courses');
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
					const mapsData = await courseMapsService.getMaps();
					const rows = Array.isArray(mapsData) ? mapsData : [];
					setCourseMaps(rows.filter(isStudentVisibleMap));
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
							{!isAdmin ? (
								<div className="courses-page-student-tabs" role="tablist" aria-label="Tip conținut">
									<button
										type="button"
										role="tab"
										aria-selected={studentTab === 'courses'}
										className={`courses-page-student-tab ${studentTab === 'courses' ? 'is-active' : ''}`}
										onClick={() => setStudentTab('courses')}
									>
										Cursuri
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={studentTab === 'exams'}
										className={`courses-page-student-tab ${studentTab === 'exams' ? 'is-active' : ''}`}
										onClick={() => setStudentTab('exams')}
									>
										Examene
									</button>
								</div>
							) : null}
						</div>
						<div className="courses-page-search-wrapper courses-page-hero-search">
							<MagnifyingGlass className="courses-page-search-icon" size={20} weight="bold" aria-hidden />
							<input
								type="text"
								className="courses-page-search-input"
								placeholder={
									!isAdmin && studentTab === 'exams'
										? 'Cauta examene...'
										: 'Cauta cursuri...'
								}
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
					{(isAdmin || studentTab === 'courses') ? (
						<div className="courses-page-maps-grid">
							{filteredCourseMaps.map((map, index) => {
								const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
								const courseCount = map.courses_count ?? 0;
								const descriptionLine = map.description?.trim() ? String(map.description).trim() : null;
								const subtitleParts = [];
								if (descriptionLine) subtitleParts.push(descriptionLine);
								subtitleParts.push(`${courseCount} ${courseCount === 1 ? 'curs' : 'cursuri'}`);
								const subtitle = subtitleParts.join(' - ');

								return (
									<article key={map.id} className="course-map-showcase-tile">
										<CourseMapFolderTile
											className="courses-page-map-tile-showcase"
											title={map.name || 'Mapa'}
											subtitle={subtitle}
											count={courseCount}
											color={accentColor}
											imageUrl={mapFolderCardImageUrl(map)}
											progress={map.progress_percentage ?? map.progress ?? null}
											onOpen={() => navigate(`/courses/map/${map.id}`)}
											ctaLabel="Deschide mapa"
										/>
									</article>
								);
							})}

							{filteredCourseMaps.length === 0 ? (
								<div className="courses-page-empty">
									<div className="courses-page-empty-icon">
										<Books size={64} weight="duotone" aria-hidden />
									</div>
									<h3 className="courses-page-empty-title">
										{searchQuery ? 'Nu am gasit mape' : 'Nu exista mape disponibile'}
									</h3>
									<p className="courses-page-empty-text">
										{searchQuery
											? 'Incearca un alt termen de cautare.'
											: 'Cursurile sunt afisate in interiorul mapelor.'}
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

					{!isAdmin && studentTab === 'exams' ? (
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
							{filteredStandaloneExams.length === 0 ? (
								<div className="courses-page-empty">
									<h3 className="courses-page-empty-title">
										{searchQuery ? 'Nu am gasit examene' : 'Nu exista examene disponibile'}
									</h3>
									<p className="courses-page-empty-text">
										{searchQuery ? 'Incearca un alt termen de cautare.' : 'Examenele independente vor apărea aici.'}
									</p>
								</div>
							) : null}
						</section>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default CoursesPage;
