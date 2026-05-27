export const site = {
  name: 'Formely',
  tagline:
    'Creezi cursuri modulare, verifici înțelegerea cu teste automate și urmărești progresul echipei — într-o singură platformă.',
  description:
    'Formely este platforma LMS pentru academii, companii și instructori: cursuri modulare, teste și examene, echipe, evenimente, bibliotecă digitală și tutor AI pe materialele tale.',
  locale: 'ro_RO',
  email: 'contact@formely.ro',
};

export const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
export const siteUrl = import.meta.env.VITE_SITE_URL || 'https://formely.ro';

export const nav = [
  { href: '/', label: 'Acasă', end: true },
  { href: '/platforma', label: 'Platformă' },
  { href: '/solutii', label: 'Soluții' },
  { href: '/preturi', label: 'Prețuri' },
  { href: '/blog', label: 'Resurse' },
  { href: '/despre', label: 'Despre' },
  { href: '/contact', label: 'Contact' },
];

export const heroStats = [
  { value: '1', label: 'platformă pentru tot fluxul', sub: 'curs · test · progres' },
  { value: '∞', label: 'cursuri și teste', sub: 'în cadrul planului tău' },
  { value: '24/7', label: 'acces cursanți', sub: 'de pe orice dispozitiv' },
];

export const trustLabels = [
  'Academii online',
  'Training corporate',
  'Centre de formare',
  'Instructori independenți',
];

export const steps = [
  {
    num: '01',
    title: 'Structurezi programul',
    text: 'Module, lecții și blocuri de conținut (video, text, fișiere). Publici când ești gata — cu versiuni de curs dacă ai nevoie.',
  },
  {
    num: '02',
    title: 'Configurezi evaluările',
    text: 'Teste la modul, bănci reutilizabile, randomizare opțională, examen final. Barem automat și feedback clar pentru cursant.',
  },
  {
    num: '03',
    title: 'Urmărești rezultatele',
    text: 'Progres pe echipe, evenimente, statistici în panoul admin și certificate la finalizare.',
  },
];

export const features = [
  {
    slug: 'cursuri',
    icon: 'layers',
    title: 'Cursuri & builder modular',
    summary:
      'Organizezi programe în module și lecții, cu blocuri de conținut și hărți de parcurs pentru studenți.',
    bullets: ['Wizard de creare în pași', 'Video, text, URL, fișiere', 'Versiuni și publicare controlată'],
  },
  {
    slug: 'evaluari',
    icon: 'check',
    title: 'Teste, bănci & examene',
    summary:
      'Evaluări la modul, bănci de întrebări reutilizabile și examene finale — cu rezultate coerente pentru cursant și instructor.',
    bullets: ['Randomizare variante', 'Încercări multiple', 'Răspunsul afișat = ce a bifat cursantul'],
  },
  {
    slug: 'progres',
    icon: 'chart',
    title: 'Progres & certificare',
    summary:
      'Reguli de deblocare, progres vizibil și certificate când cursantul finalizează programul.',
    bullets: ['Deblocare după modul/lecție', 'Hartă de parcurs', 'Certificate personalizabile'],
  },
  {
    slug: 'echipe',
    icon: 'users',
    title: 'Echipe & evenimente',
    summary:
      'Grupezi cursanții, programezi evenimente și gestionezi accesul: admin, instructor, analist, student.',
    bullets: ['Echipe și cohorte', 'Calendar evenimente', 'Mesagerie în platformă'],
  },
  {
    slug: 'biblioteca',
    icon: 'book',
    title: 'Bibliotecă digitală',
    summary: 'PDF-uri și resurse suport, cu acces per curs și cititor integrat.',
    bullets: ['Resurse centralizate', 'Acces pe curs', 'Cititor PDF în platformă'],
  },
  {
    slug: 'ai',
    icon: 'spark',
    title: 'Tutor AI contextual',
    summary:
      'Asistent antrenat pe conținutul cursurilor tale — răspunsuri legate de materialele publicate.',
    bullets: ['Indexare din cursuri', 'Răspunsuri ancorate în conținut', 'Disponibil în planurile extinse'],
  },
];

/** Pagina Platformă — conținut extins */
export const platformMeta = {
  title: 'O platformă LMS construită pentru fluxul complet de formare',
  lead:
    'De la structurarea cursului la certificatul final: creare conținut, evaluări automate, progres pe echipe, bibliotecă și rapoarte — fără unelte separate.',
};

