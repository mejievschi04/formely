# Analiza proiectului Formely — 16 octombrie 2026

Analiza urmărește arhitectura, procesele comerciale și educaționale, autorizarea, AI, stocarea, testarea și operarea. Este bazată pe codul local, inclusiv modificările necomise existente, și pe verificările automate descrise mai jos. Nu certifică infrastructura de producție sau fiecare ramură din cod. Nu am schimbat implementarea și nu am accesat datele ori serviciile de producție.

**Evaluare generală.** Formely este un LMS SaaS cu o bază funcțională substanțială, separare între operatorul platformei și academii, versionare de cursuri și teste relevante pentru integritatea proceselor. Principalele riscuri identificate sunt accesul direct la fișiere, recuperarea pe PostgreSQL, contabilizarea AI sub concurență și deploy-ul. Numărul de teste este un punct pozitiv; configurația actuală verifică preponderent SQLite și cereri secvențiale, deci nu demonstrează comportamentul în producție sub concurență.

**Metodă și rezultate executate**

| Verificare | Rezultat local |
|---|---|
| Backend: `php vendor/bin/phpunit` | 316 teste raportate, 1.479 assertions, 1 omis explicit, fără eșecuri |
| Frontend: `npm test` | 37 teste trecute |
| Frontend: `npm run lint` | 0 erori, 48 avertismente, 239 fișiere analizate |
| Frontend: `npm run build` | Reușit |
| Website: `npm run build` | Reușit, inclusiv SSR și prerandarea a patru rute |
| Backoffice: `npm run build` | Reușit |

PHP local: 8.5.6; CI declară PHP 8.2. Testele backend folosesc SQLite în memorie, coadă sincronă și furnizori AI dezactivați. Testul omis este importul de backup din zona academiei, blocat intenționat în modelul SaaS. Nu am executat teste E2E în browser, teste de încărcare, apeluri AI reale, livrări SMTP sau restaurare PostgreSQL. Build-ul nu validează interacțiunile din browser. Nu am făcut audit de vulnerabilități al dependențelor pe baza unor baze externe actualizate.

**1. Arhitectura și responsabilitățile**

| Zonă | Implementare | Responsabilitate |
|---|---|---|
| API | Laravel 12, Sanctum | Autentificare, tenant, LMS, AI, operațiuni platformă |
| LMS | React 18, React Router 7, Vite | Interfața cursantului și administrarea academiei |
| Backoffice | React 18, React Router 6, Vite | Clienți, lead-uri, conversie, academii, statistici comerciale |
| Website | React, Vite, SSR/prerender | Marketing multilingv, solicitări de acces și tracking |
| Persistență producție | PostgreSQL 16 | Date, sesiuni și coada implicită de joburi |
| Operare | Docker Compose, Nginx, PHP-FPM | Servire aplicații, worker și scheduler |

Separarea celor trei interfețe este coerentă cu tipurile de utilizatori. Backend-ul central simplifică regulile comune, dar concentrează riscul: o migrare sau o restaurare greșită poate afecta toate academiile. Volumele de stocare și cache sunt comune între backend, queue și scheduler.

Codul inspectat include 170 fișiere în `backend/app`, 85 în `backend/tests`, 321 în `frontend/src`, 19 în `backoffice/src` și 47 în `website/src`. Aceste numere descriu dimensiunea suprafeței, nu calitatea sau acoperirea testelor.

**2. Harta proceselor**

