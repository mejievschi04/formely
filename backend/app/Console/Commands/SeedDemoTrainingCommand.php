<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamQuestion;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\QuestionBank;
use App\Models\Team;
use App\Models\ExamResult;
use App\Models\TestResult;
use App\Models\User;
use App\Services\CourseBuilderService;
use App\Services\TestBuilderService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Date demo: 2 echipe, curs cu 4 module (lecții + test/modul), 2 bănci de întrebări, examen final.
 *
 * php artisan demo:seed-training
 */
class SeedDemoTrainingCommand extends Command
{
    protected $signature = 'demo:seed-training {--password=password : Parola pentru utilizatorii creați}';

    protected $description = 'Creează echipe, curs (4 module + teste), 2 bănci de întrebări și un examen demo';

    private const COURSE_TITLE = 'Curs Demo — 4 Module Complete';

    public function handle(CourseBuilderService $courseBuilder, TestBuilderService $testBuilder): int
    {
        $password = Hash::make((string) $this->option('password'));

        $owner = User::updateOrCreate(
            ['email' => 'instructor@formely.local'],
            [
                'name' => 'Instructor Test',
                'password' => $password,
                'role' => 'instructor',
                'status' => 'active',
            ]
        );

        $students = $this->ensureStudents($password);

        $course = Course::updateOrCreate(
            ['title' => self::COURSE_TITLE],
            [
                'description' => 'Curs demonstrativ: 4 module publicate, test la fiecare modul, examen final și progres complet pentru studenții din echipe.',
                'level' => 'intermediate',
                'status' => 'published',
                'workflow_status' => 'published',
                'teacher_id' => $owner->id,
                'reward_points' => 200,
                'sequential_unlock' => false,
                'min_completion_percentage' => 80,
            ]
        );

        $this->purgeCourseStructure($course);

        $modules = [];
        $allLessons = [];
        $moduleTests = [];

        $moduleTitles = [
            'Modul 1 — Introducere',
            'Modul 2 — Concepte de bază',
            'Modul 3 — Practică',
            'Modul 4 — Recapitulare',
        ];

        foreach ($moduleTitles as $index => $moduleTitle) {
            $module = $courseBuilder->createModule($course, [
                'title' => $moduleTitle,
                'description' => 'Conținut pentru '.$moduleTitle,
                'order' => $index,
                'status' => 'published',
            ]);

            $moduleLessons = [];
            for ($l = 1; $l <= 2; $l++) {
                $lesson = $courseBuilder->createLesson($module, [
                    'title' => "Lecția {$l} — {$moduleTitle}",
                    'content' => '<p>Material demo pentru modulul '.($index + 1).', lecția '.$l.'.</p>',
                    'type' => 'text',
                    'duration_minutes' => 15 + $l,
                    'order' => $l - 1,
                    'status' => 'published',
                ]);
                $moduleLessons[] = $lesson;
                $allLessons[] = $lesson;
            }

            $test = $testBuilder->createTest([
                'title' => 'Test — '.$moduleTitle,
                'description' => 'Evaluare modul '.($index + 1),
                'status' => 'published',
                'type' => 'graded',
                'time_limit_minutes' => 20,
                'max_attempts' => 3,
                'passing_score' => 70,
                'randomize_questions' => true,
                'randomize_answers' => true,
                'show_results_immediately' => true,
                'show_correct_answers' => true,
                'question_source' => 'direct',
                'questions' => $this->buildModuleTestQuestions($index + 1),
            ], $owner);

            CourseTest::create([
                'course_id' => $course->id,
                'test_id' => $test->id,
                'scope' => 'module',
                'scope_id' => $module->id,
                'required' => true,
                'passing_score' => 70,
                'order' => $index + 1,
            ]);

            $modules[] = $module;
            $moduleTests[] = $test;
        }

        $banks = [];
        foreach (['Banca Întrebări Random A', 'Banca Întrebări Random B'] as $bankIndex => $bankTitle) {
            $bank = $testBuilder->createQuestionBank([
                'title' => $bankTitle,
                'description' => 'Întrebări generate aleator pentru testare ('.($bankIndex + 1).')',
                'status' => 'published',
                'questions' => $this->buildRandomBankQuestions(12, $bankIndex + 1),
            ], $owner);
            $banks[] = $bank;
        }

        $exam = Exam::updateOrCreate(
            [
                'course_id' => $course->id,
                'title' => 'Examen Final — Curs Demo',
            ],
            [
                'description' => 'Examen sumativ pentru cursul demonstrativ',
                'status' => 'published',
                'max_score' => 100,
                'passing_score' => 70,
                'time_limit_minutes' => 45,
                'max_attempts' => 2,
                'is_required' => true,
                'created_by' => $owner->id,
            ]
        );

        $exam->questions()->each(fn (ExamQuestion $q) => $q->answers()->delete());
        $exam->questions()->delete();

        foreach ($this->buildExamQuestions() as $qIndex => $questionData) {
            $question = ExamQuestion::create([
                'exam_id' => $exam->id,
                'question_text' => $questionData['question_text'],
                'question_type' => $questionData['question_type'],
                'points' => $questionData['points'],
                'order' => $qIndex,
                'payload' => $questionData['payload'] ?? null,
            ]);

            foreach ($questionData['answers'] as $aIndex => $answerData) {
                ExamAnswer::create([
                    'exam_question_id' => $question->id,
                    'answer_text' => $answerData['answer_text'],
                    'is_correct' => $answerData['is_correct'],
                    'order' => $aIndex,
                ]);
            }
        }

        $teams = $this->createTeams($owner, $course, $students);

        $this->enrollStudentsAndCompleteProgress($course, $allLessons, $moduleTests, $exam, $students);

        $this->newLine();
        $this->info('✅ Date demo create cu succes');
        $this->table(
            ['Element', 'Detalii'],
            [
                ['Curs', "{$course->title} (ID: {$course->id})"],
                ['Module', (string) count($modules)],
                ['Lecții', (string) count($allLessons)],
                ['Teste modul', (string) count($moduleTests)],
                ['Bănci întrebări', collect($banks)->map(fn ($b) => "{$b->title} ({$b->questions()->count()} întrebări)")->implode('; ')],
                ['Examen', "{$exam->title} (ID: {$exam->id}, {$exam->questions()->count()} întrebări)"],
                ['Echipe', collect($teams)->map(fn (Team $t) => "{$t->name} ({$t->users()->count()} membri)")->implode('; ')],
                ['Studenți înscriși', (string) count($students).' (lecții 100%, fără rezultate fictive)'],
                ['Parolă', (string) $this->option('password')],
            ]
        );

        return self::SUCCESS;
    }