export const platformPillars = [
  {
    icon: 'layers',
    title: 'Creezi',
    text: 'Module, lecții și blocuri de conținut într-un builder vizual.',
  },
  {
    icon: 'check',
    title: 'Evaluezi',
    text: 'Teste, bănci de întrebări și examene cu barem automat.',
  },
  {
    icon: 'chart',
    title: 'Urmărești',
    text: 'Progres, deblocări, hartă de parcurs și certificate.',
  },
  {
    icon: 'users',
    title: 'Coordonezi',
    text: 'Echipe, evenimente, mesaje și roluri pentru staff.',
  },
];

export const platformModules = [
  {
    slug: 'cursuri',
    icon: 'layers',
    title: 'Cursuri & builder modular',
    summary:
      'Organizezi programe în module și lecții, cu blocuri flexibile și publicare controlată.',
    detail:
      'Course builder-ul îți ghidează pașii: structură, conținut, evaluări, setări. Adaugi video, text, linkuri sau fișiere în fiecare lecție. Poți lucra pe versiuni și publica când programul e gata — fără să expui drafturi cursanților.',
    bullets: [
      'Wizard de creare în pași',
      'Blocuri: video, text, URL, fișiere',
      'Versiuni de curs și snapshot-uri',
      'Hartă de parcurs pentru studenți',
    ],
    navLabel: 'Cursuri',
    mock: 'builder',
  },
  {
    slug: 'evaluari',
    icon: 'check',
    title: 'Teste, bănci & examene',
    summary:
      'Verifici înțelegerea la modul sau la final de program — cu feedback corect pentru cursant.',
    detail:
      'Construiești teste din bănci reutilizabile, setezi praguri de promovare și încercări multiple. Randomizarea variantelor e opțională; la rezultate, cursantul vede exact ce a bifat — la fel și în rapoartele instructorului.',
    bullets: [
      'Teste la modul + examen final',
      'Bănci de întrebări partajate',
      'Randomizare și încercări multiple',
      'Feedback aliniat cu răspunsul cursantului',
    ],
    navLabel: 'Teste',
    mock: 'quiz',
  },
  {
    slug: 'progres',
    icon: 'chart',
    title: 'Progres & certificare',
    summary:
      'Reguli clare de deblocare, vizibilitate pentru cursant și dovezi pentru management.',
    detail:
      'Stabilești ce se deblochează după fiecare modul sau lecție. Cursantul vede unde a rămas; tu vezi cine e în întârziere. La finalizare, poți emite certificate — util pentru onboarding sau compliance.',
    bullets: [
      'Reguli per modul / lecție',
      'Procent și status per cursant',
      'Hartă vizuală a parcursului',
      'Certificate la finalizare',
    ],
    navLabel: 'Progres',
    mock: 'progress',
  },
  {
    slug: 'echipe',
    icon: 'users',
    title: 'Echipe & evenimente',
    summary:
      'Grupezi cursanții pe cohortă sau departament și programezi sesiuni live.',
    detail:
      'Creezi echipe, asignezi cursuri și urmărești progresul la nivel de grup. Calendarul de evenimente le amintește cursanților de sesiuni live. Mesageria ține conversațiile în platformă, nu în emailuri pierdute.',
    bullets: [
      'Echipe și asignare cursuri',
      'Evenimente cu participanți',
      'Mesagerie cursant ↔ staff',
      'Roluri: admin, instructor, analist',
    ],
    navLabel: 'Echipe',
    mock: 'teams',
  },
  {
    slug: 'biblioteca',
    icon: 'book',
    title: 'Bibliotecă digitală',
    summary:
      'Centralizezi PDF-uri și resurse suport, cu acces controlat per curs.',
    detail:
      'Încarci documente de referință, politici sau materiale suplimentare. Cursanții le accesează din același cont, cu cititor integrat — fără linkuri externe dispersate.',
    bullets: [
      'PDF-uri și fișiere suport',
      'Acces per curs sau global',
      'Cititor în platformă',
      'Organizare și căutare',
    ],
    navLabel: 'Bibliotecă',
    mock: 'library',
  },
  {
    slug: 'ai',
    icon: 'spark',
    title: 'Tutor AI contextual',
    summary:
      'Asistent pe materialele tale — nu răspunsuri generice de pe internet.',
    detail:
      'Conținutul cursurilor este indexat pentru întrebări din partea cursanților. Răspunsurile se bazează pe ce ai publicat tu — util pentru clarificări 24/7, mai ales în programe mari sau asincrone.',
    bullets: [
      'Indexare din cursuri publicate',
      'Răspunsuri ancorate în conținut',
      'Suport pentru studenți între sesiuni',
      'Disponibil în planurile extinse',
    ],
    navLabel: 'Tutor AI',
    mock: 'ai',
  },
];

