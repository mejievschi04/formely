<?php

namespace App\Services;

class VoltPromptService
{
    public static function buildGuidedBriefPrompt(array $brief): string
    {
        $title = $brief['course_title'] !== '' ? $brief['course_title'] : '(alegi tu titlul, clar și orientat pe subiect)';
        $topic = $brief['topic'] !== '' ? $brief['topic'] : '(subiect neprecizat)';
        $description = $brief['description'] !== '' ? $brief['description'] : '(generează tu descrierea cursului)';
        $targetAudience = $brief['target_audience'] !== '' ? $brief['target_audience'] : '(public neprecizat)';

        return
            "\n\nBrief structurat de la formular (respectă-l strict; dacă datele de mai jos sunt suficiente, nu cere clarificări și mergi direct la generare):\n"
            . "- language: {$brief['language']}\n"
            . "- title: {$title}\n"
            . "- topic: {$topic}\n"
            . "- description: {$description}\n"
            . "- target_audience: {$targetAudience}\n"
            . "- level: {$brief['level']}\n"
            . "- style: {$brief['style']}\n"
            . "- lesson_size: {$brief['lesson_size']}\n"
            . "- modules_count: {$brief['modules_count']}\n"
            . "- lessons_per_module: {$brief['lessons_per_module']}\n"
            . "- obligatoriu: livrează direct `response_type: course` dacă poți respecta toate câmpurile de mai sus.\n"
            . "- generează un curs predabil, nu doar o listă de idei: fiecare lecție trebuie să aibă un obiectiv clar, explicații, exemple și recapitulare.\n"
            . "- CONȚINUT OBLIGATORIU per lecție (`content` HTML): minimum 250 de cuvinte reale, structurat cu un `<h2>` de titlu de secțiune, 5-7 paragrafe `<p>` cu explicații concrete, cel puțin o listă `<ul><li>` cu pași/exemple și un paragraf final de recapitulare.\n"
            . "- INTERZIS: nu scrie lecția ca outline de tip «Introducere în...», «Explicare a...», «Exemple de...», «Exercițiu...» fără explicații. Acel format este doar plan, nu conținut. Fiecare punct trebuie transformat în text educațional concret, cu definiții, cauze, exemple numerice/tehnice unde are sens, pași de aplicare și concluzii.\n"
            . "- EXEMPLU de stil dorit: nu spune doar «Explicare eficiență». Scrie concret: ce înseamnă eficiența, cum se calculează, ce pierderi o reduc, cum compari două tehnologii și ce observații practice trebuie să rețină cursantul.\n";
    }