| Proces | Traseu implementat | Evaluare |
|---|---|---|
| Achiziție client | Website → `/api/leads` → backoffice → conversie în companie | Date de atribuire și consimțământ; verificarea conversiei simultane trebuie întărită |
| Activare academie | Plan și trial → invitație proprietar → acceptare → sesiune | Model bazat pe vânzare și invitații; înregistrarea publică este oprită implicit |
| Autentificare | Sanctum SPA → verificare cont → verificare companie → tenant | Regenerare sesiune, CSRF și limitare de cereri; obligativitatea schimbării parolei este incompletă la API |
| Administrare | Operator platformă separat de admin/instructor/analist | Middleware distinct; teste pentru ownership și acțiuni interzise |
| Autorat curs | Draft → structură module/lecții/blocuri → validare → publicare | Pipeline central de publicare, tranzacție și snapshot |
| Distribuire | Cursuri, mape, echipe și asignări individuale | Servicii dedicate și teste pentru vizibilitate/asignări |
| Învățare | Acces → lecție → progres → teste → finalizare | Progres agregat, reguli de deblocare, păstrarea progresului la versiuni noi |
| Evaluare | Deschidere tentativă → snapshot → autosave → submit → corectare | Protecții solide în ramura `Test`; ramura `Exam` necesită uniformizare |
| AI | Feature de plan → cotă → furnizor → validare/persistență → consum | Consum după succes; fereastră de concurență între verificare și debitare |
| Cunoștințe AI | Lecții/blocuri → chunks → embeddings → selecție context | Indexare în joburi și limite de candidați; nu este o căutare vectorială completă la scară mare |
| Notificări | Eveniment → notificare internă/email → queue → retry | Invitațiile au status, rotație token și dispatch după commit |
| Ciclu comercial | Trial → activ/suspendat → eventual ștergere | Expirare programată și blocare la API; facturarea este încă manuală |
| Backup | Scheduler → dump DB + copiere storage → director local | Implementat, dar insuficient pentru recuperare verificată pe PostgreSQL |
| Deploy | Pull → build → pornire → migrare/cache → restart → health | Procedură existentă, fără rollback automat și fără prag ferm de succes |

**3. Constatări prioritare**

Priorități: P1 = rezolvare înainte de extinderea utilizării sau a datelor confidențiale; P2 = următoarea etapă de stabilizare; P3 = întreținere. „Confirmat din cod” înseamnă că mecanismul este vizibil în implementare, nu că am reprodus incidentul în producție.

**F1 — P1: materialele academiilor pot fi accesate prin URL direct. Confirmat din cod.**

`CourseBuilderController::uploadContentFile()` salvează în `public`, cu URL `/storage/content-blocks/...`. `LibraryController::storeFileItem()` salvează documentele în `public/library`. În `docker/nginx-backend.conf`, `/storage/` este un alias direct către `storage/app/public`, fără autentificare Laravel. Verificările tenantului și ale înscrierii din API nu se aplică unei cereri către acest URL.

Impact: cine cunoaște URL-ul poate accesa fișierul fără sesiune, inclusiv după suspendarea contului. Numele aleatoare reduc posibilitatea de ghicire, dar nu revocă linkurile distribuite. Nu am demonstrat enumerarea fișierelor sau accesul la metadatele altui tenant.

Remediere: fișierele private pe disc privat, acces prin autorizare și `X-Accel-Redirect` ori URL-uri semnate cu expirare; păstrarea publică doar a activelor intenționat publice. Migrarea trebuie să includă linkurile existente și verificarea accesului după revocare.

**F2 — P1: backup-ul PostgreSQL nu este un snapshot coerent și scalabil. Confirmat din cod.**

Pentru PostgreSQL, `LmsBackupService::dumpDatabase()` ajunge în `dumpAllTablesJson()`: citește fiecare tabel separat și păstrează toate rândurile într-un payload în memorie. Nu există o tranzacție cu snapshot comun în jurul exportului. Fișierele sunt copiate ulterior.

Impact: scrierile simultane pot produce un export cu tabele din momente diferite; volumele mari cresc consumul de memorie. Baza și fișierele nu reprezintă obligatoriu același moment.

Remediere: backup nativ PostgreSQL și procedură explicită pentru consistența fișierelor, copiere externă, verificarea integrității și restaurări periodice într-un mediu izolat. Documentația include deja un exemplu manual cu `pg_dump`, dar acesta nu este motorul backup-ului programat.

**F3 — P1: restaurarea nu resetează secvențele PostgreSQL. Confirmat din cod; impactul exact necesită restaurare PostgreSQL.**

`replaceTables()` șterge rânduri și inserează ID-uri explicite, fără reajustarea secvențelor. Într-o bază nouă sau cu secvențe rămase în urma ID-urilor restaurate, următoarele inserări pot intra în conflict. De asemenea, mecanismul Laravel folosit pentru „dezactivarea” cheilor externe pe PostgreSQL emite `SET CONSTRAINTS ALL DEFERRED`; aceasta nu dezactivează constrângerile care nu sunt deferrable. Ordinea ștergerii/inserării și cascadele trebuie verificate pe schema reală.

Remediere: restaurare nativă cu secvențe și dependențe, urmată de verificări de integritate și de creare a unor înregistrări noi. Un test SQLite reușit nu certifică această operație.

**F4 — P1: backup-urile nu au retenție sau replicare externă în fluxul inspectat. Confirmat pentru repository.**

