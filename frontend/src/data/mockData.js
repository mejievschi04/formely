export const mockCourses = [
	{
		id: 'produse-retail',
		title: 'Portofoliu Produse Retail',
		description: 'Înțelege structura completă a ofertelor retail, criteriile de eligibilitate și scenarii de recomandare.',
		level: 'Fundamental',
		lessons: [
			{
				id: 'produse-retail-mod1',
				title: 'Structura portofoliului',
				durationMinutes: 12,
				content: 'Analizăm familiile de produse, diferențele dintre abonamente și oferte punctuale și poziționarea lor în piață.',
			},
			{
				id: 'produse-retail-mod2',
				title: 'Politici de eligibilitate',
				durationMinutes: 15,
				content: 'Stabilim criteriile de acordare, documentele necesare și scenariile speciale pentru clienți existenți.',
			},
			{
				id: 'produse-retail-mod3',
				title: 'Recomandare consultativă',
				durationMinutes: 14,
				content: 'Exersăm matricea de recomandare și modul în care prezentăm valoarea produsului adaptat tipologiei clientului.',
			},
		],
		quiz: {
			id: 'quiz-produse-retail',
			title: 'Test: Portofoliu Produse Retail',
			questions: [
				{
					id: 'retail-q1',
					text: 'Care este criteriul principal de eligibilitate pentru oferta START?',
					options: ['Venit minim lunar', 'Veichime colaborare', 'Număr angajați', 'Canal de achiziție'],
					answerIndex: 0,
				},
				{
					id: 'retail-q2',
					text: 'Ce instrument folosești pentru a alege produsul potrivit?',
					options: ['Matricea de recomandare', 'Dashboard-ul financiar', 'Manualul logistic', 'Calendarul promoțional'],
					answerIndex: 0,
				},
			],
		},
	},
	{
		id: 'produse-imm',
		title: 'Configurații pentru IMM',
		description: 'Construiește pachete personalizate pentru companii mici și medii, cu focus pe scalabilitate.',
		level: 'Intermediar',
		lessons: [
			{
				id: 'produse-imm-mod1',
				title: 'Analiza nevoilor IMM',
				durationMinutes: 10,
				content: 'Cartografiem nevoile recurente ale segmentului IMM: mobilitate, colaborare și securitate.',
			},
			{
				id: 'produse-imm-mod2',
				title: 'Configurații rapide',
				durationMinutes: 16,
				content: 'Învățăm să combinăm licențe, servicii și opțiuni hardware pentru un time-to-value scurt.',
			},
			{
				id: 'produse-imm-mod3',
				title: 'Managementul costurilor',
				durationMinutes: 13,
				content: 'Stabilim scenarii de discount, modele de abonament și clauze contractuale flexibile.',
			},
		],
		quiz: {
			id: 'quiz-produse-imm',
			title: 'Test: Configurații pentru IMM',
			questions: [
				{
					id: 'imm-q1',
					text: 'Care este elementul obligatoriu într-un pachet pentru IMM orientat pe colaborare?',
					options: ['Server on-prem', 'Suport 24/7', 'Suite colaborative cloud', 'Stocare pe bandă'],
					answerIndex: 2,
				},
			],
		},
	},
	{
		id: 'produse-premium',
		title: 'Produse Premium & Upsell',
		description: 'Folosește beneficiile exclusive pentru a crește valoarea coșului și a fideliza clienții premium.',
		level: 'Avansat',
		lessons: [
			{
				id: 'produse-premium-mod1',
				title: 'Segmentarea clienților premium',
				durationMinutes: 11,
				content: 'Identificăm indicatorii care definesc un cont premium și ajustăm abordarea de comunicare.',
			},
			{
				id: 'produse-premium-mod2',
				title: 'Designul ofertelor upsell',
				durationMinutes: 15,
				content: 'Construim ladder-ul de beneficii și legăm fiecare nivel de obiective concrete de business.',
			},
			{
				id: 'produse-premium-mod3',
				title: 'Indicatori de succes',
				durationMinutes: 12,
				content: 'Stabilim KPIs post-vânzare pentru a demonstra ROI-ul și a pregăti următoarea propunere.',
			},
		],
		quiz: {
			id: 'quiz-produse-premium',
			title: 'Test: Produse Premium & Upsell',
			questions: [
				{
					id: 'premium-q1',
					text: 'Care este KPI-ul principal pentru evaluarea unui upsell premium?',
					options: ['Număr de contacte', 'Creșterea ARPU', 'Timp de răspuns', 'Cost per lead'],
					answerIndex: 1,
				},
			],
		},
	},
	{
		id: 'promotii-sezoniere',
		title: 'Campanii Promoționale Sezoniere',
		description: 'Planifică, rulează și măsoară campanii sezoniere cu impact în vânzări.',
		level: 'Fundamental',
		lessons: [
			{
				id: 'promotii-sezoniere-mod1',
				title: 'Calendar promoțional',
				durationMinutes: 9,
				content: 'Stabilim ferestrele comerciale, audiențele și mesajele cheie pentru fiecare sezon.',
			},
			{
				id: 'promotii-sezoniere-mod2',
				title: 'Set de beneficii',
				durationMinutes: 14,
				content: 'Construim mecanisme de discount, bonusuri recurente și oferte bundle.',
			},
			{
				id: 'promotii-sezoniere-mod3',
				title: 'Execuție și raportare',
				durationMinutes: 12,
				content: 'Definim indicatori zilnici și instrumente pentru urmărirea conversiilor.',
			},
		],
		quiz: {
			id: 'quiz-promotii-sezoniere',
			title: 'Test: Campanii Sezoniere',
			questions: [
				{
					id: 'promo-q1',
					text: 'Care este indicatorul critic într-o campanie de iarnă?',
					options: ['NPS', 'Costul de transport', 'Rata de conversie zilnică', 'Numărul de agenți'],
					answerIndex: 2,
				},
			],
		},
	},
	{
		id: 'promotii-cross-sell',
		title: 'Pachete Cross-Sell',
		description: 'Leagă produsele relevante între ele și crește valoarea coșului mediu.',
		level: 'Intermediar',
		lessons: [
			{
				id: 'promotii-cross-sell-mod1',
				title: 'Analiza complementarității',
				durationMinutes: 10,
				content: 'Identificăm produse cu afinitate mare și mapăm comportamentul clienților.',
			},
			{
				id: 'promotii-cross-sell-mod2',
				title: 'Structurarea pachetelor',
				durationMinutes: 13,
				content: 'Definim pachete Ready-to-go, configurabile și premium.',
			},
			{
				id: 'promotii-cross-sell-mod3',
				title: 'Storytelling comercial',
				durationMinutes: 11,
				content: 'Învățăm să prezentăm pachetul în 90 de secunde și să gestionăm obiecțiile frecvente.',
			},
		],
		quiz: {
			id: 'quiz-promotii-cross-sell',
			title: 'Test: Cross-Sell',
			questions: [
				{
					id: 'cross-q1',
					text: 'Care este raportul optim între produsul principal și cel complementar?',
					options: ['80/20', '50/50', '30/70', 'Nu există o regulă'],
					answerIndex: 0,
				},
			],
		},
	},
	{
		id: 'promotii-lansari',
		title: 'Lansări Accelerate',
		description: 'Pregătește rapid echipele și canalele pentru lansarea de produse noi.',
		level: 'Avansat',
		lessons: [
			{
				id: 'promotii-lansari-mod1',
				title: 'Playbook de lansare',
				durationMinutes: 12,
				content: 'Stabilim pașii obligatorii înainte, în timpul și după lansare.',
			},
			{
				id: 'promotii-lansari-mod2',
				title: 'Activarea canalelor',
				durationMinutes: 14,
				content: 'Coordinăm marketing, vânzări și suport pentru a păstra mesajul unitar.',
			},
			{
				id: 'promotii-lansari-mod3',
				title: 'Feedback & iterare',
				durationMinutes: 10,
				content: 'Construim bucle rapide de feedback și adaptăm oferta în primele 30 de zile.',
			},
		],
		quiz: {
			id: 'quiz-promotii-lansari',
			title: 'Test: Lansări Accelerate',
			questions: [
				{
					id: 'lansari-q1',
					text: 'Ce indicator măsoară succesul unei lansări în primele două săptămâni?',
					options: ['Număr de feature-uri lansate', 'Adopția inițială', 'Numărul de training-uri', 'Bugetul investit'],
					answerIndex: 1,
				},
			],
		},
	},
	{
		id: 'regulament-gdpr',
		title: 'Conformitate și GDPR',
		description: 'Aplică regulile GDPR și politicile interne în interacțiunea cu clienții.',
		level: 'Fundamental',
		lessons: [
			{
				id: 'regulament-gdpr-mod1',
				title: 'Principiile GDPR',
				durationMinutes: 11,
				content: 'Trecem prin principiile cheie și rolurile implicate în protecția datelor.',
			},
			{
				id: 'regulament-gdpr-mod2',
				title: 'Procese interne',
				durationMinutes: 13,
				content: 'Stabilim traseul datelor personale și mecanismele de consimțământ.',
			},
			{
				id: 'regulament-gdpr-mod3',
				title: 'Gestionarea incidentelor',
				durationMinutes: 12,
				content: 'Proceduri de raportare, timpi de reacție și formulare standard.',
			},
		],
		quiz: {
			id: 'quiz-regulament-gdpr',
			title: 'Test: Conformitate și GDPR',
			questions: [
				{
					id: 'gdpr-q1',
					text: 'În câte ore trebuie raportat un incident de date?',
					options: ['24h', '48h', '72h', '96h'],
					answerIndex: 2,
				},
			],
		},
	},
	{
		id: 'securitate-operationala',
		title: 'Securitate Operațională',
		description: 'Aplică proceduri de securitate în depozite, sedii și interacțiuni cu partenerii.',
		level: 'Intermediar',
		lessons: [
			{
				id: 'securitate-operationala-mod1',
				title: 'Identificarea riscurilor',
				durationMinutes: 12,
				content: 'Clasificăm riscurile și definim planurile minime de mitigare.',
			},
			{
				id: 'securitate-operationala-mod2',
				title: 'Controlul accesului',
				durationMinutes: 14,
				content: 'Stabilim scenarii pentru vizitatori, parteneri și subcontractori.',
			},
			{
				id: 'securitate-operationala-mod3',
				title: 'Simulări și audit',
				durationMinutes: 10,
				content: 'Planificăm exerciții periodice și urmărim remedierea neconformităților.',
			},
		],
		quiz: {
			id: 'quiz-securitate-operationala',
			title: 'Test: Securitate Operațională',
			questions: [
				{
					id: 'secop-q1',
					text: 'Ce document validează accesul temporar?',
					options: ['Registrul vizitatorilor', 'Planul de vânzări', 'Bugetul logistic', 'Foaia de parcurs'],
					answerIndex: 0,
				},
			],
		},
	},
	{
		id: 'audit-raportare',
		title: 'Audit și Raportare',
		description: 'Transformă verificările de conformitate în oportunități de optimizare.',
		level: 'Avansat',
		lessons: [
			{
				id: 'audit-raportare-mod1',
				title: 'Structura auditului intern',
				durationMinutes: 13,
				content: 'Definim obiectivele auditului și responsabilitățile echipelor implicate.',
			},
			{
				id: 'audit-raportare-mod2',
				title: 'Colectarea evidențelor',
				durationMinutes: 12,
				content: 'Stabilim ce probe sunt acceptate și cum se păstrează trasabilitatea.',
			},
			{
				id: 'audit-raportare-mod3',
				title: 'Planuri de acțiune',
				durationMinutes: 15,
				content: 'Creăm planuri SMART și urmărim închiderile până la validarea finală.',
			},
		],
		quiz: {
			id: 'quiz-audit-raportare',
			title: 'Test: Audit și Raportare',
			questions: [
				{
					id: 'audit-q1',
					text: 'Ce înseamnă SMART într-un plan de acțiune?',
					options: ['Simplu, Modular, Automat, Relevant, Tactic', 'Specific, Măsurabil, Atingibil, Relevant, încadrat în Timp', 'Scalabil, Modern, Accesibil, Rapid, Transparent', 'Special, Minimal, Auditabil, Riguros, Testat'],
					answerIndex: 1,
				},
			],
		},
	},
	{
		id: 'vanzari-lead-to-close',
		title: 'Flux Lead-to-Close',
		description: 'Mapează traseul complet al unui lead până la semnarea contractului.',
		level: 'Fundamental',
		lessons: [
			{
				id: 'vanzari-lead-to-close-mod1',
				title: 'Calificarea lead-ului',
				durationMinutes: 10,
				content: 'Definim criteriile BANT și modul de documentare în CRM.',
			},
			{
				id: 'vanzari-lead-to-close-mod2',
				title: 'Plan de contact',
				durationMinutes: 12,
				content: 'Stabilim ritmul de follow-up și mesajele pentru fiecare etapă.',
			},
			{
				id: 'vanzari-lead-to-close-mod3',
				title: 'Closing colaborativ',
				durationMinutes: 11,
				content: 'Tehnici pentru a implica stakeholderii și a accelera semnarea.',
			},
		],
		quiz: {
			id: 'quiz-vanzari-lead-to-close',
			title: 'Test: Flux Lead-to-Close',
			questions: [
				{
					id: 'lead-q1',
					text: 'Care este următorul pas după calificarea BANT?',
					options: ['Crearea ofertei', 'Plan de contact', 'Negociere', 'Onboarding'],
					answerIndex: 1,
				},
			],
		},
	},
	{
		id: 'vanzari-negociere',
		title: 'Negociere Consultativă',
		description: 'Aplică tehnici de negociere bazate pe valoare și parteneriat.',
		level: 'Intermediar',
		lessons: [
			{
				id: 'vanzari-negociere-mod1',
				title: 'Pregătirea negocierii',
				durationMinutes: 12,
				content: 'Stabilim obiectivele minime și optime și analiza stakeholderilor.',
			},
			{
				id: 'vanzari-negociere-mod2',
				title: 'Tehnici consultative',
				durationMinutes: 14,
				content: 'Folosim întrebări deschise, reformulare și opțiuni multiple pentru a menține dialogul.',
			},
			{
				id: 'vanzari-negociere-mod3',
				title: 'Închiderea negociată',
				durationMinutes: 11,
				content: 'Stabilim concesii inteligente și documentăm clar pașii următori.',
			},
		],
		quiz: {
			id: 'quiz-vanzari-negociere',
			title: 'Test: Negociere Consultativă',
			questions: [
				{
					id: 'nego-q1',
					text: 'Care este scopul unei concesii bine poziționate?',
					options: ['Să închei cât mai rapid', 'Să aduci discuția în zona de valoare', 'Să reduci costul produsului', 'Să crești presiunea'],
					answerIndex: 1,
				},
			],
		},
	},
	{
		id: 'vanzari-retentie',
		title: 'Post-vânzare și Retenție',
		description: 'Asigură o tranziție lină după vânzare și construiește programe de loialitate.',
		level: 'Avansat',
		lessons: [
			{
				id: 'vanzari-retentie-mod1',
				title: 'Onboarding și livrare',
				durationMinutes: 11,
				content: 'Stabilim checklist-ul de livrare și momentele de confirmare cu clientul.',
			},
			{
				id: 'vanzari-retentie-mod2',
				title: 'Monitorizare și health score',
				durationMinutes: 13,
				content: 'Calculăm indicatorii de sănătate a contului și alertele timpurii.',
			},
			{
				id: 'vanzari-retentie-mod3',
				title: 'Programe de retenție',
				durationMinutes: 12,
				content: 'Construim planuri de fidelizare, QBR-uri și mecanisme de upsell continuu.',
			},
		],
		quiz: {
			id: 'quiz-vanzari-retentie',
			title: 'Test: Post-vânzare și Retenție',
			questions: [
				{
					id: 'retentie-q1',
					text: 'Ce reprezintă un QBR?',
					options: ['Quarterly Business Review', 'Quick Bonus Report', 'Quality Benchmark Ratio', 'Quarterly Budget Replan'],
					answerIndex: 0,
				},
			],
		},
	},
];