export const platformRoles = [
  {
    id: 'admin',
    title: 'Administrator',
    description: 'Configurează platforma, cursuri, utilizatori și setări globale.',
    access: ['Panou admin complet', 'Statistici și rapoarte', 'Gestionare echipe și cursuri'],
  },
  {
    id: 'instructor',
    title: 'Instructor',
    description: 'Creează și actualizează conținutul programelor la care e asignat.',
    access: ['Course builder', 'Teste și bănci de întrebări', 'Progres cursanți asignați'],
  },
  {
    id: 'analyst',
    title: 'Analist',
    description: 'Vizualizează date și rapoarte — fără modificare conținut.',
    access: ['Statistici read-only', 'Export pentru management', 'Fără editare cursuri'],
  },
  {
    id: 'student',
    title: 'Cursant',
    description: 'Parcurge cursuri, susține teste și descarcă certificate.',
    access: ['Lecții și resurse', 'Teste și examene', 'Progres și mesaje'],
  },
];

export const platformIncluded = [
  'Interfață responsive — desktop și mobil',
  'Tema light / dark (sincronizată cu preferința ta)',
  'Hosting, actualizări și backup',
  'Conformitate GDPR — date în UE',
];

export const solutionsMeta = {
  title: 'Același LMS. Trei moduri de a-l folosi.',
  lead:
    'Academii, companii și instructori independenți au nevoi diferite — Formely se adaptează fără să schimbi platforma la fiecare scalare.',
};

export const solutionsShared = [
  'Un singur flux: curs → test → progres → certificat',
  'Roluri separate pentru staff și cursanți',
  'Scalezi de la 20 la mii de utilizatori',
  'Demo și pilot pe scenariul tău real',
];