Backup-urile sunt create sub `storage/app/lms-backups`, în stocarea locală a aplicației. Nu am identificat curățare după retenție, upload extern sau verificare de spațiu în acest proces. Setarea `backup_enabled` este implicit falsă dacă lipsește.

Impact: acumulare până la umplerea discului; pierderea VPS-ului poate elimina simultan datele și copiile locale. Nu pot stabili dacă există backup-uri externe configurate separat de repository.

Remediere: retenție zilnică/săptămânală/lunară, copie externă și alertă pentru backup întârziat sau eșuat. Stabilirea și măsurarea timpului de recuperare și a pierderii maxime de date acceptate.

**F5 — P1: două cereri AI pot trece verificarea pentru aceleași credite. Confirmat din cod.**

`AiQuotaGate` separă `assertAvailable()` de `recordSuccess()`. `assertCan()` blochează rândul doar în tranzacția scurtă de verificare; blocarea se încheie înaintea apelului extern. Două cereri pot trece, ambele pot genera cost la furnizor, iar a doua debitare poate fi refuzată după generare. Contorul are protecție la actualizare, dar costul extern nu este rezervat.

Impact: cost extern fără rezultat livrat sau contabilizat complet, plus erori la finalul unei generări. În unele ramuri persistarea precede înregistrarea consumului, ceea ce complică reluarea cererii.

Remediere: rezervare atomică înainte de apel, identificator de operație, finalizare la succes și eliberare la eșec; tratarea explicită a operațiilor abandonate. Test concurent cu un singur credit disponibil și două cereri.

**F6 — P2: schimbarea obligatorie a parolei nu este impusă de middleware-ul API. Confirmat din cod.**

Crearea/resetarea administrativă setează `must_change_password=true`, iar autentificarea returnează acest indicator. Middleware-ul de cont verifică `pending` și `suspended`, dar nu indicatorul de parolă; nici grupurile de rute inspectate nu au o astfel de restricție.

Impact: clientul poate continua să apeleze API-ul cu parola temporară fără să urmeze modalul din interfață.

Remediere: când indicatorul este activ, acces permis doar la identificare, schimbarea parolei și logout. Verificare directă prin API, nu doar prin interfață.

**F7 — P2: ramurile `Test` și `Exam` nu au aceleași garanții la submit. Confirmat structural; necesită reproducere concurentă.**

`ExamController::submitTest()` folosește tranzacție și blocarea tentativei, cu tratare pentru submit repetat. `submitExam()` calculează numărul următor din rezultate și creează `ExamResult` fără același înveliș tranzacțional și fără aceeași recuperare a rezultatului existent. Există constrângere unică pe examen/utilizator/număr tentativă, care limitează duplicatele, dar nu garantează un răspuns idempotent.

Impact probabil: două submit-uri simultane pentru aceeași tentativă pot produce un conflict în locul returnării aceluiași rezultat. Testul numit `ConcurrentExamSubmitTest` verifică ramura `Test` prin cereri secvențiale, nu două procese simultane.

Remediere: aceeași abstracție de tentativă și finalizare pentru ambele motoare; test real cu două conexiuni PostgreSQL și același identificator de tentativă.

**F8 — P2: deploy-ul poate raporta finalizare chiar dacă healthcheck-ul eșuează. Confirmat din cod.**

`scripts/deploy-vps.sh` afișează codul HTTP și instrucțiuni de diagnostic când acesta nu este 200, apoi continuă. Nu există rollback automat. Migrarea este lansată atât în entrypoint, cât și în script; serviciile sunt pornite înaintea migrării explicite din script. Procedura folosește o așteptare fixă și restarturi, fără o etapă controlată de tranziție între scheme.

Remediere: healthcheck cu retry și exit nenul la eșec; versiune identificabilă a imaginilor, backup înaintea modificărilor riscante, migrații compatibile între versiuni și procedură testată de rollback. Evitarea rulării migrărilor în două locuri.

**F9 — P2: conversia aceluiași lead nu este serializată. Confirmat din cod; necesită test concurent.**

`LeadAdminController::convert()` citește lead-ul și verifică `company_id` înainte de tranzacție. În tranzacție creează compania și actualizează lead-ul fără reîncărcare cu `lockForUpdate()`.

Impact posibil: două conversii pot concura; slug-urile identice pot provoca un conflict, iar cereri cu slug-uri diferite pot crea două companii pentru aceeași oportunitate. Verificarea inițială nu este suficientă pentru exclusivitate.

