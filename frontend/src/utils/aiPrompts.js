const trimOrEmpty = (value) => String(value || '').trim();

export const buildCourseCreationPromptFromBrief = (briefPayload, manualPrompt = '') => {
	const requestedPrompt = trimOrEmpty(manualPrompt);
	if (!briefPayload) {
		return requestedPrompt;
	}

	const titleOrTopic = briefPayload.course_title || briefPayload.topic || 'Curs nou';
	const rows = [
		`Creează cursul complet pe baza acestui brief: ${titleOrTopic}.`,
		`Titlu dorit: ${briefPayload.course_title || '(alege tu un titlu potrivit)'}.`,
		`Temă/subiect: ${briefPayload.topic || '(neprecizat)'}. Public: ${briefPayload.target_audience || '(neprecizat)'}.`,
		`Nivel: ${briefPayload.level}; Stil: ${briefPayload.style}; Dimensiune lecții: ${briefPayload.lesson_size}.`,
		`Structură fixă: ${briefPayload.modules_count} module, ${briefPayload.lessons_per_module} lecții per modul.`,
		`Descriere: ${briefPayload.description || '(generează una profesională și clară)'}.`,
		'Fiecare lecție trebuie să fie predabilă: introducere, explicație, exemplu, exercițiu/aplicație și recapitulare.',
		'Păstrează tonul practic și coerent pe tot cursul. Dacă datele de mai sus sunt suficiente, nu cere clarificări și livrează direct cursul final.',
	];

	if (requestedPrompt) {
		rows.push(`Instrucțiuni suplimentare de la profesor: ${requestedPrompt}`);
	}

	return rows.join('\n');
};

export const buildTextLessonTransformPrompt = ({ action, lessonContent }) => {
	const actionPrompts = {
		rewrite: 'Reformulează textul păstrând sensul, dar fă-l mai clar, mai cursiv și mai ușor de urmărit. Nu schimba tema și nu adăuga idei noi.',
		simplify: 'Simplifică textul pentru public începător, păstrând informațiile esențiale și eliminând formulările prea dense sau ambigue.',
		expand: 'Extinde textul cu explicații, exemple și clarificări utile, fără să devii repetitiv și fără să pierzi firul logic.',
	};

	const content = trimOrEmpty(lessonContent);
	return `Ești editorul unei lecții dintr-un curs.
Respectă tema și structura existentă.
Păstrează limba română și tonul pedagogic.
Nu adăuga prefațe, nu menționa că ai făcut modificări și nu returna markdown în afara conținutului cerut.

Instrucțiunea:
${actionPrompts[action] || actionPrompts.rewrite}

Text original:
${content.substring(0, 2000)}

Generează doar versiunea ${action === 'rewrite' ? 'reformulată' : action === 'simplify' ? 'simplificată' : 'extinsă'} a textului, gata de lipit în lecție.`;
};

export const buildTextLessonDifficultyPrompt = (lessonContent) => {
	const content = trimOrEmpty(lessonContent);
	return `Analizează dificultatea acestui text pentru lecție și oferă un scor de la 1 la 10, unde 1 înseamnă foarte ușor și 10 foarte dificil.

Evaluează pe baza:
- densității conceptelor noi
- complexității limbajului
- numărului de pași pe care îi cere cititorului
- necesității de cunoștințe prealabile
- cât de ușor poate fi urmărit de un începător

Text:
${content.substring(0, 2000)}

Răspunde strict în format JSON valid:
{
  "difficulty_score": 5,
  "reasoning": "Explicație scurtă de ce acest scor..."
}`;
};