export const solutions = [
  {
    slug: 'academii',
    icon: 'graduation',
    navLabel: 'Academii',
    title: 'Academii & școli online',
    headline: 'Cohorte clare, evaluări automate, rapoarte pentru instructori',
    description:
      'Fiecare program are structură vizibilă: module, teste la final și progres per student — fără exporturi manuale din mai multe unelte.',
    detail:
      'Lansezi cohorte cu început și final clare. Instructorii văd cine a promovat testele; coordonatorii văd progresul pe program. Evenimentele live rămân legate de același curs — studenții nu pierd firul.',
    bullets: [
      'Înscrieri și acces pe curs',
      'Teste la final de modul',
      'Progres și rezultate centralizate',
      'Evenimente pentru sesiuni live',
    ],
    challenges: [
      'Studenții abandonează când nu văd progresul',
      'Evaluările sunt corectate manual sau în tool-uri separate',
      'Rapoartele pentru instructori durează ore',
    ],
    outcomes: [
      'Parcurs modular cu obiective clare per săptămână',
      'Teste automate cu feedback instant',
      'Dashboard pentru fiecare cohortă',
    ],
    featuresUsed: ['Cursuri modulare', 'Teste & examene', 'Progres', 'Evenimente'],
    planSlug: 'academy',
    planName: 'Plan Academy',
    metric: 'Potrivit plan Academy',
    mock: 'academy',
  },
  {
    slug: 'corporate',
    icon: 'building',
    navLabel: 'Corporate',
    title: 'Training corporate',
    headline: 'Onboarding și compliance cu dovezi de finalizare',
    description:
      'Echipe pe departament, training obligatoriu și statistici pentru management — util la audit și raportare internă.',
    detail:
      'HR și L&D configurează programe obligatorii pe departament sau locație. Vezi cine a finalizat, cine e în întârziere și poți exporta dovezi pentru audit. Biblioteca ține politicile și procedurile la un click distanță.',
    bullets: [
      'Echipe pe departament sau locație',
      'Cursuri obligatorii și termene',
      'Statistici în panoul admin',
      'Bibliotecă pentru politici și proceduri',
    ],
    challenges: [
      'Onboarding repetat pe fiecare departament',
      'Lipsă de dovezi clare la audit',
      'Training dispersat în PDF-uri și email',
    ],
    outcomes: [
      'Același flux pentru toate echipele',
      'Certificate și istoric de finalizare',
      'Rapoarte pentru management și analiști',
    ],
    featuresUsed: ['Echipe', 'Progres & certificate', 'Bibliotecă', 'Statistici'],
    planSlug: 'enterprise',
    planName: 'Plan Enterprise',
    metric: 'Potrivit plan Enterprise',
    mock: 'corporate',
  },
  {
    slug: 'instructori',
    icon: 'user',
    navLabel: 'Instructori',
    title: 'Instructori & consultanți',
    headline: 'Predare și evaluare fără stack complicat',
    description:
      'Publici cursuri, adaugi lecții și verifici înțelegerea din aceeași interfață — focus pe conținut, nu pe administrare.',
    detail:
      'Ideal pentru programe proprii sau clienți cu grupuri mici. Structurezi cursul în builder, reutilizezi bănci de întrebări și comunici cu cursanții din platformă — fără WordPress + Google Forms + Zoom notes.',
    bullets: [
      'Builder vizual, fără cod',
      'Bănci de întrebări reutilizabile',
      'Comunicare cu cursanții',
      'Grupuri mici de studenți',
    ],
    challenges: [
      'Prea multe unelte pentru un singur program',
      'Timp pierdut pe administrare, nu pe conținut',
      'Feedback la teste neclar pentru cursanți',
    ],
    outcomes: [
      'Tot programul într-o singură interfață',
      'Teste cu răspuns clar pentru cursant',
      'Lansare rapidă — primele cursuri în zile',
    ],
    featuresUsed: ['Course builder', 'Bănci de întrebări', 'Mesagerie', 'Certificate'],
    planSlug: 'echipa',
    planName: 'Plan Echipă',
    metric: 'Potrivit plan Echipă',
    mock: 'instructor',
  },
];

export const testimonials = [
  {
    quote:
      'În sfârșit vedem cine a terminat modulul și cine are nevoie de suport — fără să exportăm manual din trei locuri diferite.',
    name: 'Maria D.',
    role: 'Coordonatoare program, academie online',
  },
  {
    quote:
      'La teste, feedback-ul arată exact ce a bifat cursantul. Nu mai apar discuții despre „nota greșită”.',
    name: 'Andrei P.',
    role: 'Instructor, training tehnic',
  },
  {
    quote:
      'Același flux pentru toate departamentele: curs, test, certificat. Onboarding-ul s-a simplificat mult.',
    name: 'Elena R.',
    role: 'HR Learning & Development',
  },
];

/** Pagina Prețuri */
export const pricingMeta = {
  title: 'Prețuri clare, fără surprize la facturare',
  lead:
    'Ofertele sunt personalizate după cursanți activi, roluri staff și module — primești propunerea scrisă înainte de semnare.',
  headline: 'Plătești pentru cursanți și capabilități — nu pentru „licențe” ascunse',
  subline:
    'Funcțiile standard LMS (cursuri, teste, progres, certificate) sunt incluse în plan. Costuri extra doar la module premium sau servicii profesionale.',
  pilotTitle: 'Pilot de evaluare',
  pilotText:
    'După demo, poți rula un pilot (de obicei 14–30 zile) cu un curs real, instructori și un grup de cursanți — ca să vezi fluxul înainte de contract.',
};

export const pricingSteps = [
  {
    num: '1',
    title: 'Demo pe scenariul tău',
    text: '30–45 min: curs, test, progres — nu un tur generic.',
  },
  {
    num: '2',
    title: 'Ofertă scrisă',
    text: 'Volum cursanți, plan recomandat, ce e inclus și ce e opțional.',
  },
  {
    num: '3',
    title: 'Pilot opțional',
    text: '14–30 zile cu date reale, apoi decizia de contract.',
  },
];

