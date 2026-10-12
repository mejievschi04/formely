# Audit detaliat Formely AI — 12 octombrie 2026

## Concluzie

Fluxul de bază este conectat, dar prompturile nu pot compensa lipsurile de context, validare și salvare. Crearea simplă și formularele sunt funcționale; editarea testelor, generarea cursurilor mari și aplicarea mai multor modificări necesită prioritate. „Nu generează fără toate răspunsurile” este garantat de validarea serverului pentru curs/test nou, dar în builder rămâne în mare parte o instrucțiune pentru model.

Acest audit combină citirea codului, teste automate și verificări locale în Chrome. Nu reprezintă o certificare a tuturor paginilor din producție. În această rundă nu au fost efectuate apeluri OpenAI reale.

## Traseul cererii

1. Widgetul global determină contextul din URL: curs, test, mapă sau altă pagină.
2. `detectVoltWorkspaceIntent` clasifică local cererea. Crearea unui curs și crearea/editarea unui test deschid formularul fără apel AI. Builderul și mapele au alte ramuri.
3. `openaiService` trimite formularul și istoricul prin fetch cu cookie/CSRF și token, dacă există.
4. Middleware-ul verifică AI activ, autentificarea, funcțiile planului și limita de rată. Controllerul verifică disponibilitatea creditelor și formularul.
5. Cursul ghidat folosește un răspuns JSON non-streaming; builderul, testele și Q&A folosesc SSE. Mini este configurația implicită inclusiv pentru ruta quality.
6. La curs nou serverul validează și salvează înainte de răspuns. La builder/test/mapă frontendul pregătește propunerea și salvează după Aplică. Acestea au semantici diferite de confirmare.
7. Creditarea este făcută după o generare considerată reușită; nu reprezintă costul exact al apelurilor OpenAI.

## Acoperire pe pagini

| Flux | Ce funcționează | Limită confirmată | Verificare în această rundă |
| --- | --- | --- | --- |
| Panou principal → curs | Intenția naturală deschide formularul; buton blocat când formularul este gol | Cererea cu două lecții nu încape în structura minimă de patru; câmpurile nu sunt precompletate din cerere | Browser Chrome + teste de intent |
| Panou principal → test | Formular separat; material și preferințe obligatorii | Nu se poate alege un curs existent de pe această pagină; numai text manual | Browser Chrome + validarea serverului |
| Builder curs → lecții | Context cu structura cursului, plan validat, Aplică | Clarificările sunt guvernate de model; aplicare prin mai multe request-uri | Browser pentru context; teste structurale |
| Builder curs → test final | Lecțiile salvate pot fi sursă și testul poate fi legat la curs | Textul din blocurile separate nu intră în aceeași extracție; limita de 12.000 caractere poate exclude lecții | Browser pentru selectarea sursei + test server cu structură simulată; salvarea nu a fost exercitată |
| Builder test → editare | Propunere și confirmare; testele publicate legate au protecție la rescriere | Testul existent nu este trimis modelului; salvarea întrebărilor directe le înlocuiește | Revizuire cod, fără aplicare distructivă în browser |
| Mapă/listă mape | JSON cu ID-uri numerice, ciornă înainte de Aplică | ID-ul mapei apare în cerere, dar lista completă de cursuri din mapa deschisă nu este transmisă explicit | Revizuire cod |
| Onboarding | Brief complet, text sursă, test de opt întrebări | Calea proprie diferă de chat; aceleași limite de generare integrală și sursă | Revizuire cod |
| Bancă de întrebări | Preview, sursă de curs, generare pe lot și aprobare | Contract diferit, parametri nullable/default; nu respectă literal regula globală „toate întrebările completate” | Contracte de prompt testate; UI nereexecutat |
| Q&A/rapoarte | Context și instrucțiuni pentru datele platformei; cote proprii | Corectitudinea fiecărui calcul și acoperirea retrieval nu sunt certificate | Revizuire + teste gating/embeddings |
| Student → instrumente de studiu | Rută și validări există | Funcția este dezactivată în profilul produsului; nu este un defect de conectare | Teste AI dezactivat și entitlement |
| Atașamente PDF/TXT | Extracție locală; alte tipuri merg pe endpoint de extracție | Materialele sunt trunchiate; PDF scanat fără text necesită OCR, nevalidat aici | Revizuire cod |

## Probleme, ordonate după impact

### P1 — editarea testului poate pierde întrebările existente

În `AICourseChat`, ramura edit_test trimite ID-ul testului și cererea, dar nu încarcă întrebările actuale în prompt. `TestBuilderService::updateTest` șterge întrebările directe existente și adaugă lista nouă. „Adaugă trei întrebări” nu are deci un contract de adăugare. Confirmarea nu remediază faptul că propunerea a fost făcută fără conținutul curent. Protecția testului publicat și legat limitează unele cazuri, nu toate ciornele.

