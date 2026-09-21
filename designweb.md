DIRECȚIE VIZUALĂ / DESIGN SYSTEM

FOARTE IMPORTANT:

NU crea o paletă nouă pentru landing page.

Landing page-ul trebuie să folosească EXACT identitatea vizuală și culorile
proiectului Formely existent în același workspace.

Înainte de implementare:

1. Analizează proiectul Formely existent.
2. Identifică toate culorile folosite în:
   - background
   - surfaces / cards
   - navbar
   - primary
   - secondary
   - accent
   - text primary
   - text secondary
   - borders
   - hover
   - focus
   - gradients
   - glow
   - success / warning / error, dacă sunt relevante

3. Verifică sursa reală a design system-ului:
   - CSS variables
   - Tailwind config / @theme
   - global CSS
   - theme files
   - componente existente

4. Refolosește token-urile existente ori de câte ori este posibil.

NU hardcoda culori noi dacă există deja token-ul corespunzător în proiect.

--------------------------------------------------

CONSISTENȚĂ CU APLICAȚIA

Landing page-ul trebuie să pară construit de aceeași echipă și în același
design system ca:

- login
- auth experience
- dashboard
- academy
- admin
- componentele Formely existente

Utilizatorul nu trebuie să simtă o schimbare de brand atunci când trece:

Landing → Login → Platformă

Trebuie să existe continuitate vizuală.

--------------------------------------------------

LOGO & BRAND

Folosește logo-ul REAL Formely din proiect.

NU redesena logo-ul.
NU modifica gradientul logo-ului.
NU schimba culorile brandului.
NU genera un logo alternativ.

Dacă există mai multe variante ale logo-ului, identifică varianta utilizată
în interfața principală și folosește-o corespunzător.

--------------------------------------------------

CULORI

NU folosi culori aproximative bazate pe screenshot.

Extrage valorile reale direct din codul proiectului.

De exemplu:

NU presupune:
#00B8D9
#020617
#0F172A

doar pentru că vizual par apropiate.

Găsește valorile reale existente în proiect.

Landing page-ul trebuie să folosească aceeași paletă.

--------------------------------------------------

GRADIENTE ȘI GLOW

Poți crea efecte vizuale noi pentru landing page folosind culorile existente,
dar NU introduce alte culori de brand.

De exemplu, dacă Formely folosește deja:

cyan
blue
violet

poți combina ACELE culori pentru:

- radial gradients
- glow
- ambient light
- button hover
- borders
- background effects
- hero effects

Dar valorile trebuie să provină din paleta Formely existentă.

Efectele trebuie să fie subtile și premium.

--------------------------------------------------

TIPOGRAFIE

Aplică aceeași regulă și fonturilor.

Identifică fonturile existente în proiect și refolosește-le.

NU instala un font nou doar pentru landing page dacă nu există un motiv
tehnic foarte clar.

Respectă:
font-family
font-weight
letter-spacing
line-height

din design system-ul Formely.

--------------------------------------------------

COMPONENTE

Reutilizează, unde este posibil:

Button
Badge
Card
Input
Dropdown
Modal
Tooltip
Tabs
Language selector

din proiectul existent.

Nu crea duplicate ale acelorași componente doar pentru landing page.

Landing-ul poate avea componente speciale de marketing, dar acestea trebuie
construite peste design tokens existente.

--------------------------------------------------

EFECT CINEMATIC

Păstrează aceeași atmosferă vizuală ca AuthExperience existent.

Poți folosi:

- ambient glow
- radial light
- gradient movement
- subtle blur
- depth
- perspective
- smooth reveal
- logo animation

dar toate efectele trebuie construite folosind culorile Formely existente.

Hero-ul landing page-ului și tranziția Landing → Login trebuie să creeze
senzația unui singur produs continuu.

--------------------------------------------------

REGULA FINALĂ

PROJECT SOURCE OF TRUTH > PROMPT

Dacă o culoare, un font, un gradient sau un stil menționat în acest prompt
diferă de proiectul Formely existent:

PROIECTUL EXISTENT ARE PRIORITATE.

Nu modifica design system-ul aplicației pentru a se potrivi landing page-ului.

Landing page-ul trebuie să se adapteze design system-ului Formely.