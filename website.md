Vreau să creezi / refaci landing page-ul public pentru proiectul FORMELY.

IMPORTANT:
Nu începe direct implementarea.

PASUL 1 — ANALIZEAZĂ PROIECTUL EXISTENT

Proiectul Formely se află în același workspace/folder cu acest landing page.

Înainte să scrii textele sau componentele:

1. Analizează structura proiectului Formely.
2. Citește rutele, componentele, modelele, API-urile și paginile existente.
3. Identifică funcționalitățile care EXISTĂ cu adevărat.
4. Identifică tipurile de utilizatori/rolurile existente.
5. Identifică funcțiile pentru:
   - cursuri
   - module/lecții
   - cursanți
   - instructori
   - teste/evaluări
   - progres
   - certificări
   - programe
   - analytics/rapoarte
   - administrare
   - autentificare
   - orice alte funcții existente

Nu presupune că o funcționalitate există doar pentru că este normală pentru un LMS.

REGULĂ CRITICĂ:
Landing page-ul trebuie să descrie produsul REAL aflat în proiect.

NU inventa:
- funcționalități
- integrări
- AI
- clienți
- număr de utilizatori
- statistici
- testimoniale
- certificări de securitate
- companii partenere
- premii
- rezultate procentuale
- aplicații mobile
- API public
- SSO
- white-label
- SCORM
etc.

Dacă nu poți confirma o informație din proiect, NU o prezenta ca feature.

--------------------------------------------------

OBIECTIV

Construiește un landing page SaaS premium pentru:

FORMELY

Formely este o platformă de learning/training management.

Landing page-ul trebuie să explice foarte rapid:

CE ESTE FORMELY
PENTRU CINE ESTE
CE PROBLEMĂ REZOLVĂ
CUM FUNCȚIONEAZĂ
CE POATE FACE ÎN REALITATE
CÂT COSTĂ
CUM POATE FI ÎNCERCAT / CUMPĂRAT

Nu vreau text generic de marketing.

Fiecare secțiune trebuie să aibă un scop comercial clar.

--------------------------------------------------

INSPIRAȚIE UX

Studiază ca structură și logică landing page-urile unor produse SaaS/LMS moderne precum:

- TalentLMS
- 360Learning
- LearnUpon
- Docebo

NU copia designul sau textele.

Extrage doar principiile:

- hero foarte clar
- product-first
- screenshot-uri reale
- beneficii înainte de liste interminabile de features
- use cases
- explicație simplă „cum funcționează”
- pricing clar
- CTA-uri repetate inteligent
- trust
- FAQ
- footer bine structurat

Formely trebuie să aibă propria identitate.

--------------------------------------------------

LIMBI

Landing page-ul trebuie să fie disponibil COMPLET în:

RO — Română
EN — English
RU — Русский
IT — Italiano

Româna este limba default.

Creează sistem i18n real.

NU crea pagini duplicate pentru fiecare limbă.

Toate textele trebuie să provină din fișierele de traduceri.

Structură recomandată:

/locales
  ro.json
  en.json
  ru.json
  it.json

sau adaptează-te sistemului i18n deja existent în proiect.

Language switcher în navbar:

RO
EN
RU
IT

Persistă limba selectată.

Detectarea limbii browserului poate fi folosită doar dacă se potrivește arhitecturii existente.

Traducerile trebuie să fie naturale și profesionale.

NU face traduceri literale proaste.

--------------------------------------------------

DIRECȚIE VIZUALĂ

Păstrează identitatea vizuală Formely existentă.

Analizează înainte:
- logo
- culori
- fonturi
- border radius
- background
- componente
- dashboard
- login/auth experience

Landing page-ul trebuie să pară parte din ACELAȘI produs.

Stil:

premium SaaS
modern
minimal
dark
clean
enterprise-ready

Background predominant:
navy foarte închis / aproape negru.

Accent:
cyan / electric blue existent în branding.

Folosește subtil:
- radial gradients
- glow
- glass effects
- border highlights
- grid/noise foarte discret
- blur
- depth

NU transforma pagina într-un site cyberpunk.

Glow-ul trebuie să fie subtil și premium.

--------------------------------------------------

NAVBAR

Navbar sticky/floating foarte clean.

Stânga:
FORMELY logo

Centru:
Produs
Soluții
Cum funcționează
Prețuri
FAQ

Dreapta:
language selector

Autentificare

CTA principal:
„Începe”

sau CTA-ul real folosit de produs.

Pe mobile:
hamburger menu premium.

--------------------------------------------------

HERO