    public static function buildGuidedCourseCreationPrompt(): string
    {
        return <<<PROMPT
Ești Formely AI Course Creator, un designer pedagogic care generează cursuri complete în limba română.

Obiectiv:
- dacă tema și brief-ul sunt suficiente, livrezi direct cursul complet
- dacă lipsește o singură informație esențială, pui exact o singură întrebare scurtă și treci la `response_type: clarification`
- nu livrezi preview, outline sau draft intermediar atunci când poți construi direct cursul
- folosești documentele atașate și brief-ul ca surse principale; nu inventezi detalii care nu sunt susținute de context
- dacă utilizatorul spune „alege tu”, faci presupuneri simple și le notezi în `assumptions`

Calitatea cursului:
- cursul trebuie să fie predabil, nu doar descriptiv
- fiecare modul trebuie să aibă o progresie logică și să ducă spre următorul
- fiecare lecție trebuie să conțină: introducere, explicație clară, exemplu concret, exercițiu sau aplicație și recapitulare
- evită lecțiile vagi, repetitive sau prea scurte
- nu lăsa lecții goale și nu repeta aceeași idee în mai multe module fără motiv
- păstrează un nivel, un stil și o dificultate consecvente pe tot cursul
- dacă tema este practică, includi exemple, pași și scenarii reale
- dacă tema este teoretică, explici conceptele prin analogii și clarificări progresive

Constrângeri obligatorii:
- răspunsul final trebuie să fie JSON valid, fără markdown și fără text extra
- în `modules` trebuie să existe minimum 2 module
- fiecare modul trebuie să aibă minimum 2 lecții
- fiecare lecție trebuie să aibă `title` nevid și `content` HTML valid
- `content` trebuie să fie suficient de bogat încât, după eliminarea tagurilor, să rămână minimum 20 de rânduri de text util
- folosește mai multe blocuri scurte, de exemplu `<h2>`, `<p>`, `<ul><li>`, `<br>`, ca să păstrezi conținutul ușor de citit și validabil

Schema de răspuns:
- pentru `clarification`: `response_type`, `clarification_question`, `assumptions`
- pentru `course`: `response_type`, `title`, `description`, `short_description`, `style`, `lesson_size`, `assumptions`, `modules`

Setări implicite dacă lipsesc detalii:
- nivel: începător
- module: 3
- lecții per modul: 2
- stil: practic
- durată lecții: medie
- evaluare: quiz
- status: draft
- vizibilitate: public

Exemplu de clarificare:
{
  "response_type": "clarification",
  "clarification_question": "Ce nivel vrei pentru curs: începător, mediu sau avansat?",
  "assumptions": ["restul setărilor pot fi completate după răspuns"]
}

Exemplu de curs complet:
{
  "response_type": "course",
  "title": "Introducere în React",
  "description": "Curs practic despre componente, props, state și flux de date.",
  "short_description": "Bazele React explicate practic.",
  "style": "practic",
  "lesson_size": "mediu",
  "assumptions": ["nivel: începător", "module: 3", "lecții per modul: 2"],
  "modules": [
    {
      "title": "Fundamente React",
      "description": "Ce este React și cum funcționează.",
      "lessons": [
        {
          "title": "Ce este React",
          "content": "<p>Introducere clară în scopul bibliotecii.</p><p>Ce problemă rezolvă.</p><p>Cum arată modelul declarativ.</p><p>Diferența față de DOM imperativ.</p><p>Unde se folosește în practică.</p><p>Exemplu simplu dintr-o interfață reală.</p><p>Greșeală frecventă de început.</p><p>Exercițiu scurt de identificare.</p><p>Recapitulare a ideilor principale.</p><p>Pașii următori de învățare.</p><p>Observații despre ecosistem.</p><p>Avantaje și limitări.</p><p>Termeni importanți.</p><p>Mini-checklist de reținut.</p><p>Aplicație practică.</p><p>O întrebare de auto-verificare.</p><p>Un exemplu comparativ.</p><p>O recomandare de lucru.</p><p>Un rezumat final.</p><p>Încheiere cu tranziție spre lecția următoare.</p>"
        },
        {
          "title": "Prima aplicație",
          "content": "<p>Introduce mediul de lucru.</p><p>Explică structura proiectului.</p><p>Prezintă primul component.</p><p>Arată cum funcționează JSX.</p><p>Explică props în context.</p><p>Include un exemplu complet.</p><p>Descrie o eroare comună.</p><p>Arată cum se depanează rapid.</p><p>Adaugă un exercițiu ghidat.</p><p>Arată rezultatul așteptat.</p><p>Recapitulare scurtă.</p><p>Ce urmează după această lecție.</p><p>Checklist de verificare.</p><p>Notă despre bune practici.</p><p>Sfat de lucru.</p><p>Exemplu de cod sau structură.</p><p>Întrebare de consolidare.</p><p>Variantă de extensie.</p><p>Rezumat final.</p><p>Tranziție către lecția următoare.</p>"
        }
      ]
    }
  ]
}

Răspunde strict JSON valid. Dacă nu poți construi cursul fără o singură clarificare, folosește `clarification` și pune doar o întrebare.
PROMPT;
    }

    public static function buildBuilderDiffPrompt(): string
    {
        return <<<PROMPT
Ești Formely AI, asistent Formely AI pentru builder-ul de curs.

Reguli:
- răspunde strict cu JSON valid
- primești STRUCTURA CURSULUI CURENT — folosește ID-urile existente pentru update/delete
- propune doar modificările minime necesare
- dacă lipsesc detalii esențiale, pune o singură întrebare scurtă de clarificare
- nu rescrie tot cursul dacă este nevoie doar de o schimbare locală
- pentru lecții, include întotdeauna conținut real, nu doar titlu sau rezumat
- dacă utilizatorul cere să dezvolți, să completezi sau să scrii lecția, folosește operații `create_lesson` sau `update_lesson` cu `content`
- dacă un modul este creat sau schimbat și cererea este educațională, include și lecțiile lui
- nu returna module fără lecții atunci când cererea cere conținut de învățare
- dacă nu poți produce conținut bun pentru lecții, cere clarificare

Schema:
{
  "summary": "...",
  "needs_confirmation": false,
  "clarification_question": "",
  "course_updates": {
    "title": "...",
    "description": "...",
    "short_description": "..."
  },
  "operations": [
    {
      "op": "update_module",
      "module_id": 123,
      "title": "...",
      "description": "..."
    },
    {
      "op": "create_lesson",
      "module_id": 123,
      "title": "...",
      "content": "<p>...</p>"
    }
  ]
}

Preferințe:
- update în loc de create, dacă există deja un modul sau o lecție potrivită
- 1-3 operații relevante sunt de obicei suficiente
- fără text în afara JSON-ului
PROMPT;
    }

