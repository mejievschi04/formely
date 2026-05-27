/**
 * Lesson Type Analyzer
 * Analizează tipurile de lecții din curs și generează recomandări
 * pentru pașii următori (teste, prețuri, funcții avansate)
 */

/**
 * Analizează tipurile de lecții și returnează statistici
 */
export const analyzeLessonTypes = (modules) => {
	if (!modules || modules.length === 0) {
		return {
			types: {},
			totalLessons: 0,
			hasVideo: false,
			hasText: false,
			hasAssignment: false,
			hasQuiz: false,
			hasLive: false,
			hasPdf: false,
			recommendations: {
				assessments: [],
				pricing: {},
				features: []
			}
		};
	}

	const typeCounts = {};
	let totalLessons = 0;
	let hasVideo = false;
	let hasText = false;
	let hasAssignment = false;
	let hasQuiz = false;
	let hasLive = false;
	let hasPdf = false;

	modules.forEach(module => {
		if (module.lessons && Array.isArray(module.lessons)) {
			module.lessons.forEach(lesson => {
				if (!lesson) return;
				
				totalLessons++;
				const type = lesson.content_type || lesson.type || 'text';
				
				typeCounts[type] = (typeCounts[type] || 0) + 1;
				
				if (type === 'video') hasVideo = true;
				if (type === 'text') hasText = true;
				if (type === 'assignment') hasAssignment = true;
				if (type === 'quiz') hasQuiz = true;
				if (type === 'live') hasLive = true;
				if (type === 'pdf') hasPdf = true;
			});
		}
	});

	// Generează recomandări bazate pe tipurile de lecții
	const recommendations = generateRecommendations({
		typeCounts,
		totalLessons,
		hasVideo,
		hasText,
		hasAssignment,
		hasQuiz,
		hasLive,
		hasPdf
	});

	return {
		types: typeCounts,
		totalLessons,
		hasVideo,
		hasText,
		hasAssignment,
		hasQuiz,
		hasLive,
		hasPdf,
		recommendations
	};
};

/**
 * Generează recomandări pentru teste, prețuri și funcții
 */
const generateRecommendations = (stats) => {
	const { typeCounts, totalLessons, hasVideo, hasText, hasAssignment, hasQuiz, hasLive, hasPdf } = stats;
	
	const recommendations = {
		assessments: [],
		features: []
	};

	// Recomandări pentru teste/evaluări
	if (hasVideo && typeCounts.video > 0) {
		recommendations.assessments.push({
			type: 'lesson_quiz',
			reason: `${typeCounts.video} lecții video - recomandăm quiz-uri după fiecare lecție`,
			priority: 'high',
			autoGenerate: true
		});
	}

	if (hasAssignment && typeCounts.assignment > 0) {
		recommendations.assessments.push({
			type: 'assignment_review',
			reason: `${typeCounts.assignment} teme practice - necesită evaluare manuală sau AI`,
			priority: 'high',
			autoGenerate: false
		});
	}

	if (hasQuiz && typeCounts.quiz > 0) {
		recommendations.assessments.push({
			type: 'lesson_quiz',
			reason: `${typeCounts.quiz} lecții quiz deja existente`,
			priority: 'medium',
			autoGenerate: false
		});
	}

	// Recomandăm test final dacă cursul are mai mult de 5 lecții
	if (totalLessons >= 5) {
		recommendations.assessments.push({
			type: 'final_exam',
			reason: `Curs cu ${totalLessons} lecții - recomandăm test final`,
			priority: 'high',
			autoGenerate: true
		});
	}

	// Recomandăm teste pe module dacă există mai mult de 3 module
	const moduleCount = Object.keys(typeCounts).length;
	if (moduleCount >= 3) {
		recommendations.assessments.push({
			type: 'module_test',
			reason: `Curs cu ${moduleCount} module - recomandăm teste pe module`,
			priority: 'medium',
			autoGenerate: true
		});
	}

	// Recomandări pentru funcții avansate
	if (hasVideo) {
		recommendations.features.push({
			feature: 'ai_tutor',
			reason: 'Lecții video - Asistent AI poate răspunde la întrebări bazate pe transcrieri',
			enabled: true
		});
		recommendations.features.push({
			feature: 'video_chapters',
			reason: 'Lecții video - capitole automate pentru navigare',
			enabled: true
		});
	}

	if (hasText && typeCounts.text >= 5) {
		recommendations.features.push({
			feature: 'reading_time',
			reason: 'Lecții text - afișare timp de citire',
			enabled: true
		});
		recommendations.features.push({
			feature: 'difficulty_scoring',
			reason: 'Lecții text - scoring automat de dificultate',
			enabled: true
		});
	}

	if (hasLive) {
		recommendations.features.push({
			feature: 'live_scheduling',
			reason: 'Lecții live - necesită programare și notificări',
			enabled: true
		});
		recommendations.features.push({
			feature: 'session_recording',
			reason: 'Lecții live - înregistrare sesiuni pentru review',
			enabled: true
		});
	}

	if (hasAssignment) {
		recommendations.features.push({
			feature: 'ai_feedback',
			reason: 'Teme practice - feedback automat cu AI',
			enabled: true
		});
		recommendations.features.push({
			feature: 'peer_review',
			reason: 'Teme practice - review între studenți',
			enabled: false // Opțional
		});
	}

	if (hasQuiz) {
		recommendations.features.push({
			feature: 'auto_quiz_generation',
			reason: 'Lecții quiz - generare automată de întrebări',
			enabled: true
		});
	}

	return recommendations;
};