Hero-ul este cea mai importantă zonă.

NU folosi:

„Revoluționează modul în care înveți”

sau alte texte SaaS generice.

Creează headline-ul DUPĂ ce ai analizat produsul real.

Trebuie să comunice într-o propoziție valoarea principală Formely.

Structură:

eyebrow mic

headline mare
max 2-3 rânduri desktop

subheadline foarte clar

CTA primary
CTA secondary

Exemplu de logică, NU text obligatoriu:

[headline orientat spre rezultat]

„Creează cursuri, organizează cursanții și urmărește progresul
dintr-un singur loc.”

Folosește această formulare NUMAI dacă toate aceste funcții există.

CTA:
Începe

Secondary:
Vezi platforma / Descoperă Formely

Sub CTA poate exista microcopy foarte scurt.

Nu afirma:
„fără card”
„trial 14 zile”
etc.
decât dacă acest lucru există realmente în proiect/business logic.

--------------------------------------------------

HERO PRODUCT VISUAL

Sub headline vreau produsul să devină elementul central.

NU folosi mockup-uri fictive dacă există interfață reală.

Folosește screenshot-uri/UI reale din Formely.

Poate fi prezentat într-un browser/dashboard frame premium.

Dashboard-ul să aibă:
perspective subtilă
shadow
cyan glow foarte discret

La scroll:
transform:
perspective → flat

scale:
0.94 → 1

opacity:
0.8 → 1

Trebuie să creeze impresia că utilizatorul „intră” în produs.

--------------------------------------------------

SOCIAL PROOF

Dacă proiectul NU conține clienți reali:

NU inventa logo-uri.

NU scrie:
„Trusted by 500 companies”
„10,000 learners”
etc.

În acest caz înlocuiește social proof-ul cu o secțiune de poziționare:

„Construit pentru echipe care vor training organizat.”

și categorii precum:

Companii
Academii
Traineri

DOAR dacă acestea corespund produsului real.

--------------------------------------------------

PROBLEM → SOLUTION

Secțiune foarte scurtă.

Arată problema pe care o rezolvă Formely.

Exemple conceptuale:

cursuri dispersate
urmărirea manuală a progresului
lipsa unei imagini clare asupra cursanților
administrare dificilă

Dar verifică dacă Formely chiar rezolvă aceste probleme.

Apoi:

„Formely le aduce într-un singur loc.”

Vizual:
before → Formely → after.

--------------------------------------------------

HOW IT WORKS

Secțiune:

„De la curs la progres, într-un singur flux.”

Ideal 3 pași.

Exemplu:

01
Creezi

02
Distribui

03
Urmărești

Dar denumirile trebuie adaptate funcționalităților reale.

Fiecare pas:
headline
maximum 2 propoziții
UI preview real.

--------------------------------------------------

PRODUCT SHOWCASE

Aceasta trebuie să fie una dintre cele mai impresionante secțiuni.

Nu face 12 carduri mici cu iconițe.

Folosește secțiuni mari alternating:

TEXT | PRODUCT UI

PRODUCT UI | TEXT

Extrage cele mai importante 4-6 funcții REALE din proiect.

De exemplu, DOAR DACĂ EXISTĂ:

Management cursuri

Teste și evaluări

Progres cursanți

Certificări

Management utilizatori

Analytics

Pentru fiecare:

headline orientat spre rezultat
descriere scurtă
2-3 capabilities reale
screenshot real.

--------------------------------------------------

USE CASES

Creează o secțiune:

„Un singur Formely. Mai multe moduri de a-l folosi.”

Carduri/tab-uri în funcție de audiența reală.

Posibil:

Training angajați
Academii
Traineri
Onboarding
Training intern

NU include un use-case dacă produsul actual nu îl poate susține.

La click pe fiecare use case:
schimbă explicația + screenshot-ul relevant.

--------------------------------------------------

ANALYTICS

Dacă proiectul are analytics reale:

creează o secțiune dedicată.

Headline conceptual:

„Vezi ce se întâmplă. Nu presupune.”

Arată dashboard-ul real.

Explică exact metricile pe care produsul le poate urmări.

NU inventa KPI-uri.

--------------------------------------------------

PRICING

Folosește cele 3 planuri:

INSTRUCTOR
până la 50 cursanți activi
€49 / lună

ACADEMIE
până la 150 cursanți activi
€129 / lună

BUSINESS
peste 150 cursanți
de la €249 / lună

Academie = RECOMANDAT.

IMPORTANT:

Pentru lista de features din fiecare plan,
folosește numai funcționalități confirmate.

