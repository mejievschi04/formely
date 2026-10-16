# Generarea cursurilor AI pe etape

Crearea unui curs nou folosește acum un proces persistent în baza academiei:

1. `POST /api/admin/ai/course-generations` validează brief-ul și creează cererea. O cheie UUID face reîncercarea aceleiași cereri idempotentă. Un utilizator are cel mult o generare activă.
2. Primul job cere numai structura, cu numărul exact de module și lecții.
3. Fiecare job următor generează și validează o singură lecție. Modelul livrează separat explicația, demonstrația, sarcina și răspunsul argumentat; aplicația le asamblează în HTML. Dacă validarea eșuează, modelul primește lecția respinsă și diagnosticul concret, inclusiv numărul de cuvinte observat și minimul cerut. Un job face maximum trei apeluri pentru generare/corectare, împărțind un buget total de cel mult 180 de secunde. Dacă etapa tot eșuează, coada păstrează cele trei încercări ale jobului, cu pauze de 10 și 30 de secunde. Reîncercarea manuală reia etapa, păstrând structura și lecțiile validate.
4. Ultimul job salvează cursul ca draft, modulele, lecțiile, consumul de 15 credite și rezultatul generării în aceeași tranzacție. O eroare anulează toate aceste modificări.

Checkpoint-ul fiecărei etape și jobul pentru etapa următoare sunt înscrise în aceeași tranzacție. Joburile folosesc conexiunea de coadă `database`, chiar când conexiunea implicită este `sync`. Coada și datele aplicației trebuie să folosească aceeași bază și conexiune Laravel (`DB_QUEUE_CONNECTION` nesetat, configurația standard Docker). Middleware-ul împiedică executarea simultană a etapelor aceluiași curs; indexul etapei face inofensivă relivrarea unui job deja terminat.

Interfața citește progresul la 1,5 secunde. Numărul afișat reprezintă lecțiile validate; 100% este rezervat cursului salvat. La refresh se recuperează cererea activă sau rezultatul tocmai finalizat. Închiderea ferestrei oprește urmărirea în browser, iar procesarea continuă în coadă. O nouă trimitere după finalizarea confirmată poate crea alt curs.

## Verificarea lecțiilor

Instrucțiunile fiecărei lecții includ dimensiunea și limba cerute explicit. Nu se impun introduceri sau recapitulări standard. Verificarea automată cere text explicativ suficient, un paragraf dezvoltat și patru părți cu conținut propriu pentru explicație, exemplu, aplicare și feedback. Fragmentele de verificare sunt extrase de aplicație din părțile livrate; modelul nu mai trebuie să le recopieze. Formatul anterior cu `content` și `evidence` rămâne acceptat. Codul nu înlocuiește volumul explicației, iar tagurile `pre` și `code` trebuie închise corect. Conținutul identic cu o lecție precedentă este respins chiar dacă titlul se schimbă. HTML-ul este curățat înainte de salvare.

Acestea sunt verificări structurale și de consistență, nu o evaluare semantică independentă. Corectitudinea faptelor, relevanța exemplelor și politicile interne trebuie revizuite înainte de publicare.

## Publicare

- Rulează `php artisan migrate --force` înainte de servirea noului frontend.
- Repornește workerul după actualizarea codului/configurației (`php artisan queue:restart` sau recrearea containerului queue).
- `DB_QUEUE_RETRY_AFTER` trebuie să fie mai mare decât timeout-ul jobului de 210 secunde; Docker și valoarea implicită folosesc 300 secunde. Lock-ul expiră după 240 secunde.
- Workerul standard `queue:work database` procesează etapele; nu este necesară o coadă suplimentară. Fără worker, cererea rămâne în așteptare și nu consumă credite.
- Aplică aceeași migrare în bazele separate care folosesc versiunea nouă de cod. Demonstrația pregătită continuă separat și nu pornește generări reale.

Endpoint-ul vechi și fluxul de operații pentru editarea cursurilor existente rămân disponibile. Frontend-ul folosește etapele pentru crearea cursurilor noi cu brief complet.

Testele automate folosesc HTTP simulat, inclusiv răspunsuri sintetice capturate de la modelul real, și verifică executarea prin coada database, izolarea academiilor, reluarea etapelor, corectarea lecțiilor, validarea conținutului, idempotența și rollback-ul salvării/creditelor. Nu efectuează apeluri AI plătite. Probele reale se rulează separat cu `backend/evals/volt/course-generation.php`; instrucțiunile sunt în `backend/evals/volt/README.md`.