Remediere: context server cu întrebările existente, operații distincte append/update/replace, păstrarea ID-urilor și salvare într-o tranzacție; test de regresie cu două întrebări existente plus trei noi, apoi reload.

### P1 — volum permis incompatibil cu generarea într-un singur răspuns

Formularul permite 12 module × 8 lecții = 96 de lecții. Cursul ghidat este plafonat la 8.192 tokeni, indiferent de o valoare mai mare în configurație. Promptul cere până la 700 cuvinte/lecție. Riscul de trunchiere este evident din combinația limitelor; nu s-a executat un curs de 96 de lecții pentru a cheltui tokeni demonstrând-o. Până la trei regenerări complete și retry-uri de rată amplifică durata și consumul.

Remediere: outline validat, apoi generare per lecție cu progres, reluare și persistență etapizată. Până atunci limite explicite, realiste, în formular. Un model mai puternic nu rezolvă această arhitectură.

### P1 — aplicarea planului builder nu este atomică

`applyVoltCoursePlan` salvează separat cursul, modulele și lecțiile. Dacă cererea a treia eșuează, primele două pot rămâne aplicate. Repetarea întregului plan poate crea duplicate. Și calea veche de înlocuire a cursului din controller modifică/șterge structura fără o tranzacție vizibilă în acea metodă.

Remediere: endpoint server pentru plan complet, autorizarea fiecărei ținte, tranzacție, cheie de idempotency și verificarea versiunii cursului.

### P1 — generarea și înregistrarea creditelor sunt operații separate

`assertAvailable` verifică sub lock, dar eliberează lockul înainte de apelul AI; `recordSuccess` consumă după rezultat. Două cereri concurente pot trece aceeași verificare. La curs, salvarea precedă înregistrarea creditului: dacă creditarea eșuează, utilizatorul poate primi eroare deși cursul există. Este un risc derivat din cod, fără test concurent în această rundă.

Remediere: rezervare de credit înainte de apel, finalizare/eliberare după rezultat și un identificator unic al generării. Test concurent cu un singur credit de acțiune rămas.

### P2 — brief valid nu înseamnă rezultat conform brief-ului

Validatorul cursului verifică minimumuri structurale, dar nu primește brief-ul pentru a compara exact numărul cerut de module și lecții. Ramura chatului pentru test acceptă titlu și o listă nevidă, normalizează întrebările și nu compară exact numărul returnat cu numărul cerut. Lipsesc aici verificări ferme pentru exact patru variante, exact una corectă și întrebări duplicate înainte de propunere.

Remediere: validare centrală a rezultatului în raport cu brief-ul; retry punctual numai pentru itemii invalizi, fără salvare a rezultatului parțial.

### P2 — regula clarificărilor nu este uniformă

Formularele noului curs și test sunt validate server-side. În builder, nivelul/tipul/dimensiunea sunt cerute prin prompt, nu printr-o stare obligatorie validată de server. O operație scurtă poate trece validatorul dacă are patru blocuri de text. Bancă de întrebări și onboarding au alte default-uri. „Niciodată înainte de toate răspunsurile” nu este încă garantat pe toate ramurile.

Remediere: brief per acțiune și schemă comună; formular de lecție/adăugare în builder; nu obliga detalii pedagogice la simpla redenumire.

### P2 — testele pot evalua doar o parte a cursului

Sursa din chat citește `lessons.content`, nu toate `contentBlocks`; taie întregul material la primele 12.000 caractere. Blocuri importante sau lecții de final pot lipsi. Generatorul din banca de întrebări are extracție proprie, deci cele două fluxuri pot vedea materiale diferite.

Remediere: extractor comun, selecție de lecții/obiective și distribuirea întrebărilor pe material, cu dovada sursei pentru fiecare întrebare.

### P2 — generarea nu are aceeași semnificație de confirmare peste tot

Widgetul promite „Aplic schimbările doar după ce confirmi”. La curs nou, trimiterea formularului generează și salvează pe server; ecranul de după nu este un preview înainte de salvare. La test și builder, Aplică este salvarea. La eroare formularul a fost deja închis, astfel că valorile pot trebui reintroduse.

Remediere: texte explicite „Generează și salvează ciorna” sau preview comun înainte de persistență; păstrarea brief-ului la erori.

### P2 — intenție și context fragile pentru cereri mixte

Clasificarea prin regex în română tratează cursul înaintea testului final, dar nu descompune cererea în ambele sarcini. Întrebările informative din builder pot cădea pe editare în funcție de cuvinte. Limba formularului poate fi engleză/rusă, fără ca clasificarea cererii inițiale să aibă aceeași acoperire. Pentru editarea unei mape, conținutul curent nu este transmis explicit; nu putem presupune că retrieval reconstruiește întotdeauna lista corectă.

Remediere: clasificare locală mai conservatoare, teste pentru întrebări informative și limbi; context explicit din server; obiectiv compus curs+test în aceeași sesiune, cu două etape clare.