Dacă diferențierea planurilor nu este încă implementată în backend,
prezintă pricing-ul ca ofertă comercială, fără să pretinzi că există
limitări tehnice automate care nu sunt implementate.

CTA-urile trebuie să corespundă fluxului real.

--------------------------------------------------

COMPARISON / WHY FORMELY

Nu ataca competitorii.

Poți avea o secțiune simplă:

„Training fără complexitate inutilă.”

3-4 diferențiatori REALI identificați în produs.

Nu inventa avantaje.

--------------------------------------------------

FAQ

Creează FAQ pe baza produsului real.

Întrebări potențiale:

Ce este Formely?
Pentru cine este Formely?
Cum adaug cursanți?
Pot urmări progresul?
Cum funcționează planurile?
Pot trece la alt plan?
Există limită de cursuri?
Cum încep?

Dar răspunde numai pe baza informațiilor confirmate.

Dacă răspunsul nu poate fi determinat:
nu include întrebarea.

--------------------------------------------------

FINAL CTA

Secțiune foarte clean și cinematică.

Background cu glow cyan subtil.

Headline scurt.

Exemplu conceptual:

„Trainingul echipei tale poate fi mai simplu.”

CTA principal.

Fără paragraf lung.

--------------------------------------------------

FOOTER

FORMELY

Product
Features
Pricing

Resources
FAQ
Contact

Legal
Privacy
Terms

Languages:
RO / EN / RU / IT

Include:

Powered by Mejievski

dacă această semnătură există deja în branding/proiect.

--------------------------------------------------

ANIMAȚII

Animațiile trebuie să fie premium și rapide.

Folosește:
- opacity
- translate
- scale
- blur foarte subtil
- stagger
- scroll reveal
- product UI transitions

Durată generală:
200-600ms.

Hero poate avea animație mai cinematică.

NU folosi animații exagerate.

NU sacrifica performanța.

Respectă:
prefers-reduced-motion.

--------------------------------------------------

RESPONSIVE

Desktop:
1440+
1200
1024

Tablet:
768

Mobile:
390 / 375

Landing page-ul trebuie proiectat mobile-first corect,
nu doar micșorat de pe desktop.

Pe mobile:
- headline mai compact
- CTA full-width dacă este necesar
- screenshots fără overflow
- pricing cards verticale
- navbar compact
- spacing redus inteligent

--------------------------------------------------

PERFORMANCE

Ținta este un landing page foarte rapid.

Optimizează:
- images
- screenshots
- lazy loading
- font loading
- animations
- bundle size

Nu adăuga librării grele dacă proiectul are deja o soluție potrivită.

Folosește WebP/AVIF unde este logic.

Evită layout shifts.

--------------------------------------------------

SEO

Configurează:

title
meta description
OpenGraph
Twitter/X metadata
canonical
hreflang

pentru:

ro
en
ru
it

Folosește semantic HTML.

H1 unic.

Structură corectă H2/H3.

Adaugă structured data numai dacă informațiile sunt reale.

--------------------------------------------------

COPYWRITING

Foarte important:

NU scrie text de dragul textului.

NU folosi tone de buzzwords precum:

„revolutionary”
„next-generation”
„cutting-edge”
„unlock your potential”
„transform your learning journey”

Copywriting-ul Formely trebuie să fie:

scurt
clar
încrezător
uman
B2B
premium

Arată CE face produsul și DE CE este util.

--------------------------------------------------

REGULĂ FINALĂ

Înainte de implementare creează intern un inventar:

CONFIRMED FEATURES
CONFIRMED USER TYPES
CONFIRMED FLOWS
CONFIRMED METRICS
UNKNOWN / NOT IMPLEMENTED

Landing page-ul poate folosi numai informații din primele 4 categorii.

Pentru UNKNOWN / NOT IMPLEMENTED:
nu inventa nimic.

Dacă găsești texte vechi în landing page care contrazic aplicația reală,
preferă comportamentul și funcționalitatea aplicației reale.

După analiză:

1. stabilește arhitectura landing page-ului
2. creează componentele
3. implementează responsive
4. implementează RO
5. traduce profesional în EN/RU/IT
6. adaugă animațiile
7. optimizează performanța
8. verifică toate CTA-urile
9. verifică faptul că fiecare afirmație despre produs poate fi justificată
   prin codul/proiectul existent
10. verifică toate cele 4 limbi pe desktop și mobile

Rezultatul trebuie să arate ca landing page-ul unui SaaS LMS matur,
nu ca un template generic.