# Audit Formely AI și upgrade prompturi — 12 octombrie 2026

## Flux analizat

- Frontend: `openaiService` trimite cererea, istoricul, brief-ul și materialele; consumă răspuns JSON sau SSE. `AICourseChat` gestionează conversația și builder-ul.
- Backend: `AiIntentResolver` identifică funcționalitatea și costul; `AIController` compune promptul cu brief-ul, documentele, structura builder-ului sau datele platformei.
- Curs: generare ghidată/non-ghidată → provider → parsare și validare module/lecții → persistență.
- Întrebări: `VoltQuestionGenerationService` folosește generare individuală sau batch, validare de calitate și fallback pentru aprobare manuală.
- Q&A: datele platformei și fragmentele din `AIKnowledgeService` sunt incluse în context; căutarea poate folosi embeddings sau cuvinte cheie.

## Schimbări

Prompturile de curs folosesc același contract. Au fost eliminate cerințele contradictorii despre clarificări și exemplele de curs incomplet. Limba explicită, dimensiunea lecției și numărul cerut au prioritate față de valorile implicite. Lecțiile cer obiective observabile, explicații, exemple rezolvate și aplicații verificabile.

Regulile comune disting materialele de instrucțiuni și limitează inventarea faptelor. Testele folosesc exclusiv materialul primit. Întrebările cer distractori demonstrabil greșiți, corespondențe univoce și ordini susținute de sursă. Contractul de sistem acceptă și batch; schema individuală din batch este etichetată ca schemă a unui element. Exemplul JSON de fallback folosește newline-uri reale.

Builder-ul cere păstrarea conținutului nesalvat și ID-uri existente. Q&A distinge zero de date lipsă, liste parțiale de totaluri și observații de ipoteze. Testele folosesc `needs_more_context` boolean și indici 0–3.

## Verificare și limite

15 teste unitare, 39 aserțiuni: prompturi, intent routing și cote. Sintaxa PHP este validă. Nu au fost făcute apeluri AI plătite; testele verifică contractele construite, nu calitatea efectivă a răspunsurilor modelului.

De urmărit separat: cursurile mari (până la 12 module × 8 lecții) pot depăși bugetul de output configurat; generarea pe lecții ar reduce această limitare. Validatorul builder respinge unele modificări exclusiv de modul fără operații pe lecții; rezolvarea cere alinierea validatorului cu executorul. Instrucțiunile din prompt nu înlocuiesc validarea HTML, verificarea ID-urilor sau izolarea datelor între companii.