    /**
     * @return array<int, User>
     */
    private function ensureStudents(string $hashedPassword): array
    {
        $names = [
            'Ana Popescu', 'Andrei Ionescu', 'Elena Dumitrescu', 'Mihai Georgescu', 'Ioana Marin',
            'Cristian Stan', 'Maria Radu', 'Alexandru Enache', 'Diana Vasile', 'Gabriel Moldovan',
        ];

        $students = [];
        foreach ($names as $index => $name) {
            $num = str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
            $students[] = User::updateOrCreate(
                ['email' => "student{$num}@formely.local"],
                [
                    'name' => $name,
                    'password' => $hashedPassword,
                    'role' => 'student',
                    'status' => 'active',
                ]
            );
        }

        return $students;
    }

    private function purgeCourseStructure(Course $course): void
    {
        $lessonIds = Lesson::where('course_id', $course->id)->pluck('id');
        if ($lessonIds->isNotEmpty()) {
            DB::table('lesson_progress')->whereIn('lesson_id', $lessonIds)->delete();
            Lesson::whereIn('id', $lessonIds)->delete();
        }

        Module::where('course_id', $course->id)->delete();
        CourseTest::where('course_id', $course->id)->delete();

        Exam::where('course_id', $course->id)
            ->where('title', '!=', 'Examen Final — Curs Demo')
            ->each(function (Exam $exam) {
                $exam->questions()->each(fn (ExamQuestion $q) => $q->answers()->delete());
                $exam->questions()->delete();
                $exam->delete();
            });
    }

    /**
     * @param  array<int, User>  $students
     * @return array<int, Team>
     */
    private function createTeams(User $owner, Course $course, array $students): array
    {
        $alpha = Team::updateOrCreate(
            ['name' => 'Echipa Alpha'],
            [
                'description' => 'Echipă demo — studenți 01–05',
                'owner_id' => $owner->id,
                'sort_order' => 1,
                'accent_color' => '#0891b2',
            ]
        );

        $beta = Team::updateOrCreate(
            ['name' => 'Echipa Beta'],
            [
                'description' => 'Echipă demo — studenți 06–10',
                'owner_id' => $owner->id,
                'sort_order' => 2,
                'accent_color' => '#2563eb',
            ]
        );

        $alpha->users()->sync(collect($students)->take(5)->pluck('id')->all());
        $beta->users()->sync(collect($students)->skip(5)->pluck('id')->all());

        $alpha->courses()->syncWithoutDetaching([$course->id]);
        $beta->courses()->syncWithoutDetaching([$course->id]);

        return [$alpha, $beta];
    }

