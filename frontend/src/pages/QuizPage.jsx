import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { quizService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import StructuredQuestionRenderer from '../components/student/StructuredQuestionRenderer';
import { useTestAttemptTelemetry } from '../hooks/useTestAttemptTelemetry';

const QuizPage = () => {
	const { courseId } = useParams();
	const { user } = useAuth();
	const [quiz, setQuiz] = useState(null);
	const [answers, setAnswers] = useState({});
	const [submitted, setSubmitted] = useState(false);
	const [result, setResult] = useState(null);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
	const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
	const [timeRemaining, setTimeRemaining] = useState(null);
	const [startTime, setStartTime] = useState(null);
	const observerRef = useRef(null);
	const timerIntervalRef = useRef(null);
	const testTelemetry = useTestAttemptTelemetry({
		enabled: Boolean(user?.id),
		userId: user?.id,
		entityId: quiz?.id ?? courseId,
		courseId,
		modelType: 'exam',
	});
	const testTelemetryRef = useRef(testTelemetry);
	testTelemetryRef.current = testTelemetry;
	const reviewAnswers = useMemo(() => {
		if (!submitted || !result || !result.answers || typeof result.answers !== 'object') return null;
		return result.answers;
	}, [submitted, result]);
	const visibleAnswers = reviewAnswers || answers;

	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 1024);
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		const fetchQuiz = async () => {
			try {
				setLoading(true);
				const data = await quizService.getQuiz(courseId);
				setQuiz(data);
				
				if (data.hasResult && data.result) {
					setResult(data.result);
					setSubmitted(true);
					setSaved(true);
					setAnswers({});
					void testTelemetryRef.current.trackResultViewed(data.result);
				} else {
					testTelemetryRef.current.resetSession();
					void testTelemetryRef.current.trackStarted({
						question_count: data.questions?.length ?? 0,
						quiz_id: data.id ?? null,
					});
				}
				if (data.duration_minutes && !data.hasResult && !saved) {
					// Initialize timer if quiz has time limit
					setTimeRemaining(data.duration_minutes * 60); // Convert to seconds
					setStartTime(Date.now());
				}
			} catch (err) {
				console.error('Error fetching quiz:', err);
				setError('Testul nu a fost găsit');
			} finally {
				setLoading(false);
			}
		};
		fetchQuiz();
	}, [courseId]);

	useEffect(() => {
		if (!quiz || submitted || saved) return;
		testTelemetryRef.current.trackAnswerSaved(answers, quiz.questions?.length ?? 0);
	}, [quiz, submitted, saved, answers]);

	// Timer countdown
	useEffect(() => {
		if (!quiz?.duration_minutes || saved || submitted || !startTime) return;

		timerIntervalRef.current = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const remaining = (quiz.duration_minutes * 60) - elapsed;
			
			if (remaining <= 0) {
				setTimeRemaining(0);
				clearInterval(timerIntervalRef.current);
				// Auto-submit when time runs out
				handleSubmit();
			} else {
				setTimeRemaining(remaining);
			}
		}, 1000);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [quiz?.duration_minutes, saved, submitted, startTime]);

	// Track scroll position to update current question
	useEffect(() => {
		if (!quiz || !quiz.questions || saved) return;

		if (observerRef.current) {
			observerRef.current.disconnect();
		}

		const observerOptions = {
			root: null,
			rootMargin: '-20% 0px -60% 0px',
			threshold: 0
		};

		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const questionId = entry.target.id.replace('question-', '');
					const questionIndex = quiz.questions.findIndex(q => q.id === parseInt(questionId));
					if (questionIndex !== -1) {
						setCurrentQuestionIndex(questionIndex);
					}
				}
			});
		}, observerOptions);

		observerRef.current = observer;

		requestAnimationFrame(() => {
			quiz.questions.forEach(q => {
				const element = document.getElementById(`question-${q.id}`);
				if (element) observer.observe(element);
			});
		});

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
		};
	}, [quiz, saved]);

	const handleSubmit = useCallback(async () => {
		try {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
			const resultData = await quizService.submitQuiz(courseId, answers);
			setResult(resultData);
			if (Array.isArray(resultData.review_questions) && resultData.review_questions.length > 0) {
				setQuiz((prev) => (prev ? { ...prev, questions: resultData.review_questions } : prev));
			}
			setSubmitted(true);
			void testTelemetryRef.current.trackSubmitted(resultData);
		} catch (err) {
			console.error('Error submitting quiz:', err);
			setError('Eroare la trimiterea testului');
		}
	}, [courseId, answers]);

	const handleSave = useCallback(() => {
		setSaved(true);
	}, []);

	const handleAnswerChange = useCallback((questionId, answer) => {
		setAnswers(prev => ({
			...prev,
			[questionId]: answer
		}));
	}, []);

	const toggleFlag = useCallback((questionId) => {
		setFlaggedQuestions(prev => {
			const newSet = new Set(prev);
			if (newSet.has(questionId)) {
				newSet.delete(questionId);
			} else {
				newSet.add(questionId);
			}
			return newSet;
		});
	}, []);

	const scrollToQuestion = useCallback((index) => {
		if (!quiz || !quiz.questions || index < 0 || index >= quiz.questions.length) return;
		setCurrentQuestionIndex(index);
		const questionElement = document.getElementById(`question-${quiz.questions[index].id}`);
		if (questionElement) {
			questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [quiz]);

	// Format time remaining
	const formatTime = useCallback((seconds) => {
		if (!seconds) return '00:00';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}, []);

	// Calculate performance metrics
	const performanceMetrics = useMemo(() => {
		if (!result || !quiz) return null;

		const totalQuestions = quiz.questions.length;
		const correctAnswers = quiz.questions.filter((q) => isQuestionCorrect(q, visibleAnswers[q.id])).length;
		const incorrectAnswers = totalQuestions - correctAnswers;
		const percentage = result.percentage || 0;

		return {
			totalQuestions,
			correctAnswers,
			incorrectAnswers,
			percentage,
			passed: result.passed || false
		};
	}, [result, quiz, visibleAnswers]);

	// Get question status for sidebar
	const getQuestionStatus = useCallback((questionId, index) => {
		if (saved || submitted) {
			const question = quiz.questions.find(q => q.id === questionId);
			const isCorrect = isQuestionCorrect(question, visibleAnswers[questionId]);
			return isCorrect ? 'completed' : 'incorrect';
		}
		const isAnswered = answers[questionId] !== undefined;
		const isCurrent = index === currentQuestionIndex;
		if (isCurrent) return 'current';
		if (isAnswered) return 'answered';
		return 'not-started';
	}, [answers, currentQuestionIndex, saved, submitted, quiz, visibleAnswers]);

	if (loading) {
		return (
			<div className="va-stack" style={{ padding: '2rem', textAlign: 'center' }}>
				<p className="va-muted">Se încarcă testul...</p>
			</div>
		);
	}

	if (error || !quiz) {
		return (
			<div className="va-stack" style={{ padding: '2rem' }}>
				<p style={{ color: 'var(--va-primary)' }}>{error || 'Testul nu a fost găsit'}</p>
				<Link to={`/courses/${courseId}`} className="lms-btn-secondary">
					Înapoi la curs
				</Link>
			</div>
		);
	}

	return (
		<div className="va-course-detail-layout">
			{/* Question Navigation Sidebar */}
			{quiz && quiz.questions && quiz.questions.length > 0 && !saved && (
				<aside className="va-course-sidebar">
					<div className="va-course-sidebar-header">
						<Link 
							to={`/courses/${courseId}`}
							className="va-course-sidebar-back"
						>
							← Înapoi
						</Link>
						<h2 className="va-course-sidebar-title">{quiz.title || 'Test Final'}</h2>
					</div>
					<div className="va-course-sidebar-content">
						<div className="va-course-sidebar-section">
							<h3 className="va-course-sidebar-section-title">
								<span>📝</span>
								<span>Întrebări</span>
							</h3>
							<div className="va-course-sidebar-modules">
								{quiz.questions.map((q, index) => {
									const status = getQuestionStatus(q.id, index);
									const isFlagged = flaggedQuestions.has(q.id);
									
									return (
										<button
											key={q.id}
											type="button"
											onClick={() => scrollToQuestion(index)}
											className={`va-course-sidebar-module ${status === 'completed' ? 'completed' : status === 'incorrect' ? 'failed' : ''} ${currentQuestionIndex === index ? 'active' : ''}`}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: '1rem',
												padding: '1rem',
												background: currentQuestionIndex === index
													? 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.15), rgba(var(--formely-white-rgb), 0.1))'
													: status === 'completed'
													? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(34, 197, 94, 0.05))'
													: status === 'incorrect'
													? 'linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,107,107,0.05))'
													: 'rgba(255,255,255,0.03)',
												backdropFilter: 'blur(10px)',
												border: currentQuestionIndex === index
													? '1px solid rgba(var(--formely-white-rgb), 0.4)'
													: status === 'completed'
													? '1px solid rgba(74, 222, 128, 0.3)'
													: status === 'incorrect'
													? '1px solid rgba(255,107,107,0.3)'
													: '1px solid rgba(var(--formely-white-rgb), 0.2)',
												borderRadius: '16px',
												cursor: 'pointer',
												transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
												boxShadow: currentQuestionIndex === index
													? '0 4px 16px rgba(var(--formely-white-rgb), 0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
													: '0 2px 8px rgba(0,0,0,0.2)',
												width: '100%',
												textAlign: 'left',
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.transform = 'translateX(4px)';
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.transform = 'translateX(0)';
											}}
										>
											<div className="va-course-sidebar-module-indicator" style={{
												width: '40px',
												height: '40px',
												borderRadius: '12px',
												background: currentQuestionIndex === index
													? 'linear-gradient(135deg, var(--formely-white), #ffcc00)'
													: status === 'completed'
													? 'linear-gradient(135deg, #4ade80, #22c55e)'
													: status === 'incorrect'
													? 'linear-gradient(135deg, #ff6b6b, #ff5252)'
													: 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.1))',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												fontSize: '1rem',
												fontWeight: 700,
												color: (currentQuestionIndex === index || status === 'completed' || status === 'incorrect') ? '#000' : '#fff',
												flexShrink: 0,
											}}>
												{status === 'completed' ? '✓' : status === 'incorrect' ? '✗' : index + 1}
											</div>
											<div className="va-course-sidebar-module-content" style={{ flex: 1, minWidth: 0 }}>
												<div className="va-course-sidebar-module-title" style={{
													fontSize: '0.95rem',
													fontWeight: 600,
													color: currentQuestionIndex === index
														? 'var(--formely-white)'
														: status === 'completed'
														? '#4ade80'
														: status === 'incorrect'
														? '#ff6b6b'
														: '#fff',
													marginBottom: '0.25rem',
													lineHeight: 1.4,
												}}>
													Întrebarea {index + 1}
												</div>
											</div>
											{isFlagged && (
												<div style={{
													width: '8px',
													height: '8px',
													borderRadius: '50%',
													background: '#ff6b6b',
													border: '1px solid rgba(0,0,0,0.3)',
													flexShrink: 0
												}} />
											)}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</aside>
			)}

			{/* Main Content */}
			<main className="va-course-content-main">
				{/* Breadcrumb */}
				<div className="va-course-content-header">
					<Link 
						to="/courses"
						style={{
							color: 'var(--va-muted)',
							textDecoration: 'none',
							fontSize: '0.95rem',
							transition: 'color 0.2s ease'
						}}
						onMouseEnter={(e) => e.currentTarget.style.color = 'var(--va-primary)'}
						onMouseLeave={(e) => e.currentTarget.style.color = 'var(--va-muted)'}
					>
						Cursuri
					</Link>
					<span style={{ color: 'var(--va-muted)', fontSize: '1.2rem' }}>/</span>
					<Link 
						to={`/courses/${courseId}`}
						style={{
							color: 'var(--va-muted)',
							textDecoration: 'none',
							fontSize: '0.95rem',
							transition: 'color 0.2s ease'
						}}
						onMouseEnter={(e) => e.currentTarget.style.color = 'var(--va-primary)'}
						onMouseLeave={(e) => e.currentTarget.style.color = 'var(--va-muted)'}
					>
						Curs
					</Link>
					<span style={{ color: 'var(--va-muted)', fontSize: '1.2rem' }}>/</span>
					<span style={{ color: 'var(--va-primary)', fontWeight: 600 }}>
						Test final
					</span>
				</div>

				{/* Quiz Header */}
				<div style={{ marginBottom: '2rem' }}>
					<div className="va-course-hero-content">
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
							<h1 className="va-page-title">
								{quiz.title || 'Test final'}
							</h1>
							{saved && result && (
								<div style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: '0.75rem',
									padding: '0.75rem 1.5rem',
									background: 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.15), rgba(var(--formely-white-rgb), 0.1))',
									border: '1px solid rgba(var(--formely-white-rgb), 0.35)',
									borderRadius: '16px',
									color: 'var(--va-primary)',
									fontSize: '0.95rem',
									fontWeight: 700,
									boxShadow: '0 4px 16px rgba(var(--formely-white-rgb), 0.15)'
								}}>
									<div style={{
										width: '28px',
										height: '28px',
										borderRadius: '8px',
										background: 'linear-gradient(135deg, var(--formely-white), #ffd700)',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										color: '#000',
										fontWeight: 700
									}}>
										✓
									</div>
									<span>Test completat</span>
								</div>
							)}
						</div>

						{/* Pre-Quiz Overview */}
						{!submitted && !saved && quiz.questions && (
							<div className="va-quiz-overview">
								<div className="va-quiz-overview-item">
									<div className="va-quiz-overview-label">Întrebări</div>
									<div className="va-quiz-overview-value">{quiz.questions.length}</div>
								</div>
								{quiz.duration_minutes && (
									<div className="va-quiz-overview-item">
										<div className="va-quiz-overview-label">Durată estimată</div>
										<div className="va-quiz-overview-value">{quiz.duration_minutes} min</div>
									</div>
								)}
								<div className="va-quiz-overview-item">
									<div className="va-quiz-overview-label">Puncte disponibile</div>
									<div className="va-quiz-overview-value">
										{quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0)}
									</div>
								</div>
								{quiz.passing_score && (
									<div className="va-quiz-overview-item">
										<div className="va-quiz-overview-label">Punctaj minim</div>
										<div className="va-quiz-overview-value">{quiz.passing_score}%</div>
									</div>
								)}
								{quiz.max_attempts && (
									<div className="va-quiz-overview-item">
										<div className="va-quiz-overview-label">Încercări rămase</div>
										<div className="va-quiz-overview-value">
											{Math.max(0, (quiz.max_attempts || 0) - (quiz.attempts_count || 0))}
										</div>
									</div>
								)}
							</div>
						)}

						{/* Timer Display */}
						{timeRemaining !== null && !saved && !submitted && (
							<div style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								gap: '1rem',
								marginTop: '1.5rem',
								padding: '1rem 1.5rem',
								background: timeRemaining < 300 
									? 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,107,107,0.1))'
									: 'rgba(255,255,255,0.05)',
								border: `1px solid ${timeRemaining < 300 ? 'rgba(255,107,107,0.3)' : 'rgba(var(--formely-white-rgb), 0.2)'}`,
								borderRadius: '16px'
							}}>
								<span style={{ fontSize: '1.2rem' }}>⏱</span>
								<span style={{
									fontSize: '1.5rem',
									fontWeight: 700,
									color: timeRemaining < 300 ? '#ff6b6b' : 'var(--va-primary)',
									fontFamily: 'monospace'
								}}>
									{formatTime(timeRemaining)}
								</span>
								<span style={{ color: 'var(--va-muted)', fontSize: '0.9rem' }}>
									rămas
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Questions */}
				{!saved && (
					<div className="va-card" style={{
						background: 'linear-gradient(135deg, rgba(0,0,0,0.95), rgba(20,20,20,0.98))',
						border: '1px solid rgba(var(--formely-white-rgb), 0.25)',
						borderRadius: '24px',
						boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(var(--formely-white-rgb), 0.1) inset',
						overflow: 'hidden'
					}}>
						<div className="va-card-body va-stack" style={{ padding: '2.5rem' }}>
							{quiz.questions && quiz.questions.length > 0 ? (
								quiz.questions.map((q, idx) => {
									const hasOptions = Array.isArray(q.options) && q.options.length > 0;
									const hasMatching = q.type === 'matching' && q.matching;
									const hasOrdering = q.type === 'ordering' && q.ordering;
									const isStructured = Boolean(hasMatching || hasOrdering);
									const isCorrect = isQuestionCorrect(q, visibleAnswers[q.id]);
									const showResult = (submitted || saved) && result;
									const isFlagged = flaggedQuestions.has(q.id);
									const points = q.points || 1;
									
									return (
										<div 
											id={`question-${q.id}`}
											key={q.id}
											className={`va-question-card ${showResult ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
											style={{
												background: showResult
													? (isCorrect
														? 'linear-gradient(135deg, rgba(74, 222, 128, 0.08), rgba(34, 197, 94, 0.05))'
														: 'linear-gradient(135deg, rgba(255,107,107,0.08), rgba(255,107,107,0.05))')
													: 'linear-gradient(135deg, rgba(0,0,0,0.95), rgba(20,20,20,0.98))',
												backdropFilter: 'blur(20px)',
												border: showResult
													? (isCorrect
														? '1px solid rgba(74, 222, 128, 0.3)'
														: '1px solid rgba(255,107,107,0.3)')
													: '1px solid rgba(var(--formely-white-rgb), 0.25)',
												borderRadius: '20px',
												padding: '2rem',
												marginBottom: '1.5rem',
												boxShadow: showResult
													? (isCorrect
														? '0 8px 32px rgba(74, 222, 128, 0.2), 0 0 0 1px rgba(74, 222, 128, 0.1) inset'
														: '0 8px 32px rgba(255,107,107,0.2), 0 0 0 1px rgba(255,107,107,0.1) inset')
													: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(var(--formely-white-rgb), 0.1) inset',
												position: 'relative',
												overflow: 'hidden',
												transition: 'all 0.3s ease',
											}}
										>
											{/* Background gradient */}
											{showResult && (
												<div style={{
													position: 'absolute',
													top: '-30%',
													right: '-10%',
													width: '200px',
													height: '200px',
													background: isCorrect
														? 'radial-gradient(circle, rgba(74, 222, 128, 0.15), transparent)'
														: 'radial-gradient(circle, rgba(255,107,107,0.15), transparent)',
													borderRadius: '50%',
													pointerEvents: 'none',
												}} />
											)}
											
											<div className="va-question-header" style={{ position: 'relative', zIndex: 1 }}>
												<div className={`va-question-number-badge ${showResult ? (isCorrect ? 'correct' : 'incorrect') : 'default'}`} style={{
													width: '48px',
													height: '48px',
													borderRadius: '14px',
													background: showResult
														? (isCorrect
															? 'linear-gradient(135deg, #4ade80, #22c55e)'
															: 'linear-gradient(135deg, #ff6b6b, #ff5252)')
														: 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.25), rgba(var(--formely-white-rgb), 0.15))',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontSize: '1.25rem',
													fontWeight: 700,
													color: showResult ? '#fff' : 'var(--formely-white)',
													flexShrink: 0,
													boxShadow: showResult
														? (isCorrect
															? '0 4px 16px rgba(74, 222, 128, 0.3)'
															: '0 4px 16px rgba(255,107,107,0.3)')
														: '0 4px 12px rgba(var(--formely-white-rgb), 0.2)',
													border: showResult ? 'none' : '1px solid rgba(var(--formely-white-rgb), 0.3)',
												}}>
													{showResult ? (isCorrect ? '✓' : '✗') : idx + 1}
												</div>
												<div style={{ flex: 1 }}>
													<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
														<div style={{ flex: 1 }}>
															<div className="va-question-text">
																{q.text}
															</div>
															{!submitted && !saved && (
																<div className="va-question-progress">
																	Întrebarea {idx + 1} din {quiz.questions.length}
																</div>
															)}
														</div>
														<div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
															{points > 1 && (
																<div style={{
																	padding: '0.5rem 1rem',
																	background: 'rgba(var(--formely-white-rgb), 0.1)',
																	border: '1px solid rgba(var(--formely-white-rgb), 0.2)',
																	borderRadius: '12px',
																	color: 'var(--va-primary)',
																	fontSize: '0.85rem',
																	fontWeight: 700
																}}>
																	{points} {points === 1 ? 'punct' : 'puncte'}
																</div>
															)}
															{!submitted && !saved && (
																<button
																	onClick={() => toggleFlag(q.id)}
																	style={{
																		padding: '0.5rem',
																		background: isFlagged ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)',
																		border: `1px solid ${isFlagged ? 'rgba(255,107,107,0.3)' : 'rgba(var(--formely-white-rgb), 0.2)'}`,
																		borderRadius: '8px',
																		cursor: 'pointer',
																		color: isFlagged ? '#ff6b6b' : 'var(--va-text)',
																		transition: 'all 0.2s ease',
																		display: 'flex',
																		alignItems: 'center',
																		justifyContent: 'center'
																	}}
																	title={isFlagged ? 'Elimină marcaj' : 'Marchează pentru revizie'}
																>
																	<span style={{ fontSize: '1.2rem' }}>🚩</span>
																</button>
															)}
														</div>
													</div>
												</div>
											</div>
											{isStructured ? (
												<div style={{ marginTop: '1.5rem' }}>
													<StructuredQuestionRenderer
														question={q}
														value={visibleAnswers[q.id]}
														onChange={(next) => {
															if (!saved && !submitted) {
																handleAnswerChange(q.id, next);
															}
														}}
														disabled={saved || submitted}
													/>
												</div>
											) : hasOptions ? (
												<>
													<div className="va-answer-options" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
														{q.options && q.options.map((opt, i) => {
															const isSelected = visibleAnswers[q.id] === i;
															const isCorrectOption = i === q.answerIndex;
															
															return (
																<label 
																	key={i} 
																	className={`va-answer-option ${showResult 
																		? (isCorrectOption ? 'correct' : isSelected ? 'incorrect' : 'default')
																		: (isSelected ? 'selected' : 'default')
																	} ${(submitted || saved) ? 'disabled' : ''}`}
																	style={{
																		display: 'flex',
																		alignItems: 'center',
																		gap: '1rem',
																		padding: '1.25rem 1.5rem',
																		background: showResult
																			? (isCorrectOption
																				? 'linear-gradient(135deg, rgba(74, 222, 128, 0.15), rgba(34, 197, 94, 0.1))'
																				: isSelected
																				? 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,107,107,0.1))'
																				: 'rgba(255,255,255,0.03)')
																			: (isSelected
																				? 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.15), rgba(var(--formely-white-rgb), 0.1))'
																				: 'rgba(255,255,255,0.03)'),
																		backdropFilter: 'blur(10px)',
																		border: showResult
																			? (isCorrectOption
																				? '1px solid rgba(74, 222, 128, 0.35)'
																				: isSelected
																				? '1px solid rgba(255,107,107,0.35)'
																				: '1px solid rgba(255,255,255,0.1)')
																			: (isSelected
																				? '1px solid rgba(var(--formely-white-rgb), 0.35)'
																				: '1px solid rgba(var(--formely-white-rgb), 0.2)'),
																		borderRadius: '16px',
																		cursor: (submitted || saved) ? 'default' : 'pointer',
																		transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
																		boxShadow: showResult
																			? (isCorrectOption || isSelected
																				? '0 4px 16px rgba(var(--formely-white-rgb), 0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
																				: '0 2px 8px rgba(0,0,0,0.2)')
																			: (isSelected
																				? '0 4px 16px rgba(var(--formely-white-rgb), 0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
																				: '0 2px 8px rgba(0,0,0,0.2)'),
																	}}
																	onMouseEnter={(e) => {
																		if (!submitted && !saved) {
																			if (!isSelected) {
																				e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.1), rgba(var(--formely-white-rgb), 0.05))';
																				e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.3)';
																				e.currentTarget.style.transform = 'translateX(4px)';
																			}
																		}
																	}}
																	onMouseLeave={(e) => {
																		if (!submitted && !saved) {
																			if (!isSelected) {
																				e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
																				e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.2)';
																				e.currentTarget.style.transform = 'translateX(0)';
																			}
																		}
																	}}
																>
																	<input
																		type="radio"
																		name={q.id}
																		checked={isSelected}
																		onChange={() => {
																			if (!submitted && !saved) {
																				handleAnswerChange(q.id, i);
																			}
																		}}
																		disabled={submitted || saved}
																		style={{ margin: 0 }}
																	/>
																	<span style={{
																		flex: 1,
																		color: showResult 
																			? (isCorrectOption ? 'var(--va-primary)' : isSelected ? '#ff6b6b' : 'var(--va-text)')
																			: 'var(--va-text)',
																		fontWeight: isSelected ? 500 : 400
																	}}>
																		{opt}
																	</span>
																	{showResult && isCorrectOption && (
																		<span style={{ color: 'var(--va-primary)', fontSize: '1.2rem' }}>✓</span>
																	)}
																	{showResult && isSelected && !isCorrectOption && (
																		<span style={{ color: '#ff6b6b', fontSize: '1.2rem' }}>✗</span>
																	)}
															</label>
														);
													})}
												</div>
												</>
											) : (
												<div className="va-form-group" style={{ marginTop: '1.5rem' }}>
													<div style={{
														padding: '1rem 1.25rem',
														background: 'rgba(255,255,255,0.04)',
														border: '1px solid rgba(var(--formely-white-rgb), 0.15)',
														borderRadius: '12px',
														color: 'var(--va-text-muted)',
													}}>
														Fără opțiuni afișabile pentru această întrebare.
													</div>
												</div>
											)}
													{showResult && (
														<div className={`va-answer-feedback ${isCorrect ? 'correct' : 'incorrect'}`}>
															<div className="va-feedback-header">
																<span className="va-feedback-icon">
																	{isCorrect ? '✓' : '✗'}
																</span>
																<span className={`va-feedback-title ${isCorrect ? 'correct' : 'incorrect'}`}>
																	{isCorrect ? 'Răspuns corect' : 'Răspuns incorect'}
																</span>
															</div>
															{q.explanation && (
																<div className={`va-feedback-explanation ${isCorrect ? 'correct' : 'incorrect'}`}>
																	<strong>Explicație:</strong> {q.explanation}
																</div>
															)}
															{q.lesson_id && (
																<div style={{ marginTop: '0.75rem' }}>
																	<Link
																		to={`/courses/${courseId}/lessons/${q.lesson_id}`}
																		style={{
																			color: 'var(--va-primary)',
																			textDecoration: 'none',
																			fontSize: '0.9rem',
																			fontWeight: 600,
																			display: 'inline-flex',
																			alignItems: 'center',
																			gap: '0.5rem',
																			transition: 'all 0.2s ease'
																		}}
																		onMouseEnter={(e) => {
																			e.currentTarget.style.transform = 'translateX(4px)';
																		}}
																		onMouseLeave={(e) => {
																			e.currentTarget.style.transform = 'translateX(0)';
																		}}
																	>
																		<span>📖</span>
																		<span>Vezi lecția relevantă</span>
																		<span>→</span>
																	</Link>
																</div>
															)}
														</div>
													)}
										</div>
									);
								})
							) : (
								<p style={{ color: 'var(--va-muted)', textAlign: 'center', padding: '2rem' }}>
									Nu există întrebări disponibile pentru acest test.
								</p>
							)}
						</div>
					</div>
				)}

				{/* Results Page Enhanced */}
				{saved && result && (
					<div>
						<div className={`va-quiz-results ${result.passed ? '' : 'failed'}`}>
							<div className={`va-results-header ${result.passed ? 'passed' : 'failed'}`}>
								{result.passed ? '✓ Promovat' : '✗ Nepromovat'}
							</div>
							<div className="va-results-stats">
								<div className="va-results-stat">
									<div className="va-results-stat-label">Scor</div>
									<div className="va-results-stat-value">
										{result.score || 0} / {result.total || quiz.questions?.length || 0}
									</div>
								</div>
								<div className="va-results-stat">
									<div className="va-results-stat-label">Procentaj</div>
									<div className="va-results-stat-value">{result.percentage || 0}%</div>
								</div>
								{performanceMetrics && (
									<>
										<div className="va-results-stat">
											<div className="va-results-stat-label">Corecte</div>
											<div className="va-results-stat-value" style={{ color: '#4ade80' }}>
												{performanceMetrics.correctAnswers}
											</div>
										</div>
										<div className="va-results-stat">
											<div className="va-results-stat-label">Incorecte</div>
											<div className="va-results-stat-value" style={{ color: '#ff6b6b' }}>
												{performanceMetrics.incorrectAnswers}
											</div>
										</div>
									</>
								)}
							</div>
							{saved && result?.completed_at && (
								<div style={{
									color: 'var(--va-muted)',
									fontSize: '0.9rem',
									paddingTop: '1rem',
									borderTop: '1px solid rgba(var(--formely-white-rgb), 0.2)'
								}}>
									Completat la: {new Date(result.completed_at).toLocaleString('ro-RO')}
								</div>
							)}
						</div>

						{/* Performance Breakdown */}
						{performanceMetrics && (
							<div style={{
								background: 'linear-gradient(135deg, rgba(0,0,0,0.95), rgba(20,20,20,0.98))',
								border: '1px solid rgba(var(--formely-white-rgb), 0.25)',
								borderRadius: '20px',
								padding: '2rem',
								marginBottom: '2rem',
								boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(var(--formely-white-rgb), 0.1) inset'
							}}>
								<h3 style={{
									color: 'var(--va-text)',
									fontSize: '1.3rem',
									fontWeight: 700,
									margin: 0,
									marginBottom: '1.5rem',
									display: 'flex',
									alignItems: 'center',
									gap: '0.75rem'
								}}>
									<span>📊</span>
									<span>Breakdown detaliat</span>
								</h3>
								<div style={{ display: 'grid', gap: '1rem' }}>
									{quiz.questions.map((q, idx) => {
										const isStructured = q.type === 'matching' || q.type === 'ordering';
										const isCorrect = isQuestionCorrect(q, visibleAnswers[q.id]);
										const userAnswer = visibleAnswers[q.id];
										
										return (
											<div key={q.id} style={{
												background: isCorrect 
													? 'linear-gradient(135deg, rgba(74, 222, 128, 0.08), rgba(34, 197, 94, 0.05))'
													: 'linear-gradient(135deg, rgba(255,107,107,0.08), rgba(255,107,107,0.05))',
												border: `1px solid ${isCorrect ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255,107,107,0.3)'}`,
												borderRadius: '16px',
												padding: '1.5rem'
											}}>
												<div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
													<div style={{
														width: '36px',
														height: '36px',
														borderRadius: '10px',
														background: isCorrect 
															? 'linear-gradient(135deg, #4ade80, #22c55e)'
															: 'linear-gradient(135deg, #ff6b6b, #ff5252)',
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														color: '#fff',
														fontWeight: 700,
														fontSize: '1rem'
													}}>
														{isCorrect ? '✓' : '✗'}
													</div>
													<div style={{ flex: 1 }}>
														<div style={{
															fontWeight: 700,
															color: 'var(--va-text)',
															marginBottom: '0.5rem'
														}}>
															Întrebarea {idx + 1}
														</div>
														<div style={{ color: 'var(--va-muted)', fontSize: '0.9rem' }}>
															{q.text}
														</div>
													</div>
												</div>
												<div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
													{isStructured && q.matching && (
														<div style={{
															padding: '0.75rem 1rem',
															background: 'rgba(255,255,255,0.05)',
															border: '1px solid rgba(var(--formely-white-rgb), 0.15)',
															borderRadius: '12px'
														}}>
															<div style={{ color: 'var(--va-primary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
																Potrivire
															</div>
															<div style={{ display: 'grid', gap: '0.5rem' }}>
																{q.matching.leftItems?.map((left, pairIndex) => {
																	const userChoice = Array.isArray(userAnswer) ? userAnswer[pairIndex] : null;
																	const correctChoice = q.matching.correctMap?.[pairIndex];
																	const selectedItem = q.matching.rightItems?.find((opt) => String(opt.id) === String(userChoice));
																	const correctItem = q.matching.rightItems?.find((opt) => String(opt.id) === String(correctChoice));
																	return (
																		<div key={left.id} style={{ color: 'var(--va-text)', fontSize: '0.9rem' }}>
																			<strong>{left.text}</strong>
																			<div style={{ marginTop: '0.25rem' }}>
																				Răspunsul tău: {selectedItem?.text || '—'}
																			</div>
																			{!isCorrect && (
																				<div style={{ marginTop: '0.15rem', color: '#4ade80' }}>
																					Răspuns corect: {correctItem?.text || '—'}
																				</div>
																			)}
																		</div>
																	);
																})}
															</div>
														</div>
													)}
													{isStructured && q.ordering && (
														<div style={{
															padding: '0.75rem 1rem',
															background: 'rgba(255,255,255,0.05)',
															border: '1px solid rgba(var(--formely-white-rgb), 0.15)',
															borderRadius: '12px'
														}}>
															<div style={{ color: 'var(--va-primary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
																Ordonare
															</div>
															<div style={{ color: 'var(--va-text)', fontSize: '0.9rem' }}>
																Ordinea ta: {(Array.isArray(userAnswer) ? userAnswer : []).map((id) => q.ordering.items?.find((item) => String(item.id) === String(id))?.text).filter(Boolean).join(' • ') || '—'}
															</div>
															{!isCorrect && (
																<div style={{ color: '#4ade80', fontSize: '0.9rem', marginTop: '0.25rem' }}>
																	Ordinea corectă: {(q.ordering.correctOrder || []).map((id) => q.ordering.items?.find((item) => String(item.id) === String(id))?.text).filter(Boolean).join(' • ') || '—'}
																</div>
															)}
														</div>
													)}
													{!isStructured && (<div style={{
														padding: '0.75rem 1rem',
														background: 'rgba(74, 222, 128, 0.1)',
														border: '1px solid rgba(74, 222, 128, 0.2)',
														borderRadius: '12px'
													}}>
														<div style={{ color: '#4ade80', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
															✓ Răspuns corect
														</div>
														<div style={{ color: 'var(--va-text)', fontSize: '0.9rem' }}>
															{q.options?.[q.answerIndex]}
														</div>
													</div>)}
													{!isStructured && !isCorrect && userAnswer !== undefined && (
														<div style={{
															padding: '0.75rem 1rem',
															background: 'rgba(255,107,107,0.1)',
															border: '1px solid rgba(255,107,107,0.2)',
															borderRadius: '12px'
														}}>
															<div style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
																✗ Răspunsul tău
															</div>
															<div style={{ color: 'var(--va-text)', fontSize: '0.9rem' }}>
																{q.options?.[userAnswer]}
															</div>
														</div>
													)}
													{!isStructured && q.explanation && (
														<div style={{
															padding: '0.75rem 1rem',
															background: 'rgba(255,255,255,0.05)',
															border: '1px solid rgba(var(--formely-white-rgb), 0.15)',
															borderRadius: '12px',
															marginTop: '0.5rem'
														}}>
															<div style={{ color: 'var(--va-primary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
																💡 Explicație
															</div>
															<div style={{ color: 'var(--va-text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
																{q.explanation}
															</div>
														</div>
													)}
													{isStructured && q.explanation && (
														<div style={{
															padding: '0.75rem 1rem',
															background: 'rgba(255,255,255,0.05)',
															border: '1px solid rgba(var(--formely-white-rgb), 0.15)',
															borderRadius: '12px',
															marginTop: '0.5rem'
														}}>
															<div style={{ color: 'var(--va-primary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
																💡 Explicație
															</div>
															<div style={{ color: 'var(--va-text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
																{q.explanation}
															</div>
														</div>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}

						{/* Recommendations */}
						{performanceMetrics && !result.passed && (
							<div style={{
								background: 'linear-gradient(135deg, rgba(255,193,7,0.12), rgba(255,193,7,0.08))',
								border: '1px solid rgba(255,193,7,0.3)',
								borderRadius: '20px',
								padding: '2rem',
								marginBottom: '2rem',
								boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,193,7,0.1) inset'
							}}>
								<h3 style={{
									color: '#ffc107',
									fontSize: '1.3rem',
									fontWeight: 700,
									margin: 0,
									marginBottom: '1rem',
									display: 'flex',
									alignItems: 'center',
									gap: '0.75rem'
								}}>
									<span>💡</span>
									<span>Recomandări pentru îmbunătățire</span>
								</h3>
								<div style={{ display: 'grid', gap: '0.75rem' }}>
									<div style={{ color: 'var(--va-text)', lineHeight: 1.6 }}>
										• Revizuiește lecțiile asociate cu întrebările la care ai răspuns greșit
									</div>
									<div style={{ color: 'var(--va-text)', lineHeight: 1.6 }}>
										• Punctajul tău: {result.percentage}% (minim necesar: {quiz.passing_score || 70}%)
									</div>
									<div style={{ color: 'var(--va-text)', lineHeight: 1.6 }}>
										• Ai răspuns corect la {performanceMetrics.correctAnswers} din {performanceMetrics.totalQuestions} întrebări
									</div>
									{quiz.max_attempts && (quiz.max_attempts - (quiz.attempts_count || 0) > 0) && (
										<div style={{ color: 'var(--va-text)', lineHeight: 1.6 }}>
											• Mai ai {quiz.max_attempts - (quiz.attempts_count || 0)} {quiz.max_attempts - (quiz.attempts_count || 0) === 1 ? 'încercare' : 'încercări'} disponibile
										</div>
									)}
								</div>
							</div>
						)}

						{/* Action Buttons */}
						<div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
							<Link 
								to={`/courses/${courseId}`}
								className="lms-btn-secondary"
								style={{ padding: '0.875rem 1.5rem' }}
							>
								Înapoi la curs
							</Link>
							{quiz.max_attempts && (quiz.max_attempts - (quiz.attempts_count || 0) > 0) && !result.passed && (
								<button
									onClick={() => {
										setAnswers({});
										setSubmitted(false);
										setResult(null);
										setSaved(false);
										setCurrentQuestionIndex(0);
										setFlaggedQuestions(new Set());
										if (quiz.duration_minutes) {
											setTimeRemaining(quiz.duration_minutes * 60);
											setStartTime(Date.now());
										}
									}}
									className="lms-btn-primary"
									style={{ padding: '0.875rem 1.5rem' }}
								>
									Reîncearcă testul
								</button>
							)}
						</div>
					</div>
				)}

				{/* Submit Button */}
				{!submitted && !saved && (
					<div style={{ marginTop: '2rem' }}>
						<div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
							<button 
								className="lms-btn-primary" 
								onClick={handleSubmit}
								style={{
									padding: '0.875rem 2rem',
									fontSize: '1rem',
									fontWeight: 600
								}}
							>
								Trimite testul
							</button>
							<Link 
								to={`/courses/${courseId}`}
								className="lms-btn-link"
								style={{ padding: '0.875rem 1.5rem' }}
							>
								Înapoi la curs
							</Link>
						</div>
					</div>
				)}

				{/* Save Result Button */}
				{!saved && submitted && result && (
					<div style={{ marginTop: '2rem' }}>
						<button 
							className="lms-btn-primary" 
							onClick={handleSave}
							style={{
								marginBottom: '1rem',
								padding: '0.875rem 2rem',
								fontSize: '1rem',
								fontWeight: 600,
								width: '100%'
							}}
						>
							Salvează rezultat
						</button>
					</div>
				)}
			</main>
		</div>
	);
};

const normalizeSequenceAnswer = (value) => {
	if (!Array.isArray(value)) return null;
	return value.map((item) => String(item));
};

const isQuestionCorrect = (question, answerValue) => {
	if (!question) return false;
	if (question.type === 'matching' && question.matching?.correctMap) {
		const userSeq = normalizeSequenceAnswer(answerValue);
		const correctSeq = normalizeSequenceAnswer(question.matching.correctMap);
		return Boolean(userSeq && correctSeq && userSeq.length === correctSeq.length && userSeq.every((v, i) => v === correctSeq[i]));
	}
	if (question.type === 'ordering' && question.ordering?.correctOrder) {
		const userSeq = normalizeSequenceAnswer(answerValue);
		const correctSeq = normalizeSequenceAnswer(question.ordering.correctOrder);
		return Boolean(userSeq && correctSeq && userSeq.length === correctSeq.length && userSeq.every((v, i) => v === correctSeq[i]));
	}
	if (Array.isArray(question.options) && question.options.length > 0) {
		return answerValue === question.answerIndex;
	}
	return false;
};

export default QuizPage;
