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