export const aboutMeta = {
  title: 'Formarea bună se vede în date, nu în promisiuni',
  lead:
    'Formely există pentru echipe care livrează programe reale — cu început, mijloc, evaluare și final clar pentru fiecare cursant.',
};

export const aboutMission = {
  title: 'Misiunea noastră',
  text: 'Eliminăm haosul dintre conținut, evaluare și progres. Instructorii predau; platforma se ocupă de structură, teste corecte și vizibilitate — astfel încât nimeni să nu rămână pierdut după modulul 2.',
};

export const aboutDifferentiators = [
  {
    title: 'Feedback corect la teste',
    text: 'Cursantul vede exact ce a bifat — la fel ca în raportul instructorului. Fără discrepanțe între scor și afișare.',
  },
  {
    title: 'Structură modulară nativă',
    text: 'Programe = module, lecții, reguli de deblocare — nu un folder de fișiere fără parcurs clar.',
  },
  {
    title: 'Tutor AI pe conținutul tău',
    text: 'Răspunsuri ancorate în materialele publicate, nu un chatbot generic de pe internet.',
  },
  {
    title: 'Roluri pentru echipe mari',
    text: 'Admin, instructor, analist și cursant — fiecare cu accesul potrivit.',
  },
];

export const aboutValues = [
  {
    title: 'Claritate',
    text: 'Interfață în română, flux predictibil, un obiectiv clar per ecran pentru cursant și staff.',
  },
  {
    title: 'Corectitudine',
    text: 'Evaluările și afișarea rezultatelor sunt consecvente — scorul spune același lucru ca feedback-ul.',
  },
  {
    title: 'Accesibilitate',
    text: 'Contrast, navigare cu tastatura, motion redus — formare incluzivă pentru toți utilizatorii.',
  },
];

export const aboutTimeline = [
  { label: 'Structură', text: 'Cursuri modulare cu builder vizual' },
  { label: 'Evaluare', text: 'Teste, bănci, examene automate' },
  { label: 'Rezultate', text: 'Progres, echipe, certificate' },
];

export const contactMeta = {
  title: 'Hai să vorbim despre programul tău',
  lead: 'Completează formularul sau scrie-ne direct — revenim în 24–48h lucrătoare cu propunere de demo sau ofertă.',
};

export const contactReasons = [
  { value: 'demo', label: 'Demo platformă' },
  { value: 'oferta', label: 'Ofertă / prețuri' },
  { value: 'pilot', label: 'Pilot de evaluare' },
  { value: 'altceva', label: 'Altceva' },
];

export const contactPerks = [
  {
    title: 'Ce include demo-ul',
    text: 'Parcurgere live: structură curs, test cu feedback corect, progres pe echipă — pe scenariul tău.',
  },
  {
    title: 'După demo',
    text: 'Ofertă scrisă, plan de onboarding și opțiune pilot — fără presiune să semnezi imediat.',
  },
  {
    title: 'Pregătește (opțional)',
    text: 'Nr. cursanți estimat, tip materiale (video/PDF), nevoi compliance sau certificare.',
  },
];

export const contactResponse = {
  title: 'Timp de răspuns',
  items: ['Email: 24–48h lucrătoare', 'Demo: programat în 3–5 zile lucrătoare', 'Ofertă: după demo sau la cerere'],
};

export const pricingExtras = [
  'Migrare masivă de conținut',
  'Training on-site pentru instructori',
  'Tutor AI la volum mare',
  'Integrări custom / API',
];

