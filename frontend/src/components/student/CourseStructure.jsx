import React, { useState } from 'react';
import { filterPublishedCourseTests } from '../../utils/testVisibility';
import { useNavigate } from 'react-router-dom';
import { buildCourseModuleList } from '../../utils/courseModuleDisplay';

const CourseStructure = ({ course, progress, onLessonClick, onExamClick }) => {
	const navigate = useNavigate();
	const [expandedModules, setExpandedModules] = useState({});
	const renderableModules = buildCourseModuleList(course);

	const toggleModule = (moduleId) => {
		setExpandedModules(prev => ({
			...prev,
			[moduleId]: !prev[moduleId]
		}));
	};

	// Initialize: expand first module by default
	React.useEffect(() => {
		if (renderableModules.length > 0 && Object.keys(expandedModules).length === 0) {
			setExpandedModules({ [renderableModules[0].id]: true });
		}
	}, [renderableModules, expandedModules]);

	if (!course) return null;

	const getModuleProgress = (moduleId) => {
		const module = progress?.modules?.find(m => m.id === moduleId);
		return module?.progress || 0;
	};

	const getLessonStatus = (lesson) => {
		const lessonProgress = progress?.modules
			?.flatMap(m => m.lessons || [])
			?.find(l => l.id === lesson.id);

		if (lessonProgress?.completed) {
			return { status: 'completed', icon: '✓', color: '#10b981' };
		}
		if (lessonProgress?.unlocked || lesson.is_preview) {
			return { status: 'in_progress', icon: '▶', color: '#ffd700' };
		}
		return { status: 'locked', icon: '🔒', color: '#6b7280' };
	};

	const getExamStatus = (exam) => {
		const examProgress = progress?.modules
			?.flatMap(m => m.exams || [])
			?.find(e => e.id === exam.id);

		if (examProgress?.passed) {
			return { status: 'passed', icon: '✓', color: '#10b981' };
		}
		if (examProgress?.unlocked) {
			return { status: 'available', icon: '📝', color: '#ffd700' };
		}
		return { status: 'locked', icon: '🔒', color: '#6b7280' };
	};

	return (
		<div className="student-course-structure">
			<h2 className="student-course-structure-title">Structura cursului</h2>
			
			<div className="student-course-structure-modules">
				{renderableModules.map((module, moduleIndex) => {
					const moduleProgress = getModuleProgress(module.id);
					const isExpanded = expandedModules[module.id];
					const moduleLessons = module.lessons || [];
					const moduleExams = filterPublishedCourseTests(module.exams || []);

					if (module.hideGroupHeader) {
						return (
							<div key={module.id} className="student-course-structure-root-lessons">
								{moduleLessons.length > 0 && (
									<div className="student-course-structure-lessons">
										{moduleLessons.map((lesson) => {
											const lessonStatus = getLessonStatus(lesson);
											const isClickable = lessonStatus.status !== 'locked' || lesson.is_preview;

											return (
												<div
													key={lesson.id}
													className={`student-course-structure-lesson ${lessonStatus.status} ${isClickable ? 'clickable' : ''}`}
													onClick={() => {
														if (isClickable && onLessonClick) {
															onLessonClick(lesson);
														}
													}}
												>
													<div className="student-course-structure-lesson-icon">
														{lesson.type === 'video' ? '🎥' :
														 lesson.type === 'text' ? '📄' :
														 lesson.type === 'live' ? '🔴' : '📚'}
													</div>
													<div className="student-course-structure-lesson-content">
														<div className="student-course-structure-lesson-title">
															{lesson.title}
															{lesson.is_preview && (
																<span className="student-course-structure-lesson-preview">Previzualizare</span>
															)}
														</div>
														{lesson.duration_minutes && (
															<div className="student-course-structure-lesson-duration">
																⏱️ {lesson.duration_minutes} min
															</div>
														)}
													</div>
													<div
														className="student-course-structure-lesson-status"
														style={{ color: lessonStatus.color }}
													>
														{lessonStatus.icon}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					}

					return (
						<div key={module.id} className="student-course-structure-module">
							<div 
								className="student-course-structure-module-header"
								onClick={() => toggleModule(module.id)}
							>
								<div className="student-course-structure-module-info">
									<div className="student-course-structure-module-number">
										{moduleIndex + 1}
									</div>
									<div className="student-course-structure-module-content">
										<div className="student-course-structure-module-title">
											{module.title}
										</div>
										<div className="student-course-structure-module-meta">
											<span className="student-course-structure-module-progress">
												{Math.round(moduleProgress)}% completat
											</span>
											{module.estimated_duration_minutes && (
												<span className="student-course-structure-module-duration">
													⏱️ {module.estimated_duration_minutes} min
												</span>
											)}
										</div>
									</div>
								</div>
								<div className="student-course-structure-module-actions">
									<div className="student-course-structure-module-progress-bar">
										<div 
											className="student-course-structure-module-progress-fill"
											style={{ width: `${moduleProgress}%` }}
										></div>
									</div>
									<button 
										className="student-course-structure-module-toggle"
										aria-expanded={isExpanded}
									>
										{isExpanded ? '▼' : '▶'}
									</button>
								</div>
							</div>

							{isExpanded && (
								<div className="student-course-structure-module-content-expanded">
									{/* Lessons */}
									{moduleLessons.length > 0 && (
										<div className="student-course-structure-lessons">
											{moduleLessons.map((lesson, lessonIndex) => {
												const lessonStatus = getLessonStatus(lesson);
												const isClickable = lessonStatus.status !== 'locked' || lesson.is_preview;

												return (
													<div
														key={lesson.id}
														className={`student-course-structure-lesson ${lessonStatus.status} ${isClickable ? 'clickable' : ''}`}
														onClick={() => {
															if (isClickable && onLessonClick) {
																onLessonClick(lesson);
															}
														}}
													>
														<div className="student-course-structure-lesson-icon">
															{lesson.type === 'video' ? '🎥' : 
															 lesson.type === 'text' ? '📄' : 
															 lesson.type === 'live' ? '🔴' : '📚'}
														</div>
														<div className="student-course-structure-lesson-content">
															<div className="student-course-structure-lesson-title">
																{lesson.title}
																{lesson.is_preview && (
																	<span className="student-course-structure-lesson-preview">Previzualizare</span>
																)}
															</div>
															{lesson.duration_minutes && (
																<div className="student-course-structure-lesson-duration">
																	⏱️ {lesson.duration_minutes} min
																</div>
															)}
														</div>
														<div 
															className="student-course-structure-lesson-status"
															style={{ color: lessonStatus.color }}
														>
															{lessonStatus.icon}
														</div>
													</div>
												);
											})}
										</div>
									)}

									{/* Exams */}
									{moduleExams.length > 0 && (
										<div className="student-course-structure-exams">
											{moduleExams.map((exam) => {
												const examStatus = getExamStatus(exam);
												const isClickable = examStatus.status !== 'locked';

												return (
													<div
														key={exam.id}
														className={`student-course-structure-exam ${examStatus.status} ${isClickable ? 'clickable' : ''}`}
														onClick={() => {
															if (isClickable && onExamClick) {
																onExamClick(exam);
															}
														}}
													>
														<div className="student-course-structure-exam-icon">📝</div>
														<div className="student-course-structure-exam-content">
															<div className="student-course-structure-exam-title">
																{exam.title}
																{exam.is_required && (
																	<span className="student-course-structure-exam-required">Obligatoriu</span>
																)}
															</div>
															{exam.passing_score && (
																<div className="student-course-structure-exam-meta">
																	✅ {exam.passing_score}% trecere
																</div>
															)}
														</div>
														<div 
															className="student-course-structure-exam-status"
															style={{ color: examStatus.color }}
														>
															{examStatus.icon}
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default CourseStructure;
