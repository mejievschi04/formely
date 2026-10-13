# Stare actuală: stilul original restaurat

La cererea utilizatorului, direcția deschisă/verde de mai jos a fost retrasă. Homepage-ul folosește din nou stilul întunecat, accentele cyan, secțiunile originale, animația din hero și cardurile de preț cu rotire. Au rămas ajustări de text, eliminarea promisiunii unui curs gata într-o zi, navigarea cu tastatura în meniul mobil și stările accesibile ale formularului. Componentele și stylesheet-ul noului design au fost eliminate.

Restul documentului este analiza și propunerea anterioară, nu descrierea implementării active.

---

# Reconstrucția landingului Formely

Analiză și prima implementare: 12 octombrie 2026.

## Scop și limită

Homepage nou pentru prezentarea produsului și cererea de activare. Elementul animat din hero (logo central și cele șapte funcții rotative) este păstrat: aceleași pictograme, etichete, rotație și interacțiuni. În codul actual nu există un slideshow cu capturi în hero; interpretarea folosită este elementul rotativ. Capturile produsului sunt prezentate separat, imediat după hero. Pe ecrane înguste, eticheta activă apare sub orbită pentru a rămâne lizibilă; există și un control de pauză.

Nu există în acest audit date despre conversii, sesiuni sau abandon. Concluziile sunt bazate pe cod, configurația produsului, contextul de marketing și verificarea locală a interfeței. Creșterea conversiei este o ipoteză de validat, nu un rezultat măsurat.

## Public și acțiune principală

- Decident: proprietar de firmă, manager operațional, HR sau responsabil de instruire.
- Necesitate: organizarea onboardingului și trainingului intern, verificarea înțelegerii și urmărirea progresului.
- Materiale de pornire: proceduri și conținut existent.
- Acțiune principală: cerere de activare. Aceasta nu creează automat un cont.
- Alternativă pentru vizitatorul care cercetează: deschiderea platformei demo.
- Ofertă: activare asistată și 14 zile gratuite după activare. Prețurile și limitele rămân cele din catalogul existent.

## Auditul paginii anterioare

| Zonă | Constatare | Efect probabil | Schimbare |
| --- | --- | --- | --- |
| Hero | Mesaj tehnic, multe calificări și promisiunea unui curs live într-o zi | Beneficiul pentru echipă se pierde între detalii; termenul nu este demonstrat | Beneficiu scurt în titlu, procesul explicat în paragraf, ofertă clară în nota CTA |
| Structură | Problemă, pași, cifre și încredere repetă aceeași explicație | Mult scroll înainte de o înțelegere concretă a produsului | Produsul urmează imediat după hero; utilizările și activarea au roluri distincte |
| Demonstrarea produsului | ProductShowcase exista, dar nu era inclus pe homepage | Vizitatorul citea mai multe promisiuni decât vedea produsul | Trei ecrane selectabile: cursuri, teste și progres |
| Credibilitate | «1 zi», «<1 €» și secțiuni de încredere fără dovezi de clienți | Așteptări excesive sau comparație de cost fără context | Scoaterea blocului de cifre; termenul de pornire depinde de materiale și cerințe |
| AI | Unele mesaje lăsau impresia unui rezultat gata de publicat | Nepotrivire cu un flux în care administratorul trebuie să verifice | Explicarea explicită: AI propune, administratorul verifică și publică |
| Prețuri | Două fețe ale fiecărui plan, animație 3D | Mai multă complexitate în DOM și în interacțiune | O singură față per plan, recalculată când se schimbă perioada |
| FAQ | Împărțire fixă în două coloane, numere decorative | Citire întreruptă și structură dependentă de exact șase întrebări | O listă completă, cu details/summary native |
| Formular | Câmpuri pe două coloane, telefon înainte de informațiile secundare | Mai multă scanare și impresia unui formular lung | O coloană, etichete vizibile, păstrarea câmpurilor opționale și contractului API |
| Meniu mobil | Dialog fără Escape sau limitarea focusului | Navigare dificilă din tastatură | Escape, focus în dialog și revenirea la butonul de meniu |
| Animații | Conținutul reveal era ascuns până la observația JS | Conținut prerandat, dar dependent de JS pentru vizibilitate | Homepage vizibil fără reveal; animația distinctivă rămâne în hero |