export const buildAssignmentLessonPrompt = ({ objective, constraints, content }) => {
	const cleanObjective = trimOrEmpty(objective);
	const cleanConstraints = trimOrEmpty(constraints);
	const cleanContent = trimOrEmpty(content);

	return `Generează exerciții practice pentru lecție.

Obiectiv: ${cleanObjective}
${cleanConstraints ? `Constrângeri: ${cleanConstraints}` : ''}
${cleanContent ? `Context: ${cleanContent.substring(0, 500)}` : ''}

Generează 3-5 exerciții practice care cresc progresiv în dificultate și rămân aliniate cu obiectivul lecției.
Pentru fiecare exercițiu include:
- o descriere clară a sarcinii
- instrucțiuni pas cu pas
- criterii de evaluare observabile
- feedback automat pentru răspuns corect și răspuns greșit
- punctaj rezonabil, proporțional cu efortul cerut

Reguli:
- nu repeta aceeași formulare între exerciții
- păstrează exercițiile scurte și concrete
- dacă există constrângeri, respectă-le strict
- folosește un limbaj potrivit pentru nivelul lecției
- răspunde doar cu JSON valid, fără explicații suplimentare

Răspunde în format JSON:
{
  "exercises": [
    {
      "title": "Titlu exercițiu",
      "description": "Descrierea sarcinii...",
      "instructions": ["Pasul 1", "Pasul 2", "Pasul 3"],
      "evaluation_criteria": ["Criteriu 1", "Criteriu 2"],
      "auto_feedback": "Feedback automat pentru răspunsuri corecte/greșite",
      "scoring": {
        "max_points": 10,
        "points_per_criteria": [5, 5]
      }
    }
  ]
}`;
};

export const buildLiveSessionAgendaPrompt = ({ title, description, durationMinutes }) => {
	return `Generează o agendă pentru sesiune live.

Titlu: ${trimOrEmpty(title) || 'Sesiune live'}
${trimOrEmpty(description) ? `Descriere: ${trimOrEmpty(description)}` : ''}
${durationMinutes ? `Durată: ${durationMinutes} minute` : ''}

Generează o agendă detaliată, orientată spre livrare clară și interacțiune.
Agenda trebuie să aibă ritm realist și să folosească timpul eficient.
Include:
- introducere și aliniere de obiective
- puncte principale de discutat în ordine logică
- una sau mai multe activități interactive
- un segment de întrebări și răspunsuri
- concluzie și pași următori

Reguli:
- păstrează timpii plauzibili
- nu lăsa segmente fără scop clar
- adaptează durata la timpul total disponibil
- răspunde doar cu JSON valid, fără text extra

Răspunde în format JSON:
{
  "agenda": [
    {
      "time": "00:00",
      "title": "Introducere",
      "duration_minutes": 5,
      "description": "Descriere activitate..."
    },
    {
      "time": "05:00",
      "title": "Punct principal 1",
      "duration_minutes": 15,
      "description": "Descriere activitate..."
    }
  ],
  "total_duration_minutes": 60
}`;
};

export const buildVideoLessonPrompt = ({ title, description }) => {
	return `Procesează acest video pentru lecție: "${trimOrEmpty(title) || 'Lecție video'}".

${trimOrEmpty(description) ? `Descriere: ${trimOrEmpty(description)}` : ''}

Generează:
1. Transcription completă (textul din video)
2. Chapters (capitole cu timestamp-uri)
3. Highlights (puncte importante)
4. Summary (rezumat al conținutului)
5. Asistent AI context (context pentru Asistent AI)
6. Quiz Base (întrebări de bază pentru quiz)

Răspunde în format JSON:
{
  "transcription": "text complet...",
  "chapters": [
    {"timestamp": "00:00", "title": "Introducere", "description": "..."},
    {"timestamp": "05:30", "title": "Concepte principale", "description": "..."}
  ],
  "highlights": [
    {"text": "Punct important 1", "timestamp": "02:15"},
    {"text": "Punct important 2", "timestamp": "08:45"}
  ],
  "summary": "Rezumat al conținutului...",
  "tutorContext": "context pentru Asistent AI...",
  "quizBase": [
    {"question": "Întrebare 1?", "type": "multiple_choice", "options": ["A", "B", "C"], "correct": 0},
    {"question": "Întrebare 2?", "type": "true_false", "correct": true}
  ]
}`;
};

