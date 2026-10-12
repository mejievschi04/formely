# Audit fluxuri AI — 12 octombrie 2026

## Acoperire și corecții

| Punct de intrare | Constatare și comportament actual |
| --- | --- |
| Chat principal: curs/test | Cererea deschide formularul local. Validarea serverului cere câmpurile obligatorii înainte de generare. Formularul nu consumă tokeni. |
| Builder: editarea cursului | Planul este validat și cere confirmare înainte de aplicare. Promptul cere conținut complet, exemple reproductibile, exerciții și rezultate de verificat. |
| Builder: curs nou | ID-ul cursului deschis nu mai este trimis la crearea unui curs nou, evitând modificarea lui accidentală. |
| Builder: test final | Formularul poate selecta lecțiile salvate drept sursă. Serverul citește materialul cursului; la salvare testul este legat de curs. Eșecul legării este semnalat fără repetarea creării testului. |
| Onboarding AI | Briefurile au acum limba și evaluarea cerute; testul cere exact opt întrebări și folosește lecțiile salvate. Textul de referință lipit este transmis promptului. |
| Chat: mapă | Sunt păstrate doar ID-uri întregi pozitive distincte; obiectele inventate de model nu mai sunt folosite drept ID-uri. Acest flux organizează cursuri existente, nu generează conținutul lor. |
| Bancă de întrebări | Folosește generatorul și validarea proprie a întrebărilor; nu trece prin formularul pentru test complet. Contractele promptului sunt acoperite de teste unitare. |
| Asistență/Q&A | Revizuire statică a fluxului și surselor; nu este certificată aici corectitudinea fiecărui răspuns factual. |
| Editor lecție | Codul are stiluri dedicate pentru blocuri și fragmente. Lista de final nu mai este obligatorie în prompt. |
| Transport AI | Clientul solicită SSE/JSON, recunoaște evenimentele de eroare și nu mai afișează întregul HTML al erorii serverului. |

## Calitatea conținutului

Lista obligatorie din vechiul prompt favoriza recapitulări redundante. Noua regulă cere liste doar când ajută predarea. Lecțiile trebuie să explice instrucțiunile noi, mediul de execuție, rezultatul exemplului, greșelile și verificarea exercițiului. Exemplele HTML sunt escapate în blocuri de cod.

Prima probă reală cu OpenAI mini a returnat două operații valide, dar texte sub intervalul solicitat și fără exerciții. După introducerea unui șablon explicit, proba finală a produs două lecții valide cu subtitluri, exemple HTML complete, greșeli frecvente și exerciții, fără cele trei puncte generice. Rămân aspecte pedagogice de rafinat: numărarea cuvintelor explicative separat de cod, rezultate numerice exacte pentru fiecare exercițiu și preferarea addEventListener/textContent în exemplele JavaScript. Validarea structurală nu dovedește singură calitatea pedagogică.

## Verificare și limite

- Backend: 35 teste trecute, 109 aserțiuni (formulare, sursa cursului, drepturi/cote, prompturi, operații builder).
- Frontend: 33 teste trecute; build de producție reușit.
- Probă live: OpenAI mini, două lecții, contract JSON și validarea planului.
- Nu s-au executat aici teste complete în browser pe fiecare pagină sau un build Docker pe VPS. Deploy-ul și legarea efectivă la baza de date din producție trebuie verificate după actualizare.
- Conținutul deja salvat nu este rescris automat. Îmbunătățirile se aplică la generări viitoare.
- Formularul pentru curs complet păstrează limita existentă de minimum două module cu câte două lecții. Cererea de exact două lecții se poate realiza în builder; simplificarea formularului pentru un curs cu două lecții rămâne de făcut.
- Cursul și testul final sunt două generări separate; nu există aici o operație atomică pentru ambele.
- Sursa pentru test este limitată la primele 12.000 de caractere din lecțiile salvate. Cursurile lungi necesită ulterior selecție sau distribuirea materialului pentru acoperire completă.
- Editarea testelor și mapelor necesită verificări suplimentare ale contextului și salvării înainte de a declara întregul proces testat integral.