export const mockCourseCategories = [
	{
		id: 'produse',
		title: 'Capitol principal · Produse',
		description: 'Tot ce ține de portofoliul de produse, configurări și poziționare premium.',
		accent: '#7dd3fc',
		courseIds: ['produse-retail', 'produse-imm', 'produse-premium'],
	},
	{
		id: 'promotii',
		title: 'Capitol principal · Promoții',
		description: 'Campanii sezoniere, pachete cross-sell și lansări rapide.',
		accent: '#f472b6',
		courseIds: ['promotii-sezoniere', 'promotii-cross-sell', 'promotii-lansari'],
	},
	{
		id: 'regulament-securitate',
		title: 'Capitol principal · Regulament & Securitate',
		description: 'Procese obligatorii de conformitate, securitate operațională și audit.',
		accent: '#c084fc',
		courseIds: ['regulament-gdpr', 'securitate-operationala', 'audit-raportare'],
	},
	{
		id: 'procese-vanzari',
		title: 'Capitol principal · Procese de vânzări',
		description: 'Fluxuri lead-to-close, negociere consultativă și retenție post-vânzare.',
		accent: '#facc15',
		courseIds: ['vanzari-lead-to-close', 'vanzari-negociere', 'vanzari-retentie'],
	},
];

export const mockRewards = [
	{ id: 'streak-3', title: 'Serie de 3 zile', description: 'Ai parcurs module 3 zile la rând.' },
	{ id: 'promo-champ', title: 'Campion Promoții', description: 'Ai finalizat toate cursurile din capitolul Promoții.' },
	{ id: 'security-guardian', title: 'Paznic de securitate', description: 'Ai trecut testele de regulament și securitate.' },
	{ id: 'sales-closer', title: 'Closer de elită', description: 'Ai dus la bun sfârșit fluxurile de vânzări.' },
	{ id: 'product-master', title: 'Maestru Produse', description: 'Ai absolvit toate modulele despre portofoliul de produse.' },
];

