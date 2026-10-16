# Verificarea modulului Formely AI — 16 octombrie 2026

Modificările sunt locale, fără publicare în producție.

## Probleme corectate

- Generarea testelor valida anterior în principal în browser. Serverul verifică acum numărul cerut, patru opțiuni distincte, un singur răspuns corect, explicațiile și întrebările duplicate. Indexul corect `0` este păstrat. Răspunsurile invalide se repară automat, în maximum trei încercări cu buget comun de 180 secunde. Materialul insuficient produce o clarificare, fără taxare; nici erorile providerului sau epuizarea corectărilor nu consumă credite.
- Editorul avea instrucțiuni contradictorii pentru lecții. Lecțiile noi folosesc secțiuni structurate, validatorul comun de calitate și revizuirea separată a cererii/sursei. La probleme de fidelitate regenerarea pornește din cererea originală, fără draftul respins care reintroducea afirmații inventate. Revizuirea are cost de provider suplimentar: maximum șase apeluri pentru un plan, în același buget de 180 secunde.
- Propunerile se aplicau prin cereri HTTP separate. Un endpoint nou aplică întregul plan într-o tranzacție și verifică versiunea cursului, modulelor, lecțiilor și blocurilor. Un eșec târziu anulează întregul plan. O versiune veche sau o reaplicare este refuzată cu HTTP 409.
- Draftul nesalvat era redus la 4.000 caractere de text. Contextul păstrează acum HTML-ul integral al draftului selectat și verifică apartenența lecției la curs. Peste 60.000 caractere editarea completă este refuzată explicit, fără trunchiere ascunsă.
- Fallbackul Groq putea reîncerca nelimitat. Streamingul are acum maximum trei încercări într-un buget comun și respinge răspunsurile incomplete înainte de taxare. Schimbarea modelului nu mai introduce text în JSON-ul generat.
- Previzualizarea întrebărilor dintr-o bancă verifică și dreptul instructorului asupra cursului-sursă.
- Formularul inițial de curs este compact: cerere editabilă, trei variante de structură, preferințe deduse din cerere și detalii opționale. Numerele invalide cer corectare, fără ajustări ascunse. Trimiterea formularului nu mai dublează mesajul utilizatorului.

## Verificări

- Backend: 392 teste trecute, unul omis de suita existentă.
- Frontend: 52 teste trecute; ESLint pe fișierele schimbate și build de producție reușite.
- Provider real, `gpt-4o-mini`: 12/12 scenarii în ultima matrice. Rezultatul, numărul de apeluri, tokenii și duratele sunt în `backend/evals/volt/module-results-2026-10-16.json`.
- Probe reale: teste în română, engleză și rusă; material insuficient; batch; instrucțiuni ostile în material; draft nesalvat; ținte ambigue; lecții practice și teoretice; Q&A cu statistici parțiale și selecții de cursuri pentru mape. Verificarea procedurii respinge suplimentar mecanismele nespecificate și slăbirea obligațiilor sursei.
- Chrome, API simulat: formular de curs desktop/mobil, preferințe și suprascrieri manuale, document lung atașat, exact o generare; confirmarea propunerii; conflict 409 cu mesaj util; un singur POST pentru aplicare; clarificare fără plan aplicabil; teste cu material insuficient și teste valide cu confirmare. Fără erori JavaScript în aceste fluxuri.

Capturi locale: `output/playwright/course-start-refined-desktop.png`, `course-start-refined-mobile.png`, `ai-module-builder-verified.png`, `ai-module-test-verified.png`.

## Limite

Aceste rezultate acoperă scenariile enumerate, nu toate răspunsurile posibile. În probele intermediare au existat planuri valide structural, dar cu reguli interne inventate, și verdicte eronate ale evaluatorului AI. De aceea probele includ verificări suplimentare și conținutul rămâne o propunere pentru revizuire înainte de publicare. Ultimul caz de procedură a necesitat corectări automate; nu toate cererile vor reuși la prima încercare.

Probele reale folosesc date sintetice și nu salvează cursuri/teste sau credite în aplicație. Interacțiunile browserului au API simulat; nu reprezintă o verificare în producție. Transportul SSE și toate combinațiile de permisiuni, fișiere și condiții de rețea nu sunt acoperite integral.


Actualizare după research: rezultatul de 12/12 de mai sus aparține rundei precedente. O nouă regresie a obținut 11/12, cu respingere instabilă de către evaluatorul AI în cazul lecției practice. Cele 20 de probe noi au trecut. Detalii și rezultate brute sintetice: `docs/AI-IN-LMS-RESEARCH-2026-10-16.md`, `backend/evals/volt/research-results-2026-10-16.json`. Domeniul confirmat rămâne AI pentru administratori și instructori, fără AI pentru studenți.