export const pricingPlans = [
  {
    id: 'echipa',
    name: 'Echipă',
    audience: 'Instructori · programe mici',
    price: 'La cerere',
    priceDetail: 'orientativ: până la ~75 cursanți activi / lună',
    description: 'Pentru freelanceri, consultanți sau echipe mici care lansează 1–3 programe.',
    features: [
      'Cursuri, module și lecții nelimitate',
      'Teste, bănci de întrebări, examene',
      'Progres, deblocări și certificate',
      '1–2 conturi staff (admin, instructor)',
      'Suport email (răspuns în 48h lucrătoare)',
    ],
    cta: 'Cere ofertă Echipă',
    highlighted: false,
    bestFor: 'Instructori · consultanți · programe mici',
    solutionSlug: 'instructori',
  },
  {
    id: 'academy',
    name: 'Academy',
    audience: 'Academii · centre de formare',
    price: 'La cerere',
    priceDetail: 'orientativ: până la ~300 cursanți activi / lună',
    description: 'Pentru programe cu mai multe cohorte, instructori și raportare regulată.',
    features: [
      'Tot din planul Echipă',
      'Roluri: admin, instructor, analist',
      'Echipe / cohorte și evenimente',
      'Bibliotecă digitală',
      'Statistici și export pentru management',
      'Suport prioritar (24h lucrătoare)',
    ],
    cta: 'Programează demo',
    highlighted: true,
    bestFor: 'Academii · centre de formare · cohorte',
    solutionSlug: 'academii',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'Corporate · multi-departament',
    price: 'Personalizat',
    priceDetail: '300+ cursanți sau cerințe speciale',
    description: 'Pentru organizații cu volume mari, branding sau integrări dedicate.',
    features: [
      'Tot din planul Academy',
      'Tutor AI pe conținutul organizației',
      'Implementare și migrare conținut',
      'Domeniu / branding (white-label la cerere)',
      'Integrări și API — discutate la ofertă',
      'Manager de cont și SLA opțional',
    ],
    cta: 'Discută Enterprise',
    highlighted: false,
    bestFor: 'Corporate · multi-departament · compliance',
    solutionSlug: 'corporate',
  },
];

/** Rânduri pentru tabel comparativ: [echipa, academy, enterprise] */
export const pricingCompareRows = [
  { feature: 'Cursanți activi (orientativ)', echipa: 'până la ~75', academy: 'până la ~300', enterprise: '300+' },
  { feature: 'Cursuri, teste, examene', echipa: true, academy: true, enterprise: true },
  { feature: 'Bănci de întrebări', echipa: true, academy: true, enterprise: true },
  { feature: 'Progres & certificate', echipa: true, academy: true, enterprise: true },
  { feature: 'Echipe & evenimente', echipa: '—', academy: true, enterprise: true },
  { feature: 'Bibliotecă digitală', echipa: '—', academy: true, enterprise: true },
  { feature: 'Tutor AI contextual', echipa: '—', academy: 'opțional', enterprise: true },
  { feature: 'Rol analist (read-only)', echipa: '—', academy: true, enterprise: true },
  { feature: 'Implementare / migrare', echipa: '—', academy: 'opțional', enterprise: true },
  { feature: 'SSO / SAML', echipa: '—', academy: '—', enterprise: 'la cerere' },
];

export const pricingIncludedAll = [
  'Hosting în UE și actualizări de platformă',
  'Conformitate GDPR — datele rămân ale organizației tale',
  'SSL și acces securizat (HTTPS)',
  'Onboarding inițial: structură curs + prim test',
];

export const pricingFaq = [
  {
    q: 'Cum se calculează prețul final?',
    a: 'Luăm în calcul numărul de cursanți activi (cât de despre se autentifică și parcurg cursuri), numărul de conturi staff, dacă activezi tutor AI sau biblioteca la scară mare, și nivelul de suport. Primești o ofertă scrisă înainte de semnare.',
  },
  {
    q: 'Există costuri ascunse pentru teste sau cursuri?',
    a: 'Nu pentru funcțiile standard LMS: cursuri, module, teste, bănci, examene, progres și certificate sunt incluse în plan. Costuri suplimentare apar doar la module premium (ex. AI intensiv) sau servicii profesionale (migrare masivă, training on-site).',
  },
  {
    q: 'Pot începe cu un pilot înainte de contract?',
    a: 'Da. După demo oferim de obicei un pilot de 14–30 zile cu un scenariu real — un curs, câțiva instructori și un grup de cursanți — ca să validați fluxul în organizație.',
  },
  {
    q: 'Ce înseamnă „cursant activ”?',
    a: 'Un utilizator cu rol de student care accesează platforma în perioada de facturare (de ex. o lună). Conturile staff (admin, instructor) se numără separat, conform ofertei.',
  },
  {
    q: 'Oferiți reduceri pentru ONG sau educație publică?',
    a: 'Da, la cerere. Contactează-ne cu contextul organizației și volumul estimat.',
  },
];