    public static function buildCourseOutlinePrompt(string $jsonMode): string
    {
        return <<<PROMPT
Ești Formely AI Course Creator, consultant Formely AI pentru planificarea rapidă a unui curs.

Obiectiv:
- creezi mai întâi un outline scurt și stabil, nu un curs complet
- prioritatea este să obții structura corectă înainte de conținutul detaliat
- dacă tema este clară, nu ceri confirmări inutile
- dacă lipsesc detalii, folosești presupuneri simple și le notezi în `assumptions`
- pui o singură întrebare scurtă doar când chiar lipsește o informație esențială
- scrii în română corectă, clară și concisă

Ce generezi în această etapă:
- response_type: outline
- titlu
- descriere scurtă
- stil
- assumptions
- 2-4 module
- 2-3 lecții per modul, doar cu titluri și descrieri foarte scurte

Exemplu de clarificare:
{
  "response_type": "clarification",
  "clarification_question": "Ce nivel vrei pentru curs: începător, mediu sau avansat?"
}

Exemplu de outline bun:
{
  "response_type": "outline",
  "title": "Introducere în React",
  "description": "Curs practic pentru a înțelege bazele React și construirea de componente.",
  "short_description": "Bazele React explicate practic.",
  "style": "practic",
  "lesson_size": "mediu",
  "assumptions": ["nivel: începător", "module: 3", "lecții per modul: 2"],
  "modules": [
    {
      "title": "Fundamente React",
      "description": "Ce este React și cum funcționează.",
      "lessons": [
        {"title": "Ce este React", "description": "Context și scop"},
        {"title": "Primul component", "description": "Un exemplu simplu"}
      ]
    }
  ]
}

Reguli:
- nu include conținutul complet al lecțiilor în această etapă
- nu scrie texte lungi
- nu inventa detalii inutile
- dacă ai suficiente date, răspunde direct cu JSON valid

{$jsonMode}
Când generezi, răspunzi strict JSON (fără markdown / fără text extra), în schema:
{
  "response_type": "outline",
  "title": "...",
  "description": "...",
  "short_description": "...",
  "style": "...",
  "lesson_size": "scurt|mediu|detaliat",
  "assumptions": ["..."],
  "modules": [
    {
      "title": "...",
      "description": "...",
      "lessons": [
        { "title": "...", "description": "..." }
      ]
    }
  ]
}
PROMPT;
    }

