# Probe reale pentru generarea cursurilor — 16 octombrie 2026

Provider: OpenAI, modelul configurat `gpt-4o-mini` (răspunsurile raportează `gpt-4o-mini-2024-07-18`). Toate materialele folosite sunt sintetice. Validarea păstrează pragurile inițiale de 180/260/380 de cuvinte de proză, fără blocurile de cod.

## Reproducerea erorii

Prima lecție din fiecare dimensiune a eșuat cu promptul anterior: scurt 144 de cuvinte, mediu 196, detaliat 237. Au fost observate și proză fără paragrafe HTML, metadate care declarau feedback fără să rezolve exercițiul, fragmente recopiate incorect, blocuri de cod neînchise și nerespectarea limbii.

## Ultima serie, cu aceeași versiune de prompt și validator

Fiecare curs are două module și patru lecții. Toate cele 20 de lecții au trecut la primul răspuns, cu câte cinci apeluri per curs (structură + patru lecții), fără corectări necesare în această serie.

| Scenariu | Limbă | Dimensiune | Cuvinte de proză per lecție | Durată curs | Tokeni input + output |
| --- | --- | --- | --- | --- | --- |
| Feedback în echipă | ro | scurt | 366, 302, 353, 396 | 25,11 s | 10.773 |
| JavaScript DOM | ro | mediu | 282, 268, 331, 279 | 34,19 s | 11.801 |
| Suport clienți, livrări | en | detaliat | 591, 415, 534, 528 | 23,34 s | 10.481 |
| Feedback în echipă | ru | scurt | 241, 264, 246, 286 | 19,09 s | 10.137 |
| Procedură de retur sintetică | ro | scurt | 340, 345, 355, 363 | 26,25 s | 11.716 |

Playwright a executat cele 10 blocuri de cod din cele patru lecții JavaScript în Chromium, inclusiv interacțiunea cu butoanele și modificarea elementelor DOM: fără excepții JavaScript sau erori de pagină. Verificarea a executat exemplele și a inspectat rezultatele; nu este o evaluare exhaustivă a tuturor soluțiilor posibile.

Răspunsurile reale pentru cele trei dimensiuni sunt păstrate în `tests/Fixtures/ai-course-generation-live.json` și reluate prin joburile aplicației într-o bază SQLite de test: trei cursuri draft, 12 lecții și 45 de credite înregistrate. Un răspuns real cu blocuri de cod neînchise este păstrat separat ca regresie negativă. Alte teste simulează corectarea automată a textului scurt, a dovezilor invalide, limita încercărilor, erorile providerului și absența salvării/creditării înainte de validare.

Probele reale nu scriu cursuri în baza unei academii. Validarea structurală nu demonstrează fidelitatea semantică completă față de surse; procedurile și răspunsurile orientative necesită în continuare revizuire editorială înainte de publicare. Aceste rezultate măsoară scenariile de mai sus, nu garantează toate subiectele sau combinațiile de brief.