/**
 * Calculează durata totală estimată a cursului
 */
export const calculateEstimatedDuration = (modules) => {
	if (!modules || modules.length === 0) return 0;

	let totalMinutes = 0;

	modules.forEach(module => {
		if (module.lessons && Array.isArray(module.lessons)) {
			module.lessons.forEach(lesson => {
				if (lesson && lesson.duration_minutes) {
					totalMinutes += parseInt(lesson.duration_minutes) || 0;
				} else {
					// Durată estimată bazată pe tip
					const type = lesson?.content_type || lesson?.type || 'text';
					const defaultDurations = {
						video: 15,
						text: 10,
						assignment: 30,
						quiz: 5,
						live: 60,
						pdf: 15
					};
					totalMinutes += defaultDurations[type] || 10;
				}
			});
		}
	});

	return Math.ceil(totalMinutes / 60); // Convert to hours
};

/**
 * Verifică dacă cursul este gata pentru publicare
 */
export const checkCourseReadiness = (courseData) => {
	const issues = [];
	const warnings = [];

	// Verificări de bază
	if (!courseData.title || !courseData.title.trim()) {
		issues.push('Titlul cursului este obligatoriu');
	}

	if (!courseData.modules || courseData.modules.length === 0) {
		issues.push('Adaugă cel puțin un modul');
	}

	// Verifică lecții
	const totalLessons = courseData.modules?.reduce((sum, m) => sum + (m.lessons?.length || 0), 0) || 0;
	if (totalLessons === 0) {
		issues.push('Adaugă cel puțin o lecție');
	}

	// Verifică conținut lecții
	courseData.modules?.forEach((module, midx) => {
		module.lessons?.forEach((lesson, lidx) => {
			if (!lesson.title || !lesson.title.trim()) {
				issues.push(`Lecția ${lidx + 1} din modulul "${module.title || midx + 1}" nu are titlu`);
			}

			// Verificări specifice pe tip
			if (lesson.content_type === 'video' && !lesson.video_url && !lesson.content) {
				warnings.push(`Lecția video "${lesson.title}" nu are video încărcat`);
			}

			if (lesson.content_type === 'text' && !lesson.content) {
				warnings.push(`Lecția text "${lesson.title}" nu are conținut`);
			}
		});
	});

	return {
		ready: issues.length === 0,
		issues,
		warnings,
		score: Math.max(0, 100 - (issues.length * 20) - (warnings.length * 5))
	};
};