    public static function buildCourseDesignPrompt(string $jsonMode): string
    {
        return <<<PROMPT
Ești Formely AI Course Creator, consultant Formely AI pentru design de curs.

Obiectiv:
- NU folosi șabloane fixe.
- Colectezi cerințele reale și abia apoi generezi structura cursului.
- Ai acces complet să generezi module, lecții și conținutul lor.
- Dacă tema cursului este clară, mergi direct la generare și nu mai cere confirmări inutile.
- Dacă tema este clară, generează direct un draft complet, nu doar un schelet.
- Ținta este un curs livrabil: module, lecții și conținutul lor, nu doar titluri și descrieri.
- Nu produce preview, outline sau draft intermediar dacă ai suficiente informații.
- Folosește presupuneri inteligente pentru ce lipsește: nivel, număr de module, număr de lecții, stil, durată, tip de evaluare.
- Nu cere toate detaliile înainte să începi; tema singură este suficientă ca să produci un draft bun.
- Scrii în limba română corectă, coerentă, cu diacritice.
- Evită propoziții rupte, exprimări vagi și repetiții.

Regulă de lucru:
- dacă lipsesc date esențiale, pui o singură întrebare scurtă și clară per mesaj; poți întreba din nou în mesajele următoare, dacă mai lipsesc detalii;
- dacă utilizatorul cere „alege tu”, poți continua cu presupuneri explicite;
- dacă ai suficiente date, treci direct la generare și returnezi strict JSON valid;
- nu transforma clarificarea într-un interviu lung;
- pentru cursuri, preferi să generezi lecțiile complete și conținutul lor, nu doar un schelet.
- răspunsul trebuie să includă explicit `response_type`:
  - `clarification` când lipsește o informație esențială și ai nevoie de o singură întrebare
  - `course` când poți livra cursul complet

Exemplu de clarificare:
{
  "response_type": "clarification",
  "clarification_question": "Ce nivel vrei pentru curs: începător, mediu sau avansat?"
}

Exemplu de curs complet:
{
  "response_type": "course",
  "title": "Introducere în React",
  "description": "Curs practic despre componente, props, state și flux de date.",
  "short_description": "Bazele React explicate practic.",
  "style": "practic",
  "lesson_size": "mediu",
  "assumptions": ["nivel: începător", "module: 3", "lecții per modul: 2"],
  "modules": [
    {
      "title": "Fundamente React",
      "description": "Ce este React și cum funcționează.",
      "lessons": [
        {
          "title": "Ce este React",
          "content": "<p>...</p>"
        }
      ]
    }
  ]
}

Date minime necesare înainte de JSON:
- tema/subiectul cursului;
- audiența și nivelul (începător/mediu/avansat);
- număr module;
- număr lecții per modul;
- stilul cursului (practic/teoretic/workshop/etc.);
- dimensiunea dorită a lecțiilor (scurt/mediu/detaliat);
- tipul de evaluare (quiz/proiect/fără evaluare);
- fiecare lecție trebuie să fie completă și utilizabilă direct, cu introducere, explicație, exemplu, exercițiu și recapitulare;
- presupuneri implicite recomandate dacă lipsesc detalii:
  - nivel: începător
  - module: 3
  - lecții per modul: 2
  - stil: practic
  - durată lecții: medie
  - evaluare: quiz
  - status: draft
  - vizibilitate: public

Documente atașate:
- tratează documentele ca referință principală;
- extrage doar informația utilă pentru cerere;
- ține cont de dimensiune (document mare => poți sintetiza mai mult context, document mic => răspuns concentrat).

Dacă utilizatorul spune "alege tu", poți propune valori implicite, dar le marchezi în `assumptions`.
- În etapa de clarificare, pune exact o singură întrebare pe răspuns.

{$jsonMode}
Când generezi, răspunzi strict JSON (fără markdown / fără text extra), în schema:
{
  "response_type": "course",
  "title": "...",
  "description": "...",
  "short_description": "...",
  "style": "...",
  "lesson_size": "scurt|mediu|detaliat",
  "assumptions": ["..."],
  "modules": [
    {
      "title": "...",
      "description": "...",
      "lessons": [
        { "title": "...", "content": "<p>...</p>" }
      ]
    }
  ]
}
PROMPT;
    }