### P2 — prompturile îmbunătățite nu sunt o evaluare pedagogică

Proba live din runda anterioară a produs exemple complete și exerciții după șablonul explicit, dar a folosit încă onclick/innerHTML și nu a dat un rezultat numeric concret pentru fiecare exercițiu. Numărul de rânduri poate fi satisfăcut fără explicații suficiente; codul poate umfla numărul total de cuvinte. JSON valid nu dovedește acuratețea sau nivelul potrivit.

Remediere: rubrică cu obiectiv, prerechizite, explicație, exemplu executabil, rezultat, exercițiu verificabil și lipsa repetițiilor; verificare umană pe eșantioane. Păstrăm mini; nu introducem implicit modele mai scumpe.

### P2 — trunchierea și erorile streaming nu sunt urmărite complet

Backendul concatenează delta.content, dar nu urmărește finish_reason în callbackul SSE. La generarea ghidată detectează unele JSON-uri trunchiate euristic. Clientul ignora unele erori în funcție de cuvintele JSON/Unexpected; acest defect a fost corectat în runda curentă prin separarea parsării JSON de tratarea evenimentului.

Remediere suplimentară: finish_reason=length tratat explicit, rezultat final validat server-side, eveniment final distinct successful/error, teste pentru deconectare și anulare.

### P3 — formularul nu reutilizează încă detaliile clare din cerere

În browser, cererea exactă „vreau un curs javascript incepatori 2 lectii si test final 10 intrebari” a deschis formularul corect, dar câmpurile au rămas goale. Utilizatorul trebuie să reintroducă subiectul și nivelul. Auto-scrollul duce spre finalul chatului; pe un viewport de 1280×720 începutul formularului nu este vizibil imediat.

Remediere: extragere locală conservatoare a câmpurilor explicite, cu posibilitate de editare; scroll la titlul formularului. Nu presupunem valori lipsă dacă produsul cere completare explicită.

## Corecții efectuate în această rundă

- Răspunsurile HTML de eroare sunt înlocuite cu mesajul HTTP util, inclusiv dacă HTML-ul apare în câmpul error.
- Mesajele API structurate de validare/cotă sunt păstrate, inclusiv error.message.
- Parsarea SSE ignoră numai JSON-ul sintactic invalid; erorile providerului nu mai sunt filtrate după cuvintele din mesaj.
- Trei teste frontend de regresie acoperă aceste cazuri.

## Dovezi de testare

- 50 teste backend, 154 aserțiuni, trecute: formulare, AI dezactivat, embeddings, entitlement, quota, intent, prompturi și builder validation.
- 36 teste frontend trecute, inclusiv cele trei noi pentru transport.
- Build frontend de producție reușit.
- Două teste E2E existente trecute în Chrome: autentificare/panou și afișarea cursului/lecției în builder. Nu sunt teste de generare AI.
- Playwright CLI: cererea de curs deschide formularul de curs; anularea și cererea de test deschid formularul de test; butoanele sunt disabled cu câmpuri lipsă. Numărul cererilor generate-course/generate-test observate prin Resource Timing după aceste interacțiuni: zero.
- În builder, opțiunea „Lecțiile cursului deschis” există; selectarea ei ascunde materialul manual și arată explicația sursei. Butonul rămâne disabled până la completarea celorlalte câmpuri.
- Captură vizuală locală: `output/playwright/ai-test-form.png`. CSS-ul formularului este aplicat; începutul poate rămâne deasupra zonei vizibile din cauza scrollului.
- Cheia backendului izolat este fictivă; baza este `storage/framework/testing/e2e.sqlite`. Datele producției nu au fost folosite.
- Vite raportează separat o referință lipsă la SplashScreen.jsx. Loginul și builderul trec; problema nu este atribuită AI în acest audit.

## Ordinea recomandată pentru următoarea implementare

1. Editare test cu operații append/update și conservarea întrebărilor existente.
2. Generare outline → lecții individuale, cu progres și reluare, inclusiv cursuri de două lecții.
3. Endpoint atomic pentru planul builder și idempotency.
4. Validarea exactă a numărului și a structurii întrebărilor; extractor de surse comun.
5. Briefuri uniforme și formulare păstrate la erori; generare curs+test în etape.
6. Evaluări recurente pe scenariile din `ai-evaluation-scenarios.json`, pe mini, cu aprobarea umană a eșantioanelor pedagogice.

## Criterii de acceptare pentru un flux fiabil

Nu se lansează apel AI cu un brief incomplet; cererea inițială și formularul nu se contrazic; numărul exact cerut este verificat; rezultatul invalid nu se salvează; editarea păstrează elementele necerute; anularea/reîncercarea nu creează duplicate; previewul arată conținutul și operațiile reale; erorile nu lasă modificări parțiale fără avertizare; după reload rezultatul rămâne identic și apare în academia potrivită.