## Direcție vizuală

O pagină luminoasă, cu tipografie de produs și ritm editorial. Elementul animat din hero rămâne punctul vizual principal. Restul paginii folosește spațiu, aliniere, linii discrete și capturi, fără ornamente animate suplimentare.

- Fundal: `#F7F8F4`.
- Text principal: `#183631`.
- Acțiune principală: `#176B54`.
- Secțiuni secundare: `#EAF0E8`.
- Panoul protejat din hero: `#030712`, cu accentele cyan existente.
- Font: Noto Sans existent, potrivit și pentru textul în alfabet chirilic.
- Titluri mari, paragrafe cu lungime limitată, butoane de minimum 44–48 px.
- Carduri pentru conținutul care are nevoie de delimitare: produs, prețuri și formular. Utilizările sunt rânduri; activarea este o secvență.

## Noua ordine

1. Hero: de ce există produsul și care este următorul pas.
2. Produs: cursuri, evaluări și progres, cu capturi existente din platformă.
3. Utilizări: onboarding, proceduri și training despre produse/vânzări.
4. Activare: cerere → configurare asistată → test cu echipa.
5. Prețuri: catalogul și oferta existente, comutare lună/an.
6. FAQ: cost, pornire, rolul AI, activare, acces și perioada de test.
7. Formular: nume și email obligatorii; restul câmpurilor comerciale opționale; consimțământ obligatoriu.
8. Footer: navigare, contact, documente și limbi.

## SEO și conținut

Homepage păstrează un singur H1. Secțiunile au H2, iar subsecțiunile H3. Descrierea română precizează scopul produsului și cererea de activare. Prerandarea oferă HTML pentru homepage și paginile existente; canonical, Open Graph și datele structurate sunt păstrate.

Limitări care rămân:

- Cele patru limbi sunt selectate în browser la aceeași adresă. Nu există URL-uri publice distincte și nici hreflang către versiuni indexabile separat. Traducerea interfeței nu înseamnă automat SEO multilingv.
- Oferta de lansare și termenul de răspuns în 24h provin din contextul comercial existent; trebuie respectate operațional.
- Capturile arată produsul existent, dar sunt mici pe telefon. Demo-ul live rămâne traseul pentru explorare în detaliu. Capturi noi, focalizate pe sarcină, pot îmbunătăți următoarea versiune.
- Nu există dovezi publice de clienți în datele disponibile. Nu am adăugat testimoniale, logo-uri de clienți sau economii de timp inventate.
- Pagina de onboarding existentă include titluri H1 suplimentare în demonstrațiile HTML. Acestea trebuie schimbate în titluri de nivel inferior într-o etapă separată; homepage-ul reconstruit are un singur H1.
- Imaginea Open Graph este cea existentă; o imagine nouă trebuie să reflecte direcția noului homepage.
- Performanța și conversia trebuie evaluate pe deploy-ul real; rezultatele locale nu reprezintă date reale despre vizitatori.

## Verificare

Build client, build SSR și prerandare. Verificare în browser cu capturi desktop și mobil, taburi cu tastatură, prețuri lunare/anuale, FAQ, formular cu API simulat, meniu mobil și patru limbi. Trimiterea formularului în producție nu a fost executată în timpul testului local.

Capturi: `output/playwright/landing-v2-desktop.png` și `output/playwright/landing-v2-mobile.png`.

## Ce măsurăm după lansare

Evenimentele existente `form_start` și `lead` pot ajuta la măsurarea traseului. Următoarele decizii trebuie luate după volum suficient de date:

- Raportul între vizite, începuturi de formular și cereri reușite, separat pe mobil/desktop.
- Interesul pentru demo față de cererea de activare.
- Erori de formular și timpul până la completare, fără colectarea valorilor personale în evenimente.
- Cereri calificate, nu doar numărul brut de formulare.
- Interviuri scurte: ce a înțeles vizitatorul despre produs și ce a lipsit pentru a începe.

Primul experiment propus: titlul bazat pe explicații repetate versus un titlu direct despre onboarding. Păstrăm restul paginii identic pentru a putea interpreta diferența.