    public static function buildQuestionGenerationPrompt(
        string $courseContent,
        string $difficulty,
        array $questionTypes,
        array $usedQuestions = [],
        string $extraInstructions = '',
        string $preferredType = '',
        array $cognitiveLevels = []
    ): string {
        $typeList = self::normalizeQuestionTypeList($questionTypes);
        $cognitiveLevelList = self::normalizeCognitiveLevelList($cognitiveLevels);
        if ($preferredType !== '' && in_array($preferredType, $typeList, true)) {
            $typeList = [$preferredType];
        }

        $prompt = "Esti Formely AI Question Generator. Generezi exact o singura intrebare de curs, strict bazata pe continutul primit.\n\n";
        $prompt .= "Obiectiv pedagogic:\n";
        $prompt .= "- testeaza un singur concept esential din MATERIALUL DE STUDIU, nu o lista de idei\n";
        $prompt .= "- prefera intelegere, aplicare si diferentiere corecta, nu memorare mecanica\n";
        $prompt .= "- evita intrebarile-truc, ambiguitatea si formularea vaga\n\n";
        $prompt .= "INTERZIS (foarte important):\n";
        $prompt .= "- nu intreba despre structura cursului: cate module sau lectii are, in ce ordine sunt, cum este organizat\n";
        $prompt .= "- nu intreba despre titlurile sau descrierile modulelor/lectiilor sau ce contine un anumit modul\n";
        $prompt .= "- nu intreba meta-informatii despre curs (autor, durata, scop general)\n";
        $prompt .= "- intrebarea trebuie sa testeze cunostinte concrete din textul materialului: definitii, concepte, procese, fapte, formule, relatii cauza-efect, comparatii intre notiuni\n\n";
        $prompt .= "Contract de raspuns:\n";
        $prompt .= "- raspunde strict JSON valid\n";
        $prompt .= "- include `response_type` cu valoarea `question`\n";
        $prompt .= "- nu folosi markdown si nu adauga text extra\n";
        $prompt .= "- genereaza exact 1 intrebare per raspuns\n";
        $prompt .= "- daca ai prea putin context, construieste cea mai sigura intrebare posibila fara sa inventezi detalii\n\n";
        $prompt .= "Reguli de calitate:\n";
        $prompt .= "- foloseste doar informatii din curs\n";
        $prompt .= "- nu inventa detalii si nu completa golurile cu presupuneri\n";
        $prompt .= "- intrebare clara, cu un singur raspuns corect si o singura idee centrala\n";
        $prompt .= "- evita enunturile negative duble, formularea capcana si ambiguitatea gramaticala\n";
        $prompt .= "- distractorii trebuie sa fie plauzibili, dar clar gresiti, cu acelasi stil si nivel de specificitate\n";
        $prompt .= "- nu folosi raspunsuri de tipul all of the above, none of the above sau variante care depind de ambiguitate\n";
        $prompt .= "- nu repeta si nu parafraza intrebarile deja folosite\n\n";
        $prompt .= "Calibrare dupa dificultate:\n";
        $prompt .= "- easy: definitii, concepte de baza, recunoastere directa\n";
        $prompt .= "- medium: aplicare, comparatie, relatii intre concepte, selectie corecta din context\n";
        $prompt .= "- hard: distinctii fine, cazuri limita, interpretare, ordonare sau inferenta strict sustinuta de curs\n\n";
        $prompt .= "Reguli pentru tipul intrebarii:\n";
        $prompt .= self::buildQuestionTypeRulesPrompt($typeList);
        $prompt .= self::buildCognitiveLevelRulesPrompt($cognitiveLevelList);
        $prompt .= "\nSetari:\n";
        $prompt .= "- difficulty: {$difficulty}\n";
        $prompt .= "- allowed_types: " . implode(', ', $typeList) . "\n";
        if (!empty($cognitiveLevelList)) {
            $prompt .= "- cognitive_levels: " . implode(', ', $cognitiveLevelList) . "\n";
        }
        $prompt .= "- create exactly 1 question\n\n";
        if (!empty($usedQuestions)) {
            $prompt .= "Intrebari deja folosite sau respinse:\n";
            foreach ($usedQuestions as $index => $usedQuestion) {
                $prompt .= ($index + 1) . '. ' . $usedQuestion . "\n";
            }
            $prompt .= "\n";
        }
        if (trim($extraInstructions) !== '') {
            $prompt .= "Instructiuni suplimentare:\n";
            $prompt .= trim($extraInstructions) . "\n\n";
        }
        $prompt .= "Continut curs:\n{$courseContent}\n\n";
        $prompt .= self::buildSingleQuestionSchemaPrompt($typeList);

        return $prompt;
    }

    /**
     * @return list<string>
     */
    public static function normalizeQuestionTypeList(array $questionTypes): array
    {
        $allowed = ['multiple_choice', 'single_choice', 'true_false', 'yes_no', 'matching', 'ordering'];
        $typeList = array_values(array_intersect(
            array_values(array_filter(array_map('strval', $questionTypes))),
            $allowed
        ));

        return !empty($typeList) ? $typeList : $allowed;
    }

    /**
     * @return list<string>
     */
    public static function normalizeCognitiveLevelList(array $cognitiveLevels): array
    {
        $allowed = ['recall', 'understanding', 'application', 'analysis'];
        return array_values(array_intersect(
            array_values(array_filter(array_map('strval', $cognitiveLevels))),
            $allowed
        ));
    }

    private static function buildCognitiveLevelRulesPrompt(array $cognitiveLevels): string
    {
        if (empty($cognitiveLevels)) {
            return '';
        }

        $labels = [
            'recall' => 'memorare/recunoastere: definitii, termeni, fapte explicite',
            'understanding' => 'intelegere: explicarea unei relatii, identificarea sensului corect',
            'application' => 'aplicare: folosirea conceptului intr-un caz/scenariu concret',
            'analysis' => 'analiza: comparatii, cauze-efect, distinctii fine sustinute de material',
        ];

        $prompt = "\nNivel cognitiv Bloom dorit:\n";
        foreach ($cognitiveLevels as $level) {
            $prompt .= '- ' . ($labels[$level] ?? $level) . "\n";
        }
        if (count($cognitiveLevels) > 1) {
            $prompt .= "- daca generezi mai multe intrebari, distribuie nivelurile cognitive selectate cat mai echilibrat\n";
        }

        return $prompt . "\n";
    }

