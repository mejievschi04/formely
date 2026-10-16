# Structuri pentru lecțiile create cu Formely AI

## Concluzia analizei

O lecție trebuie să-l ajute pe cursant să înțeleagă și să facă ceva concret. Mai multe propoziții sau mai multe subtitluri nu demonstrează că acest lucru se întâmplă. Conținutul are nevoie de explicații ale mecanismului, exemple dezvoltate și o sarcină prin care cursantul își poate verifica înțelegerea.

[AERO recomandă](https://www.edresearch.edu.au/guides-resources/practice-guides/explicit-instruction-practice-guide-full-publication) descompunerea sarcinilor complexe, demonstrații explicate, practică și ajustarea sprijinului la nivelul cursantului. Ghidul precizează că aceste principii nu reprezintă un scenariu unic de predare. Pentru Formely, aplicăm aceste principii în structuri editoriale adaptate lecțiilor scrise; nu pretindem că un șablon de text garantează învățarea.

[Carnegie Mellon](https://www.cmu.edu/teaching/designteach/design/instructionalstrategies/) diferențiază metodele după obiectiv: înțelegere, aplicare, analiză și dezvoltarea abilităților. [Verificarea prin recuperare din memorie și feedback](https://www.cmu.edu/teaching/resources/instructionalstrategies/activelearningstrategies/retrievalpractice/index.html) susține învățarea; simpla recitire a unei recapitulări nu este același lucru cu a formula sau aplica un răspuns.

## Ce producea texte rigide

- Frontend-ul cerea aceeași succesiune: introducere, explicație, exemplu, exercițiu și recapitulare.
- Promptul comun impunea șase elemente obligatorii în fiecare lecție.
- Promptul builder-ului cerea exact aceeași ordine HTML și minimum nouă paragrafe.
- Promptul de curs cerea 20 de rânduri, iar cererea de regenerare insista pe rânduri și liste.

Acestea sunt instrucțiuni concurente cu cererea de text natural. Pot favoriza lecții alcătuite din multe fragmente scurte și secțiuni care repetă aceeași idee. Nu am măsurat frecvența acestui efect pe răspunsuri reale ale furnizorului.

## Cele cinci structuri propuse și introduse în instrucțiuni

| Tip de lecție | Când se potrivește | Traseul conținutului |
|---|---|---|
| Concept | Cursantul trebuie să explice o idee sau o relație | Explicație și mecanism → exemplu și contraexemplu → aplicare cu verificare |
| Procedură | Cursantul trebuie să execute un proces | Situație și condiții → pași cu justificări → demonstrație → verificare și remediere |
| Decizie / caz | Există opțiuni care trebuie evaluate | Situație → opțiuni și consecințe → alegere argumentată → caz similar cu feedback |
| Lecție tehnică | Trebuie construit, calculat sau depanat ceva | Problemă → exemplu complet → explicația elementelor noi → modificare de încercat → rezultat și diagnostic |
| Consolidare | Cursantul combină ce a învățat deja | Sarcină integrată → rezolvare argumentată → variantă independentă cu criterii |

Acestea sunt trasee de învățare, nu titluri obligatorii de secțiuni. Nu cerem modelului să alterneze mecanic șabloanele. Două proceduri pot avea o structură asemănătoare dacă aceasta servește sarcina.

## Cum arată o explicație dezvoltată

Slab:

> Feedbackul trebuie să fie clar. Folosește exemple concrete. Evită exprimările generale.

Mai util, într-un exemplu ipotetic de comunicare în echipă:

> „Raportul nu este bun” exprimă nemulțumirea, dar nu îi spune colegului ce trebuie schimbat. Înlocuiește evaluarea generală cu o observație care poate fi verificată: „În raport lipsesc rezultatele pentru luna martie”. Apoi explică efectul: fără acele rezultate, comparația dintre trimestre este incompletă. Cererea de corectare devine astfel precisă: adăugarea rezultatelor pentru martie și actualizarea comparației.
>
> Diferența contează pentru că un coleg poate acționa asupra unei informații lipsă, dar nu poate deduce sigur ce înseamnă „nu este bun”. În acest exemplu, observația descrie documentul, nu caracterul persoanei. Dacă problema ar fi o interpretare greșită a datelor, cererea ar trebui să vizeze interpretarea, nu adăugarea unei luni care există deja. Formularea feedbackului pornește, așadar, de la problema verificată.

Aplicare potrivită:

> Rescrie „Prezentarea este confuză” pentru situația în care concluzia nu este susținută de datele afișate. Verifică dacă răspunsul tău numește diferența dintre concluzie și date, explică efectul asupra cititorului și cere o corectare precisă. Un răspuns orientativ: „Concluzia afirmă că vânzările au crescut, însă graficul arată o scădere. Corectează concluzia sau verifică datele înainte să trimiți prezentarea.”

## Reguli editoriale

- Lecția începe cu subiectul sau situația utilă. Scopul trebuie să fie clar din titlu și sarcină; nu este necesară o introducere de tipul „În această lecție vom învăța…”. Contextul și prerechizitele necesare se păstrează.
- Paragrafele dezvoltă idei prin explicație, cauză, exemplu și consecință. De regulă au 3–5 propoziții legate, dar aceasta nu este o cotă obligatorie.
- Titlurile sunt despre conținut: „De ce observația trebuie să poată fi verificată”, nu peste tot „Explicație”. Titlul lecției nu este duplicat în corp.
- Listele servesc pașilor și criteriilor. Nu înlocuiesc explicațiile și nu sunt adăugate pentru a crește numărul de rânduri.
- Verificarea cere explicare, alegere sau acțiune, cu rezultat ori criterii de verificare. Răspunsul orientativ apare după cerință. Nu pretindem că această prezentare statică înlocuiește un test interactiv.
- Recapitularea este opțională. Lecția se poate încheia după aplicare și feedback, fără a repeta tot conținutul.
- O lecție continuă competențele deja introduse; nu reia de la zero definițiile din lecția anterioară.
- Dimensiunile existente ale produsului rămân repere editoriale: scurt 250–350, mediu 350–500, detaliat 500–700 de cuvinte explicative. Aceste intervale nu sunt standarde pedagogice universale. Sunt interzise repetițiile și faptele inventate pentru a le umple.

## Implementare și verificare

Instrucțiunile sunt comune creării de cursuri și generării/editării lecțiilor în builder. Brief-ul frontend și instrucțiunea de regenerare nu mai reintroduc șablonul vechi.

Am schimbat instrucțiunile, nu schema JSON, persistența sau limitele tehnice existente. Pragul tehnic de conținut din backend rămâne o protecție împotriva răspunsurilor prea scurte; nu este o măsură a calității pedagogice. Bugetul de output pentru cursuri mari poate limita dezvoltarea lecțiilor și trebuie urmărit separat.

Testele deterministe verifică prezența regulilor noi și lipsa cerințelor contradictorii. Scenariile din `backend/evals/volt/cases.json` pregătesc verificarea răspunsurilor efective. Înainte de a afirma o îmbunătățire măsurată, sunt necesare comparații pe același model și aceleași cereri, evaluate pentru corectitudine, fidelitate față de sursă, explicație, exemplu și aplicare. Nu au fost efectuate apeluri AI reale pentru această schimbare.