Remediere: blocarea lead-ului în tranzacție, reverificarea stării și răspuns idempotent pentru o conversie deja realizată.

**F10 — P2: ștergerea academiei amestecă tranzacția DB cu ștergeri ireversibile de fișiere. Confirmat din cod.**

`CompanyDeletionService` șterge fișiere media și logo/director în interiorul tranzacției DB. Un rollback ulterior nu poate recupera acele fișiere. În plus, biblioteca folosește căi globale `library/...`, iar ștergerea generică a rândurilor `library_items` nu șterge explicit toate fișierele lor.

Impact: date DB restaurate de rollback cu fișiere lipsă sau fișiere orfane după ștergere reușită. Ștergerea completă a unei academii trebuie validată și pentru toate categoriile de fișiere.

Remediere: inventar de fișiere și proces de ștergere reluabil, cu operații externe după commit, stare de progres și verificarea orfanilor. Aplicarea aceleiași discipline la înlocuirea imaginilor.

**F11 — P2: CI nu testează motorul de producție și nici fluxurile E2E. Confirmat.**

`.github/workflows/quality.yml` rulează backend pe SQLite. Pentru frontend rulează lint, teste Node și build; pentru website/backoffice doar build. Există teste Playwright locale, dar nu sunt invocate în workflow. Configurația lor folosește Chrome instalat și un backend SQLite separat.

Remediere: job PostgreSQL pentru migrări, restaurare și concurență; E2E pentru login, invitație, publicare, asignare, evaluare și suspendare. Website/backoffice au nevoie de verificarea fluxului comercial complet. Păstrarea SQLite ca verificare rapidă este utilă.

**4. Reguli de produs care trebuie explicite**

- **Finalizarea cursului are prag fix de 80%.** `CourseProgressService` folosește `COURSE_COMPLETION_TEST_PERCENT=80`, independent de unele praguri configurabile ale testelor. `RequiredCourseTestsTest` confirmă intenționat că un test promovat cu 70% nu finalizează cursul. Nu clasific acest comportament drept bug: este o regulă implementată și testată. Interfața trebuie să explice diferența dintre „test promovat” și „condiție de finalizare curs îndeplinită”.
- **Un email corespunde unui cont pe platformă.** Invitațiile și unicitatea utilizatorilor sunt globale. Dacă aceeași persoană trebuie să aparțină mai multor academii, modelul actual necesită o decizie de produs și o relație de membership, nu doar relaxarea unei validări.
- **Facturarea nu este automatizată.** Backoffice-ul are pipeline comercial și date pentru facturare; `Invoices.jsx` precizează că nu există încă modul de facturi PDF. Nu am identificat un proces complet de plată/abonament în rutele și serviciile inspectate. Activarea planului și încasarea trebuie reconciliate operațional.
- **Cotele AI reprezintă un pool comun de credite.** Valorile `used` pe acțiuni sunt derivate matematic din totalul creditelor; nu reprezintă numărul real istoric de cursuri, teste și conversații. Pentru analiză de cost și suport este necesar un registru de operații.
- **Publicarea are snapshot-uri de conținut.** Fluxul este valoros pentru separarea editării de ce vede cursantul. Snapshot-ul include legăturile către teste, dar o revizie separată trebuie să stabilească exact ce se întâmplă cu întrebările și baremele modificate ulterior.

**5. Securitate și izolare**

Puncte solide: contexte de tenant curățate înainte/după request, scopes pentru companii și relații, verificări tenant pentru validări, separarea operatorului, middleware pentru instructor și analist, blocarea conturilor/companiilor inactive, CSRF și rate limiting. Invitațiile folosesc token hash-uit și copie criptată pentru recuperarea linkului. Testele includ izolarea tenantului, ownership, lipsa expunerii răspunsurilor corecte și blocarea operațiilor platformei din academie.

Aceste mecanisme nu reprezintă o dovadă exhaustivă pentru toate query-urile SQL directe și toate joburile. Contextul necunoscut permite query-uri nescope-uite în unele utilizări interne; orice nou endpoint sau worker trebuie să stabilească explicit contextul ori filtrarea. Politica de stocare publică din F1 este o excepție importantă de la protecția API.

Header-ele de securitate sunt prezente, dar CSP din middleware-ul API nu protejează automat documentul HTML servit de Nginx-ul frontend. Un audit de browser separat trebuie să verifice politica efectivă a documentului, iframe-urile, conținutul HTML editabil și toate tipurile de upload. Nu declar aceste suprafețe vulnerabile fără verificări specifice.