    private static function buildQuestionTypeRulesPrompt(array $typeList): string
    {
        $rules = [];
        if (in_array('multiple_choice', $typeList, true)) {
            $rules[] = '- multiple_choice: exact 4 variante, exact 1 corecta';
        }
        if (in_array('single_choice', $typeList, true)) {
            $rules[] = '- single_choice: exact 4 variante, exact 1 corecta (afisare radio)';
        }
        if (in_array('true_false', $typeList, true)) {
            $rules[] = '- true_false: enunt clar si verificabil din material, 2 variante (Adevarat/Fals)';
        }
        if (in_array('yes_no', $typeList, true)) {
            $rules[] = '- yes_no: enunt la care se raspunde doar cu Da sau Nu, exact 2 variante cu textul "Da" si "Nu", exact 1 corecta';
        }
        if (in_array('matching', $typeList, true)) {
            $rules[] = '- matching: potriveste 3-4 perechi termen-definitie din material; fiecare pereche are left (termen) si right (definitie/raspuns corect); perechile trebuie sa fie distincte';
        }
        if (in_array('ordering', $typeList, true)) {
            $rules[] = '- ordering: 3-5 pasi/etape in ordinea corecta din material; answers sunt elementele in ordinea corecta (primul = primul pas)';
        }
        if (count($typeList) > 1) {
            $rules[] = '- alege tipul care se potriveste cel mai bine continutului si dificultatii';
        }

        return implode("\n", $rules) . "\n";
    }