    /**
     * @param  array<int, Lesson>  $lessons
     * @param  array<int, \App\Models\Test>  $moduleTests
     * @param  array<int, User>  $students
     */
    private function enrollStudentsAndCompleteProgress(
        Course $course,
        array $lessons,
        array $moduleTests,
        Exam $exam,
        array $students
    ): void {
        $now = now();

        // Curăță rezultate demo invalide (scor fictiv fără răspunsuri per întrebare)
        TestResult::where('course_id', $course->id)->get()->each(function (TestResult $row) {
            $answers = $row->answers;
            if (! is_array($answers) || array_key_exists('demo', $answers)) {
                $row->delete();
            }
        });
        ExamResult::where('exam_id', $exam->id)->get()->each(function (ExamResult $row) {
            $answers = $row->answers;
            if (! is_array($answers) || array_key_exists('demo', $answers)) {
                $row->delete();
            }
        });

        foreach ($students as $student) {
            DB::table('course_user')->updateOrInsert(
                ['course_id' => $course->id, 'user_id' => $student->id],
                [
                    'enrolled' => true,
                    'enrolled_at' => $now->copy()->subDays(7),
                    'started_at' => $now->copy()->subDays(6),
                    'completed_at' => $now,
                    'progress_percentage' => 100,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );

            foreach ($lessons as $lesson) {
                DB::table('lesson_progress')->updateOrInsert(
                    ['lesson_id' => $lesson->id, 'user_id' => $student->id],
                    [
                        'completed' => true,
                        'time_spent_seconds' => 900,
                        'progress_percentage' => 100,
                        'started_at' => $now->copy()->subDays(5),
                        'completed_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]
                );
            }

            // Nu inserăm TestResult/ExamResult fictive (answers: {demo:true}) — strică pagina Rezultate:
            // scor 78% dar 0 întrebări corecte la revizuire. Elevii parcurg testele real.
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildModuleTestQuestions(int $moduleNumber): array
    {
        $topics = ['LMS', 'module', 'lecție', 'evaluare', 'progres', 'echipă'];

        return collect(range(1, 3))->map(function (int $n) use ($moduleNumber, $topics) {
            $topic = $topics[array_rand($topics)];
            $correct = "Răspuns corect M{$moduleNumber}-Q{$n}";

            return [
                'type' => 'multiple_choice',
                'content' => "Modul {$moduleNumber}, întrebarea {$n}: Care afirmație despre {$topic} este corectă?",
                'points' => 10,
                'order' => $n - 1,
                'answers' => [
                    ['text' => $correct, 'is_correct' => true],
                    ['text' => 'Variantă incorectă A', 'is_correct' => false],
                    ['text' => 'Variantă incorectă B', 'is_correct' => false],
                    ['text' => 'Variantă incorectă C', 'is_correct' => false],
                ],
                'explanation' => 'Răspunsul marcat este cel corect pentru acest modul demo.',
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildRandomBankQuestions(int $count, int $bankNumber): array
    {
        $pool = [
            'HTML', 'CSS', 'JavaScript', 'PHP', 'Laravel', 'React', 'API REST', 'SQL',
            'autentificare', 'autorizare', 'cache', 'queue', 'migrări', 'seedere',
        ];

        return collect(range(1, $count))->map(function (int $n) use ($bankNumber, $pool) {
            $term = $pool[array_rand($pool)];
            $id = Str::upper(Str::random(4));

            return [
                'type' => 'multiple_choice',
                'content' => "[B{$bankNumber}-{$id}] Întrebare aleatoare #{$n}: Ce știi despre {$term}?",
                'points' => random_int(1, 5),
                'order' => $n - 1,
                'answers' => [
                    ['text' => "Definiție corectă pentru {$term}", 'is_correct' => true],
                    ['text' => 'Răspuns generic greșit 1', 'is_correct' => false],
                    ['text' => 'Răspuns generic greșit 2', 'is_correct' => false],
                ],
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildExamQuestions(): array
    {
        return [
            [
                'question_text' => 'Formely este o platformă LMS?',
                'question_type' => 'true_false',
                'points' => 20,
                'answers' => [
                    ['answer_text' => 'Adevărat', 'is_correct' => true],
                    ['answer_text' => 'Fals', 'is_correct' => false],
                ],
            ],
            [
                'question_text' => 'Câte module are cursul demo?',
                'question_type' => 'multiple_choice',
                'points' => 20,
                'answers' => [
                    ['answer_text' => '4 module', 'is_correct' => true],
                    ['answer_text' => '2 module', 'is_correct' => false],
                    ['answer_text' => '6 module', 'is_correct' => false],
                ],
            ],
            [
                'question_text' => 'Selectează tehnologiile folosite în stack-ul Formely',
                'question_type' => 'multiple_choice',
                'points' => 30,
                'answers' => [
                    ['answer_text' => 'Laravel + React', 'is_correct' => true],
                    ['answer_text' => 'WordPress only', 'is_correct' => false],
                    ['answer_text' => 'Excel macros', 'is_correct' => false],
                ],
            ],
            [
                'question_text' => 'Potrivire: rol → responsabilitate',
                'question_type' => 'matching',
                'points' => 15,
                'payload' => [
                    'pairs' => [
                        ['left' => 'Student', 'right' => 'Parcurge cursul'],
                        ['left' => 'Instructor', 'right' => 'Creează conținut'],
                    ],
                ],
                'answers' => [],
            ],
            [
                'question_text' => 'Ordonează pașii de finalizare a unui modul',
                'question_type' => 'ordering',
                'points' => 15,
                'payload' => [
                    'items' => ['Promovează testul', 'Parcurge lecțiile', 'Deschide modulul'],
                ],
                'answers' => [],
            ],
        ];
    }
}