**6. Performanță, AI și capacitate**

Există teste utile pentru creșterea numărului de query-uri, agregări și listări, plus indecși adăugați în migrări. Acestea sunt mai relevante decât un smoke test simplu, dar nu măsoară utilizatori simultani sau timpii de răspuns în producție.

AI rulează și în cereri HTTP lungi. Timeout-urile sunt de ordinul minutelor, iar PHP-FPM are implicit 16 procese în Compose. Cererile AI simultane pot ocupa procese necesare pentru login și progres. Nu există dovezi locale suficiente pentru o cifră de capacitate. Măsurarea trebuie să separe traficul LMS normal de generare și de indexare.

Selecția pentru tutor limitează candidații și calculează similarități în aplicație. Limita protejează resursele, dar poate rata material relevant într-un corpus mare. Eval-urile de relevanță, acces și răspuns pe context real trebuie executate separat; testele prezente cu AI dezactivat nu validează calitatea răspunsurilor furnizorului.

Build-ul LMS separă multe pagini și biblioteci, dar generează și chunk-uri mari: aproximativ 631 kB pentru PDF, 470 kB pentru Three.js și 458 kB pentru editor, înainte de gzip. Dimensiunea singură nu justifică o rescriere: următorul pas este măsurarea resurselor încărcate efectiv la login și pe traseul cursantului, mai ales pe mobil.

**7. Mentenanță și operare**

`AIController.php` are 3.925 linii, `CourseBuilderService.php` 1.116, `AdminCourseBuilderPage.jsx` 2.323, `frontend/src/services/api.js` 1.417 și `App.jsx` 2.071. Aceste concentrații combină responsabilități și cresc dificultatea de revizie. Refactorizarea ar trebui să extragă treptat orchestrarea AI, adaptoarele furnizorilor, gestionarea tentativelor și definirea rutelor, păstrând testele de comportament existente.

Cele 48 de avertismente lint includ dependențe de hook-uri și sintaxă incompatibilă cu optimizări React. Nu sunt 48 de buguri confirmate. Prioritate au avertismentele din salvare, editor, publicare și sincronizarea utilizatorului, unde capturarea stării vechi poate avea efect vizibil.

Monitorizarea din Compose verifică în principal existența proceselor sau disponibilitatea portului. `/api/health` verifică DB, dar nu demonstrează că emailurile, joburile sau backup-urile sunt procesate. Sunt necesare alerte pentru vechimea celui mai vechi job, joburi eșuate, lipsa ultimului backup, spațiul pe disc și rata de erori. Un proces viu nu garantează progresul operațional.

README-ul principal are doar titlul. `docs/DEPLOY.md` este util, însă proiectul are nevoie de documentație pentru pornire locală, roluri, model de date, reguli de finalizare, recuperare, gestionarea incidentelor și procesul comercial manual.

**8. Ordinea recomandată a intervențiilor**

| Ordine | Livrabil | Criteriu de acceptare |
|---|---|---|
| 1 | Acces privat la materiale | URL-ul unui material privat e refuzat fără sesiune și după revocarea accesului |
| 2 | Backup și restore PostgreSQL | Restaurare într-o bază nouă, fișiere verificate și inserări ulterioare fără conflicte |
| 3 | Copie externă și retenție | Backup disponibil după simularea pierderii stocării aplicației; alertă la eșec |
| 4 | Rezervări AI | Două cereri pentru ultimul credit produc cel mult o operație externă autorizată |
| 5 | Submit uniform și idempotent | Două submit-uri concurente returnează același rezultat pentru aceeași tentativă |
| 6 | Deploy verificabil | Health eșuat produce exit nenul; rollback documentat și probat |
| 7 | Parolă temporară, conversie lead, ștergere | Restricție API, conversie unică și curățare reluabilă a fișierelor |
| 8 | CI PostgreSQL și E2E | Fluxurile principale rulează automat pe pull request |
| 9 | Clarificarea regulilor și observabilitate | Pragul de 80%, pool-ul AI, facturarea și procedurile de suport sunt explicite |
| 10 | Refactorizare și performanță măsurată | Extragere pe responsabilități și optimizare pe baza profilării |

Extinderea funcționalităților ar trebui făcută pe baza acestei stabilizări. Dovezile locale susțin existența unui nucleu LMS bine dezvoltat; nu susțin încă o garanție de recuperare pe PostgreSQL, de confidențialitate a fișierelor sau de comportament corect sub încărcare concurentă.