export const mockEvents = [
	{
		id: 'event-1',
		title: 'Curs: Portofoliu Produse Retail',
		description: 'Sesiune interactivă despre structura ofertelor retail și criteriile de eligibilitate.',
		type: 'curs',
		startDate: '2024-12-15T10:00:00',
		endDate: '2024-12-15T12:00:00',
		location: 'Sala de training - Etaj 2',
	},
	{
		id: 'event-2',
		title: 'Workshop: Tehnici de vânzare consultativă',
		description: 'Workshop practic despre abordarea consultativă în procesul de vânzări.',
		type: 'workshop',
		startDate: '2024-12-18T14:00:00',
		endDate: '2024-12-18T17:00:00',
		location: 'Sala de conferințe',
	},
	{
		id: 'event-3',
		title: 'Examen: Regulament & Securitate',
		description: 'Test de evaluare pentru capitolul Regulament & Securitate.',
		type: 'examen',
		startDate: '2024-12-20T09:00:00',
		endDate: '2024-12-20T10:30:00',
		location: 'Online',
	},
	{
		id: 'event-4',
		title: 'Webinar: Noi lansări de produse',
		description: 'Prezentare a noilor produse și oferte disponibile în portofoliu.',
		type: 'webinar',
		startDate: '2024-12-22T16:00:00',
		endDate: '2024-12-22T17:30:00',
		location: 'Online',
	},
	{
		id: 'event-5',
		title: 'Curs: Procese de vânzări - Lead to Close',
		description: 'Curs despre fluxurile complete de la lead până la închiderea vânzării.',
		type: 'curs',
		startDate: '2024-12-25T10:00:00',
		endDate: '2024-12-25T13:00:00',
		location: 'Sala de training - Etaj 2',
	},
	{
		id: 'event-6',
		title: 'Workshop: Cross-sell și up-sell',
		description: 'Workshop despre tehnici de identificare a oportunităților de cross-sell și up-sell.',
		type: 'workshop',
		startDate: '2024-12-28T14:00:00',
		endDate: '2024-12-28T16:00:00',
		location: 'Sala de conferințe',
	},
];

export const mockProfile = {
	name: 'Student Demo',
	avatarUrl: '',
	progress: [
		{ courseId: 'produse-retail', completedLessons: ['produse-retail-mod1'], quizPassed: false },
		{ courseId: 'promotii-cross-sell', completedLessons: [], quizPassed: false },
		{ courseId: 'vanzari-lead-to-close', completedLessons: ['vanzari-lead-to-close-mod1', 'vanzari-lead-to-close-mod2'], quizPassed: true },
	],
};

export function getCourseById(courseId) {
	return mockCourses.find((c) => c.id === courseId);
}

export function getCoursesForCategory(categoryId) {
	const category = mockCourseCategories.find((c) => c.id === categoryId);
	if (!category) return [];

	return category.courseIds
		.map((courseId) => getCourseById(courseId))
		.filter(Boolean);
}

export function getLesson(courseId, lessonId) {
	const course = getCourseById(courseId);
	if (!course) return null;
	return course.lessons.find((l) => l.id === lessonId) || null;
}