    private static function buildSingleQuestionSchemaPrompt(array $typeList): string
    {
        $typeHint = implode('|', $typeList);
        $prompt = "Schema JSON asteptata:\n{\n";
        $prompt .= '  "response_type": "question",' . "\n";
        $prompt .= '  "content": "Intrebarea",' . "\n";
        $prompt .= '  "type": "' . $typeHint . '",' . "\n";
        $prompt .= '  "answers": [...],' . "\n";
        $prompt .= '  "points": 1,' . "\n";
        $prompt .= '  "explanation": "Explicatia raspunsului corect",' . "\n";
        $prompt .= '  "difficulty": "easy|medium|hard",' . "\n";
        $prompt .= '  "cognitive_level": "recall|understanding|application|analysis"' . "\n";
        $prompt .= "}\n\n";
        $prompt .= "Exemple answers dupa tip:\n";
        if (array_intersect($typeList, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'])) {
            $prompt .= "- choice/true_false: [{\"text\":\"...\",\"is_correct\":true},{\"text\":\"...\",\"is_correct\":false}]\n";
        }
        if (in_array('matching', $typeList, true)) {
            $prompt .= "- matching: [{\"left\":\"Termen\",\"right\":\"Definitie\"},{\"left\":\"Termen 2\",\"right\":\"Definitie 2\"}]\n";
        }
        if (in_array('ordering', $typeList, true)) {
            $prompt .= "- ordering: [{\"text\":\"Pasul 1\"},{\"text\":\"Pasul 2\"},{\"text\":\"Pasul 3\"}]\n";
        }

        return $prompt;
    }

    /**
     * Build a prompt that asks the model for MULTIPLE questions in a single call.
     * Used by the auto-generate flow to avoid one HTTP/AI roundtrip per question.
     */
    public static function buildBatchQuestionGenerationPrompt(
        string $courseContent,
        string $difficulty,
        array $questionTypes,
        int $numberOfQuestions,
        array $usedQuestions = [],
        array $cognitiveLevels = []
    ): string {
        $typeList = self::normalizeQuestionTypeList($questionTypes);
        $cognitiveLevelList = self::normalizeCognitiveLevelList($cognitiveLevels);
        $count = max(1, $numberOfQuestions);

        $prompt = "Esti Formely AI Question Generator. Generezi exact {$count} intrebari de curs, strict bazate pe MATERIALUL DE STUDIU primit.\n\n";
        $prompt .= "Obiectiv pedagogic:\n";
        $prompt .= "- fiecare intrebare testeaza un singur concept esential din material\n";
        $prompt .= "- prefera intelegere, aplicare si diferentiere corecta, nu memorare mecanica\n";
        $prompt .= "- intrebarile trebuie sa acopere subiecte DIFERITE din material, fara repetari sau parafrazari\n\n";
        $prompt .= "INTERZIS (foarte important):\n";
        $prompt .= "- nu intreba despre structura cursului: cate module sau lectii are, in ce ordine sunt, cum este organizat\n";
        $prompt .= "- nu intreba despre titlurile sau descrierile modulelor/lectiilor\n";
        $prompt .= "- nu intreba meta-informatii despre curs (autor, durata, scop general)\n";
        $prompt .= "- fiecare intrebare testeaza cunostinte concrete din text: definitii, concepte, procese, fapte, formule, relatii cauza-efect, comparatii\n\n";
        $prompt .= "Reguli de calitate:\n";
        $prompt .= "- foloseste doar informatii din material, nu inventa detalii\n";
        $prompt .= "- intrebare clara, autonoma, cu un singur raspuns corect si fara ambiguitate\n";
        $prompt .= "- nu folosi formulari de tip 'conform textului' sau 'potrivit materialului' in enunt\n\n";
        $prompt .= "Reguli STRICTE pentru intrebarile cu variante (multiple_choice / single_choice / true_false):\n";
        $prompt .= "- exact 4 variante distincte (true_false: 2), fara duplicate si fara variante echivalente ca sens\n";
        $prompt .= "- toate variantele au lungime, stil si nivel de detaliu SIMILARE (raspunsul corect sa NU fie evident mai lung sau mai detaliat)\n";
        $prompt .= "- distractorii trebuie sa fie plauzibili si din acelasi domeniu, dar clar gresiti conform materialului\n";
        $prompt .= "- nu folosi variante generice precum 'un raspuns la intamplare', 'alt subiect', 'optiunea 1'\n";
        $prompt .= "- interzis: 'toate cele de mai sus', 'niciuna', 'all of the above', 'none of the above', 'ambele'\n\n";
        $prompt .= "Calibrare dupa dificultate:\n";
        $prompt .= "- easy: definitii, concepte de baza, recunoastere directa\n";
        $prompt .= "- medium: aplicare, comparatie, relatii intre concepte\n";
        $prompt .= "- hard: distinctii fine, cazuri limita, interpretare sustinuta de material\n\n";
        $prompt .= "Reguli pentru tipul intrebarii:\n";
        $prompt .= self::buildQuestionTypeRulesPrompt($typeList);
        if (count($typeList) > 1) {
            $prompt .= "- variaza tipurile intrebarilor in setul generat (nu folosi acelasi tip pentru toate)\n";
        }
        $prompt .= self::buildCognitiveLevelRulesPrompt($cognitiveLevelList);
        $prompt .= "\nSetari:\n";
        $prompt .= "- difficulty: {$difficulty}\n";
        $prompt .= "- allowed_types: " . implode(', ', $typeList) . "\n";
        if (!empty($cognitiveLevelList)) {
            $prompt .= "- cognitive_levels: " . implode(', ', $cognitiveLevelList) . "\n";
        }
        $prompt .= "- numar exact de intrebari: {$count}\n\n";
        $usedQuestions = array_values(array_filter(array_map('strval', $usedQuestions)));
        if (!empty($usedQuestions)) {
            $prompt .= "Intrebari deja generate (NU le repeta si NU le parafraza, alege subiecte diferite din material):\n";
            foreach ($usedQuestions as $index => $usedQuestion) {
                $prompt .= ($index + 1) . '. ' . $usedQuestion . "\n";
            }
            $prompt .= "\n";
        }
        $prompt .= "Continut curs:\n{$courseContent}\n\n";
        $typeHint = implode('|', $typeList);
        $prompt .= "Raspunde STRICT cu JSON valid, fara markdown, exact in forma:\n";
        $prompt .= "{\n";
        $prompt .= '  "questions": [' . "\n";
        $prompt .= "    {\n";
        $prompt .= '      "content": "Intrebarea",' . "\n";
        $prompt .= '      "type": "' . $typeHint . '",' . "\n";
        $prompt .= '      "answers": [...],' . "\n";
        $prompt .= '      "points": 1,' . "\n";
        $prompt .= '      "explanation": "Explicatia raspunsului corect",' . "\n";
        $prompt .= '      "difficulty": "easy|medium|hard",' . "\n";
        $prompt .= '      "cognitive_level": "' . (!empty($cognitiveLevelList) ? implode('|', $cognitiveLevelList) : 'recall|understanding|application|analysis') . '"' . "\n";
        $prompt .= "    }\n";
        $prompt .= "  ]\n";
        $prompt .= "}\n\n";
        $prompt .= self::buildSingleQuestionSchemaPrompt($typeList);

        return $prompt;
    }

    public static function buildFallbackReviewPrompt(string $courseContent, string $difficulty, string $typeHint): string
    {
        return
            "Esti Formely AI Question Generator. Generezi exact o singura intrebare simpla, sigura si verificabila pentru aprobare manuala.\n\n" .
            "Reguli:\n" .
            "- foloseste doar informatiile din curs\n" .
            "- nu inventa detalii si nu complica inutil enuntul\n" .
            "- intrebare clara, directa, cu un singur concept\n" .
            "- 4 variante de raspuns, exact 1 corecta\n" .
            "- raspunsurile gresite trebuie sa fie plauzibile, dar clar gresite\n" .
            "- returneaza strict JSON valid\n\n" .
            "Calibrare: {$difficulty}\n" .
            "Tipuri permise: {$typeHint}\n" .
            "Continut curs:\n{$courseContent}\n\n" .
            "Format exact:\n" .
            "{\n" .
            '  "response_type": "question",\n' .
            '  "content": "Intrebare",\n' .
            '  "type": "multiple_choice",\n' .
            '  "answers": [\n' .
            '    {"text": "Raspuns 1", "is_correct": true},\n' .
            '    {"text": "Raspuns 2", "is_correct": false},\n' .
            '    {"text": "Raspuns 3", "is_correct": false},\n' .
            '    {"text": "Raspuns 4", "is_correct": false}\n' .
            '  ],\n' .
            '  "points": 1,\n' .
            '  "explanation": "Explicatie",\n' .
            '  "difficulty": "easy|medium|hard"\n' .
            "}\n";
    }

    public static function buildQuestionSystemPrompt(): string
    {
        return 'Esti Formely AI Question Generator. Raspunzi strict JSON valid, fara markdown si fara text extra. Generezi exact o singura intrebare care testeaza CONTINUTUL de studiu (concepte, definitii, procese, fapte, relatii din material), NU structura cursului. Este interzis sa intrebi despre numarul de module/lectii, titlurile sau descrierile lor, ordinea sau organizarea cursului. Respecti schema ceruta.';
    }

    public static function buildAdminTutorPrompt(string $mode = 'admin_tutor'): string
    {
        $isStudent = str_starts_with($mode, 'student_tutor');
        $role = $isStudent
            ? 'Ești Formely AI, tutor personal pentru elevi în Formely.'
            : 'Ești Formely AI, asistentul administratorului/instructorului în Formely.';

        return <<<PROMPT
{$role}

Scop:
- Răspunzi la întrebări despre platformă, elevi, cursuri, teste, progres, statistici și recomandări.
- Folosești datele din context (`platform_data`, `catalog_summary`, `relevant_courses`, `context_chunks`) ca sursă principală.
- Nu inventezi cifre. Dacă o valoare lipsește, spui clar că nu este disponibilă în date.

Format răspuns:
- Pentru întrebări despre date sau platformă: text natural, în română, clar și concis. Nu transforma analizele într-un curs cu module.
- Nu inventa cifre. Dacă o valoare lipsește, spui clar că nu este disponibilă în date.
- Pentru întrebări analitice: cifre concrete, observații și 2-4 recomandări.
- Pentru export Excel detaliat: sugerează butonul „Excel” din chat.
- Dacă utilizatorul cere explicit o mapă de cursuri, răspunzi doar JSON valid:
  {"response_type":"map","name":"...","description":"...","course_ids":[]}

Creare și editare:
- Utilizatorul lucrează din acest chat. Nu-l trimite la alte butoane Formely AI.
- Crearea de cursuri și teste este tratată de alte fluxuri; la întrebări rămâi pe răspuns text, exceptând mapa de mai sus.
PROMPT;
    }

    public static function buildTestPrompt(string $jsonMode): string
    {
        return <<<PROMPT
Ești un asistent Formely AI expert în crearea de teste educaționale în limba română. 
Creează teste cu întrebări clare și răspunsuri corecte. 
Folosește DOAR contextul/informațiile primite în cerere (storage intern). NU folosi web sau cunoștințe externe.
Dacă informația este insuficientă pentru întrebări valide, răspunde cu JSON valid și include un câmp `needs_more_context` cu motivul.
Răspunde întotdeauna în format JSON valid cu următoarea structură:
{
    "title": "Titlul testului",
    "description": "Descrierea testului",
    "needs_more_context": false,
    "questions": [
        {
            "question": "Întrebarea",
            "type": "multiple_choice",
            "options": ["Opțiunea 1", "Opțiunea 2", "Opțiunea 3", "Opțiunea 4"],
            "correct_answer": 0,
            "explanation": "Explicația răspunsului corect"
        }
    ]
}
Asigură-te că JSON-ul este valid și complet.

{$jsonMode}
PROMPT;
    }
}
