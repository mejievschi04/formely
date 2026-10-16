# AI într-un LMS: research și criterii pentru Formely

Research efectuat la 16 octombrie 2026, înainte de extinderea testelor. Domeniul confirmat de utilizator: AI exclusiv pentru administratori și instructori. AI pentru studenți rămâne dezactivat; nu propunem activarea sa. Sursele descriu principii și funcționalități; nu demonstrează că simpla adăugare a unei funcții îmbunătățește învățarea. Recomandările pentru Formely de mai jos sunt sinteza noastră, nu un standard obligatoriu.

## Ce rezultă din surse

UNESCO recomandă o abordare centrată pe oameni, protejarea datelor și validarea pedagogică a instrumentelor. Aplicarea practică pentru Formely: profesorul revizuiește materialele și păstrează decizia publicării; accesul AI urmează accesul la date și cursuri. [UNESCO, Guidance for generative AI in education and research](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research?hub=387).

Carnegie Mellon explică necesitatea alinierii obiectivelor, activităților și evaluării: un obiectiv de aplicare nu este verificat suficient prin memorarea definițiilor. Pentru Formely, fiecare lecție trebuie să predea o competență observabilă, să ofere practică și să verifice aceeași competență. [CMU Eberly Center](https://www.cmu.edu/teaching/assessment/basics/alignment.html).

CAST cere feedback specific, informativ și orientat spre progres. Pentru Formely, „greșit, încearcă din nou” este insuficient: explicația trebuie să identifice eroarea, să justifice răspunsul și să propună un pas util. Profesorul poate cere formulări și reprezentări accesibile pentru materialele pe care le pregătește. [CAST, feedback](https://udlguidelines.cast.org/engagement/effort-persistence/feedback/), [CAST, UDL](https://www.cast.org/resources/about-universal-design-for-learning/).

În Moodle 5.2, AI este integrat în editor și în asistența cursului, cu rezumare/explicare și controale la nivel de rol, curs și activitate. Este un exemplu de integrare contextuală și permisiuni, nu o listă de funcții pe care orice LMS trebuie să o copieze. [Moodle AI tools](https://docs.moodle.org/502/en/AI_subsystem), [Moodle AI placements](https://docs.moodle.org/502/en/AI_placements).

Blackboard documentează generarea de structuri, întrebări, activități și rubrici, alegerea contextului și limbii, precum și exerciții conversaționale. Pentru Formely, acestea sugerează generarea de activități și rubrici din contextul ales de profesor. Nu sunt dovezi comparative de eficacitate pedagogică. [Blackboard AI Design Assistant](https://help.anthology.com/blackboard/administrator/en/tools-management/blackboard-ai-design-assistant.html).

NIST tratează confabulația drept risc al sistemelor generative și include evaluarea în gestionarea riscului. Pentru Formely, JSON valid și un verdict pozitiv dat de alt model nu constituie singure dovada corectitudinii. Folosim răspunsuri de referință, verificări deterministe și inspecție separată a conținutului. [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework), [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf).

## Rolurile recomandate pentru Formely

| Rol | Ce ar trebui să poată face | Cum verificăm utilitatea |
|---|---|---|
| Asistent pentru autor | Transformă obiectivele și materialele în structură progresivă, lecții și exemple | Obiective distincte; explicație și demonstrație corecte; fără reguli interne inventate |
| Asistent de evaluare | Propune întrebări și justificări care măsoară ce s-a predat | Răspuns corect verificat independent; distractori distinctivi; sarcini de aplicare când sunt cerute |
| Asistent pentru instructor/administrator | Explică progresul și semnalează unde trebuie analizate rezultatele | Zero diferit de lipsă; eșantion diferit de total; perioadă și bază de calcul explicite; recomandări separate de observații |
| Asistent de operare | Propune modificări precise în contextul paginii | Confirmare, versiune verificată, permisiuni, aplicare integrală, eroare utilă și fără succes fals |

Adaptarea trebuie să fie explicită și controlabilă: limbă, nivel, ritm și tip de explicație. Nu deducem automat capacitatea sau „inteligența” unui cursant dintr-un scor izolat. Notarea finală automată, deciziile de certificare și predicțiile despre persoane nu sunt obiectivele acestei runde.

## Priorități și criterii de acceptare

1. **Corectitudine și fidelitate:** răspunsurile corecte, cifrele și obligațiile provin din surse; conflictele sau lipsurile se declară. Un rezultat cu afirmații inventate este eșec chiar dacă formatul este corect.
2. **Respectarea domeniului produsului:** AI pentru studenți rămâne blocat înainte de apelarea providerului și taxare. Rezumatele, explicațiile și generarea de evaluări se analizează numai ca instrumente pentru administratori/instructori.
3. **Evaluare aliniată:** sarcinile cerute de aplicare folosesc situații și decizii, nu întrebări despre numărul de module. Explicația răspunsului permite corectarea unei greșeli.
4. **Control și acces:** cursantul nu accesează lecții nepermise sau ascunse; instructorul nu modifică alte cursuri; o propunere nu publică automat conținut.
5. **Fiabilitate:** răspunsurile goale, trunchiate sau invalide nu consumă credite. Corectările au un buget limitat și păstrează cererea inițială. Reîncercările nu dublează cursuri sau întrebări.
6. **Măsurare:** raportăm separat structura, corectitudinea verificabilă, fidelitatea/pedagogia inspectate și funcționalitatea API. Un singur răspuns reușit nu dovedește stabilitate; repetăm cazurile dificile.

## Domeniul activ și o problemă latentă

Configurația produsului (`backend/config/ai.php`, profilul validat în octombrie 2026) exclude explicit tutorul și instrumentele lecției. `plans.*.features.ai_tutor` este false pe toate planurile. Nu activăm aceste funcții în urma researchului. Verificăm că toate cele cinci rute logice sunt blocate înainte de provider și taxare.

Inspecția codului dormant a găsit că `normalizeStudyToolResult` completează câmpuri lipsă cu valori goale; dacă funcția va fi activată, trebuie validare și verificarea taxării înainte de lansare. Acesta este un risc latent, nu o eroare demonstrată în fluxul activ. Tutorul conversațional și instrumentele de studiu apar în analiza generală a pieței, dar sunt excluse din cerințele Formely conform deciziei explicite a utilizatorului. Nu sunt elemente de roadmap.

## Teste noi derivate din research

- API: toate cele cinci instrumente de studiu rămân dezactivate și nu apelează providerul sau consumă credite. Pentru activare ulterioară sunt necesare cazuri cu JSON gol, indici/opțiuni invalide, carduri duplicate și timpi inconsistenți.
- Acces: fără escaladare a cursantului la generare, fără modificări între academii și fără ocolirea confirmării/publicării.
- Provider real pe funcțiile active: întrebări cu fapte numerice de referință; material cu instrucțiuni ostile; proceduri lipsă sau contradictorii; statistici cu numitor zero și liste parțiale.
- Cazurile reale rămân separate de simulările API. Nici validatorul, nici evaluatorul AI nu înlocuiesc verificarea pedagogică a materialelor înainte de publicare.

## Rezultatele rundei

- Zece scenarii noi × două repetări: **20/20 trecute** după corecții, comparate cu 16/20 în proba inițială. În proba inițială au eșuat ambele repetări pentru surse contradictorii și ambele repetări pentru editarea dintr-un document ostil.
- Protecția suplimentară împotriva ștergerilor necerute: **2/2 probe reale trecute**.
- Regresia celor 12 scenarii existente: **11/12 trecute**. Cazul `builder_procedure_with_explanation_and_check` a fost respins de evaluatorul AI, care a interpretat explicarea vulnerabilității contului fără autentificare în doi pași drept prezentarea cerinței ca opțională. Acest verdict nu este o dovadă sigură a unei erori pedagogice; arată instabilitatea evaluatorului și poate bloca generarea. Nu l-am mascat prin raportarea numai a unei reluări reușite.
- Cinci verificări API confirmă că instrumentele de studiu dezactivate nu apelează providerul și nu consumă credite.
- Frontend: 52 teste trecute; ESLint pe componenta schimbată și build reușite.

Corecțiile rezultate: clarificare în cazul regulilor interne contradictorii, acceptarea editărilor punctuale scurte fără umplere artificială, respingerea ștergerilor propuse fără o cerere explicită și normalizarea tagurilor HTML cu slash scăpat suplimentar. Documentele atașate editorului rămân în contextul sursei și nu mai sunt duplicate în textul comenzii utilizatorului.

Rezultatele, inclusiv eșecul din regresie, sunt păstrate în `backend/evals/volt/research-results-2026-10-16.json`. Modificările sunt locale, nepublicate. AI pentru studenți nu a fost activat și nu este propus pentru activare.
