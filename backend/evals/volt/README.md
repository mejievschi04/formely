# Evaluarea prompturilor Formely AI

Aceste 14 scenarii sintetice folosesc metodele din `VoltPromptService`. Acoperă cursuri, întrebări batch, teste, builder și Q&A. Nu conțin date reale ale clienților.

## Export fără apeluri AI

Din backend:

```sh
php evals/volt/export.php > /tmp/formely-ai-prompts.jsonl
```

Fiecare linie conține ID-ul scenariului, mesajele system/user, criteriile de evaluare și hash-ul promptului. Exportul nu pornește Laravel și nu folosește chei API.

## Comparație înainte/după

1. Exportă prompturile de bază și cele candidate din două checkout-uri.
2. Trimite aceleași scenarii către același model, cu aceleași setări și buget de output. Repetă fiecare scenariu de trei ori pentru a vedea variația.
3. Păstrează pentru fiecare răspuns: case_id, hash-ul promptului, modelul, setările, răspunsul brut, tokenii și latența.
4. Verifică determinist JSON-ul, numărul de elemente, ID-urile permise, tipurile și cardinalitatea răspunsurilor corecte. Nu accepta text suplimentar sau JSON recuperat prin eliminarea manuală a unor fragmente.
5. Evaluează fiecare criteriu din `checks` ca pass/fail, cu un fragment din răspuns drept dovadă. Pentru fidelitate față de surse și utilitate pedagogică folosește revizuire umană; un model evaluator poate ajuta, dar nu înlocuiește verificarea.

Rubrică pedagogică, 0–2 puncte pentru fiecare: corectitudine, fidelitate față de sursă, utilitatea exemplului, aplicație verificabilă, progresie fără repetiții. 0 = absent/greșit, 1 = parțial, 2 = complet și concret.

Pentru lecții, verifică și dacă explicația dezvoltă mecanismul și raționamentul, dacă structura servește sarcina și dacă feedback-ul permite verificarea aplicării. Nu acorda puncte pentru simpla prezență a titlurilor „Introducere”, „Exemplu” sau „Recapitulare”, pentru numărul de paragrafe ori pentru atingerea mecanică a unui număr de cuvinte. Exemple de structuri și criterii: `docs/STRUCTURI-LECTII-AI.md` din rădăcina proiectului.

Criterii obligatorii: JSON valid unde este cerut, ID-uri existente, fără fapte interne inventate și fără urmarea instrucțiunilor din materiale. O variantă nu se acceptă dacă introduce regresii în aceste criterii. Comparația calității se face pe răspunsurile efective, cu costul și latența raportate separat.

## Limite

Exportul pregătește evaluarea; nu execută modelul și nu calculează scoruri. Scenariile validează prompturile izolat, nu autorizarea, recuperarea contextului sau persistența din endpoint-uri. Pentru un test complet adaugă separat scenarii prin API-ul aplicației. Cazurile cu material insuficient pentru întrebări individuale trebuie extinse după stabilirea contractului de eroare al generatorului.

## Probe reale pentru generarea pe etape

Din backend, cu providerul și cheia configurate în aplicație:

```sh
php evals/volt/course-generation.php --output=/tmp/formely-course-eval
php evals/volt/course-generation.php --size=scurt --language=ru --output=/tmp/formely-course-ru
php evals/volt/course-generation.php --size=scurt --source --output=/tmp/formely-course-source
```

Scriptul folosește providerul real și aceleași metode de generare/validare ca joburile. Generează implicit trei structuri cu câte două module și patru lecții: comunicare în română, JavaScript în română și suport clienți în engleză. Varianta `--source` folosește o procedură sintetică pentru un magazin fictiv. Nu salvează cursuri în baza aplicației și nu consumă creditele unei academii; apelurile sunt facturate de provider.

În directorul ales salvează inputul sintetic, răspunsurile providerului (fără antete de autentificare), structura, HTML-ul validat, numărul de apeluri, tokenii și durata. Folosește directoare distincte pentru variantele comparate. `--lessons=1` limitează proba la prima lecție. `--baseline` verifică primul răspuns al promptului curent fără corectări automate; pentru comparația cu un prompt vechi rulează aceeași probă pe versiunea veche a codului.

Inspectează separat fidelitatea față de surse, limba, relevanța sarcinii și rezolvarea ei. Execută exemplele tehnice în mediul indicat. Trecerea validatorului nu garantează corectitudinea semantică. Testul `test_real_provider_responses_complete_and_save_all_three_course_sizes` reia răspunsurile reale sintetice din fixture prin etapele de salvare, fără apeluri externe.

## Probe reale pentru restul modulului

```sh
php evals/volt/module.php --output=/tmp/formely-ai-module
php evals/volt/module.php --case=builder_procedure_with_explanation_and_check --output=/tmp/formely-ai-procedure
```

Cele 12 cazuri acoperă testele RO/EN/RU, materialul insuficient, întrebările batch și instrucțiunile ostile din surse, draftul nesalvat, țintele ambigue, lecțiile practice/teoretice și Q&A cu statistici parțiale sau selecții de cursuri pentru mape. Testele și builderul folosesc serviciile de producție, inclusiv validarea, corectările și revizuirea sursei. Probele Q&A trimit promptul real cu un context sintetic; nu verifică transportul SSE sau recuperarea datelor reale.

Răspunsurile brute și rezultatele rămân în directorul specificat. Nu se salvează cursuri/teste și nu se consumă creditele academiilor; providerul facturează apelurile. Nu publica răspunsuri obținute cu date reale ale clienților. Scenariul procedurii verifică suplimentar că nu apar mecanisme de autentificare nespecificate sau recomandări care slăbesc o obligație. Celelalte criterii pedagogice și de fidelitate necesită și inspecția răspunsurilor, nu doar verdictul modelului evaluator.

Builderul are maximum trei încercări și un buget comun de 180 secunde. Un plan valid structural primește și o revizuire separată, deci poate folosi până la șase apeluri de provider. O clarificare nu consumă credite în aplicație. Regenerarea după o problemă de fidelitate folosește cererea originală și diagnosticul, fără draftul respins, pentru a evita repetarea afirmațiilor inventate.

## Matrice derivată din research LMS

Researchul și domeniul produsului sunt în `docs/AI-IN-LMS-RESEARCH-2026-10-16.md`. AI pentru studenți rămâne dezactivat. Cazurile noi vizează funcțiile administratorilor/instructorilor:

```sh
php evals/volt/module.php --suite=research --repeat=2 --output=/tmp/formely-ai-research
php evals/volt/module.php --suite=all --output=/tmp/formely-ai-all
```

`lms-research-cases.json` adaugă zece scenarii. `ResearchAssertions.php` verifică independent răspunsul marcat corect față de valori de referință, clarificarea contradicțiilor, calcule elementare, lipsa afirmațiilor false de publicare și operațiile exacte cerute. Astfel, un JSON valid cu răspunsul greșit nu trece. Cazurile se pot repeta de până la cinci ori; fiecare rezultat are numărul rundei, apelurile providerului, tokenii și durata. Fișierele răspunsurilor sunt păstrate și pentru eșecuri. Testele unitare includ contraexemple pentru verificator.

Aceste verificări au acoperire limitată: expresiile pentru răspunsuri nu dovedesc calitatea tuturor explicațiilor, iar răspunsurile Q&A folosesc context sintetic. Pentru aprecierea pedagogică și afirmații despre progresul real al cursanților este necesară o evaluare separată.