export const faq = [
  {
    q: 'Ce include Formely față de un site de cursuri sau un drive cu fișiere?',
    a: 'Formely este LMS complet: structură modulară, evaluări automate, progres și deblocări, echipe, evenimente, bibliotecă, mesagerie, panou admin cu statistici și (în planurile extinse) tutor AI pe conținutul tău.',
  },
  {
    q: 'Pot migra cursurile existente?',
    a: 'Da. Te ajutăm la structurarea modulelor, încărcarea conținutului și configurarea primelor teste. Durata depinde de volum — de la câteva zile la câteva săptămâni pentru programe mari.',
  },
  {
    q: 'Cum funcționează testele cu variante amestecate?',
    a: 'Cursantul vede opțiunile într-o ordine randomizată (dacă activezi). La trimitere, notarea și textul „Răspunsul tău” reflectă exact selecția — același lucru pe care îl vede instructorul în statistici.',
  },
  {
    q: 'Este potrivit pentru training obligatoriu (compliance)?',
    a: 'Da: cursuri obligatorii, echipe pe departament, progres urmărit și certificate. Pentru audit, discutăm ce exporturi îți trebuie (plan Academy / Enterprise).',
  },
  {
    q: 'Cum obțin demo sau ofertă?',
    a: 'Completează formularul de contact sau scrie la contact@formely.ro. Programăm un demo de 30–45 minute pe scenariul tău și, dacă e cazul, un pilot.',
  },
];

export const blogMeta = {
  title: 'Idei practice pentru programe care se termină',
  lead: 'Articole scurte, aplicabile imediat — structură modulară, evaluări și progres în LMS.',
};

export const blogPosts = [
  {
    slug: 'structura-curs-modular-lms',
    title: 'De ce programele modulare au rată mai mare de finalizare',
    excerpt:
      'Obiective clare per modul, evaluare la momentul potrivit și progres vizibil — ce schimbă în comportamentul cursanților.',
    date: '20 mai 2026',
    readMinutes: 6,
    category: 'Strategie',
  },
  {
    slug: 'feedback-corect-la-teste-online',
    title: 'Feedback la teste: de ce „corect” trebuie să coincidă cu ce a bifat cursantul',
    excerpt:
      'Randomizarea e utilă la evaluare — afișarea rezultatului trebuie să fie la fel de riguroasă ca notarea.',
    date: '12 mai 2026',
    readMinutes: 5,
    category: 'Produs',
  },
];

/** Conținut articole — secțiuni h2 + paragrafe */
export const blogPostBodies = {
  'structura-curs-modular-lms': [
    {
      heading: 'De ce modulele bat „cursul lung”',
      paragraphs: [
        'Când cursantul nu știe unde e în program, abandonează. Un modul = un obiectiv clar + evaluare la final. Formely forțează această logică în builder și în experiența studentului — progresul nu e opțional, e vizibil.',
      ],
    },
    {
      heading: 'Evaluarea la momentul potrivit',
      paragraphs: [
        'Testul de modul confirmă înțelegerea înainte de conținut nou. Nu înlocuiește predarea — o ancoră în date: cine e gata să avanseze, cine are nevoie de suport.',
      ],
    },
    {
      heading: 'Ce poți face mâine',
      paragraphs: [
        'Împarte un curs existent în 3–4 module, adaugă un test scurt la finalul fiecăruia și urmărește finalizarea în panoul de progres. Diferența apare de obicei în primele 2 săptămâni.',
      ],
    },
  ],
  'feedback-corect-la-teste-online': [
    {
      heading: 'Problema nu e randomizarea — e afișarea',
      paragraphs: [
        'Amestecul variantelor e util împotriva memorării mecanice. Dar dacă după trimitere cursantul vede „Variantă incorectă” la o întrebare notată corect, încrederea în platformă scade instant.',
      ],
    },
    {
      heading: 'Ce înseamnă feedback corect',
      paragraphs: [
        'Notarea și textul „Răspunsul tău” trebuie să reflecte aceeași selecție — indiferent de ordinea afișată pe ecran. Formely aliniază indicii de afișare cu ce e salvat la evaluare.',
      ],
    },
    {
      heading: 'Pentru instructori',
      paragraphs: [
        'Mai puține contestații, mai mult timp pentru conținut. Și rapoarte în care procentul de promovare = ce a înțeles grupa, nu artefacte tehnice.',
      ],
    },
  ],
};

export function getBlogPost(slug) {
  return blogPosts.find((p) => p.slug === slug);
}