export const buildAssessmentGenerationPrompt = ({ assessmentType, course, module, lesson, content }) => {
	return `Generează întrebări pentru ${assessmentType === 'lesson_quiz' ? 'quiz de lecție' : assessmentType === 'module_test' ? 'test de modul' : 'examen final'}.

Context:
- Curs: ${trimOrEmpty(course)}
${trimOrEmpty(module) ? `- Modul: ${trimOrEmpty(module)}` : ''}
${trimOrEmpty(lesson) ? `- Lecție: ${trimOrEmpty(lesson)}` : ''}
${trimOrEmpty(content) ? `Conținut: ${trimOrEmpty(content).substring(0, 1000)}` : ''}

Generează întrebări variate cu:
- Multiple choice (majoritatea)
- True/False (câteva)
- Difficulty balancing (ușor, mediu, dificil)
- Fără anti-pattern-uri (nu întrebări ambigue, nu răspunsuri evidente)

Răspunde în format JSON:
{
  "questions": [
    {
      "type": "multiple_choice",
      "content": "Întrebare...",
      "answers": [
        {"text": "Răspuns 1", "is_correct": true},
        {"text": "Răspuns 2", "is_correct": false},
        {"text": "Răspuns 3", "is_correct": false},
        {"text": "Răspuns 4", "is_correct": false}
      ],
      "difficulty": "medium",
      "points": 10,
      "explanation": "Explicație pentru răspuns corect"
    }
  ],
  "difficulty_distribution": {
    "easy": 2,
    "medium": 5,
    "hard": 3
  },
  "anti_patterns_detected": []
}`;
};

export const buildAssessmentAnalysisPrompt = (questions) => {
	return `Analizează balanța dificultății pentru aceste întrebări și detectează anti-pattern-uri.

Întrebări:
${JSON.stringify(questions, null, 2)}

Analizează:
1. Distribuția dificultății (ușor/mediu/dificil)
2. Anti-pattern-uri (întrebări ambigue, răspunsuri evidente, întrebări prea ușoare/dificile)
3. Sugestii de îmbunătățire

Răspunde în format JSON:
{
  "difficulty_distribution": {
    "easy": 3,
    "medium": 5,
    "hard": 2
  },
  "anti_patterns": [
    {
      "question_index": 0,
      "type": "ambiguous",
      "description": "Întrebarea este ambiguă..."
    }
  ],
  "suggestions": [
    "Adaugă mai multe întrebări dificile",
    "Clarifică întrebarea 3"
  ]
}`;
};

export const buildCourseQualityValidationPrompt = (courseInfo) => {
	return `Validează calitatea acestui curs și calculează un readiness score.

Curs: ${trimOrEmpty(courseInfo?.title)}
${trimOrEmpty(courseInfo?.description) ? `Descriere: ${trimOrEmpty(courseInfo.description)}` : ''}
Nivel: ${trimOrEmpty(courseInfo?.level) || 'nespecificat'}

Structură:
${JSON.stringify(courseInfo?.modules || [], null, 2)}

Analizează:
1. **Lesson length**: Verifică dacă lecțiile sunt prea lungi (>10 min pentru mobile-ready)
2. **Content gaps**: Identifică goluri în conținut, lecții lipsă, module incomplete
3. **Difficulty spikes**: Detectează salturi bruște de dificultate între lecții/module
4. **Engagement risk**: Evaluează riscul de pierdere a atenției (lecții prea lungi, lipsă varietate, etc.)

Calculează un **Readiness Score** (0-100) bazat pe:
- Completitudinea conținutului (30%)
- Balanța dificultății (25%)
- Mobile-ready compliance (20%)
- Engagement potential (25%)

Răspunde în format JSON:
{
  "readiness_score": 75,
  "checks": {
    "lesson_length": {
      "status": "warning",
      "issues": [],
      "passed": false
    },
    "content_gaps": {
      "status": "error",
      "issues": [],
      "passed": false
    },
    "difficulty_spikes": {
      "status": "warning",
      "issues": [],
      "passed": true
    },
    "engagement_risk": {
      "status": "ok",
      "issues": [],
      "passed": true
    }
  },
  "fix_suggestions": [
    "Împarte lecția 1 în 2 lecții mai scurte",
    "Adaugă lecție de introducere în Modul 1",
    "Adaugă lecție intermediară între Lecție 1 și Lecție 2"
  ],
  "summary": "Cursul este aproape gata, dar necesită câteva ajustări pentru a fi optim..."
}`;
};
