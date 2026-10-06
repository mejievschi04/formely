<?php

namespace Database\Seeders;

use App\Models\Course;
use App\Models\CourseMap;
use App\Models\CourseTest;
use App\Models\Lesson;
use App\Models\MediaAsset;
use App\Models\Module;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\Team;
use App\Models\Test;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Date pentru testele end-to-end (volta-frontend/e2e). Rulează doar pe baza separată a testelor:
 * php artisan migrate:fresh --seed --seeder=E2eSeeder
 */
class E2eSeeder extends Seeder
{
    public const PASSWORD = 'E2e-parola-1';

    public function run(): void
    {
        $password = Hash::make(self::PASSWORD);

        $admin = User::create([
            'name' => 'Admin E2E',
            'email' => 'admin@e2e.test',
            'password' => $password,
            'role' => 'admin',
            'status' => 'active',
            'must_change_password' => false,
        ]);

        // Câte un cursant pentru fiecare proiect Playwright (desktop, mobile): testele rulează pe aceeași
        // bază, iar o încercare trimisă pe desktop nu trebuie să schimbe ce vede rularea de pe mobil.
        $students = collect(['desktop', 'mobile'])->map(fn (string $project) => User::create([
            'name' => 'Cursant E2E ' . $project,
            'email' => "student-{$project}@e2e.test",
            'password' => $password,
            'role' => 'student',
            'status' => 'active',
            'must_change_password' => false,
        ]));

        // Conturi pe care testele le suspendă și le reactivează (câte unul pe proiect).
        foreach (['desktop', 'mobile'] as $project) {
            User::create([
                'name' => "Angajat acces {$project}",
                'email' => "access-{$project}@e2e.test",
                'password' => $password,
                'role' => 'student',
                'status' => 'active',
                'must_change_password' => false,
            ]);
        }

        // Fără evenimente de model: nu pornim reindexarea Volt și recalculările de progres.
        $course = Course::withoutEvents(fn () => Course::factory()->published()->create([
            'title' => 'Curs E2E',
            'description' => 'Curs folosit de testele end-to-end.',
            'teacher_id' => $admin->id,
        ]));

        $module = Module::withoutEvents(fn () => Module::create([
            'course_id' => $course->id,
            'title' => 'Modulul 1',
            'description' => 'Primul modul',
            'order' => 1,
            'status' => 'published',
        ]));

        foreach (range(1, 3) as $index) {
            Lesson::withoutEvents(fn () => Lesson::create([
                'course_id' => $course->id,
                'module_id' => $module->id,
                'title' => "Lecția {$index}",
                'content' => "<h2>Introducere {$index}</h2><p>Conținutul lecției {$index}, cu un paragraf de text pentru test.</p>",
                'type' => 'text',
                'status' => 'published',
                'order' => $index,
            ]));
        }

        $test = Test::factory()->published()->create([
            'title' => 'Test final E2E',
            'created_by' => $admin->id,
            'time_limit_minutes' => null,
            'max_attempts' => 3,
            'passing_score' => 50,
            'randomize_answers' => false,
        ]);

        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'multiple_choice',
            'content' => 'Care este capitala României?',
            'points' => 1,
            'order' => 0,
            'answers' => [
                ['text' => 'București', 'is_correct' => true],
                ['text' => 'Cluj-Napoca', 'is_correct' => false],
            ],
        ]);

        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'multiple_choice',
            'content' => 'Cât face 2 + 2?',
            'points' => 1,
            'order' => 1,
            'answers' => [
                ['text' => '4', 'is_correct' => true],
                ['text' => '5', 'is_correct' => false],
            ],
        ]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'required' => true,
            'passing_score' => 50,
            'order' => 0,
        ]);

        // Foldere de întrebări pentru fiecare proiect (testele le mută/șterg).
        foreach (['desktop', 'mobile'] as $project) {
            $source = QuestionBank::create(['title' => "Folder sursă {$project}", 'status' => 'published', 'created_by' => $admin->id]);
            QuestionBank::create(['title' => "Folder țintă {$project}", 'status' => 'published', 'created_by' => $admin->id]);
            QuestionBank::create(['title' => "Folder de șters {$project}", 'status' => 'published', 'created_by' => $admin->id]);
            foreach (['Prima întrebare din folder', 'A doua întrebare din folder'] as $order => $content) {
                Question::factory()->create([
                    'test_id' => null,
                    'question_bank_id' => $source->id,
                    'content' => "{$content} ({$project})",
                    'order' => $order,
                ]);
            }
        }

        // Fișiere media pentru fiecare proiect: unul nefolosit (se poate șterge) și unul inserat în
        // lecția 3 ca PDF (adresă cu id-ul fișierului), deci ștergerea lui trebuie refuzată.
        $lessonWithPdf = Lesson::where('course_id', $course->id)->where('order', 3)->first();
        foreach (['desktop', 'mobile'] as $project) {
            foreach (['nefolosit', 'folosit'] as $kind) {
                $asset = MediaAsset::create([
                    'course_id' => $course->id,
                    'uploaded_by_user_id' => $admin->id,
                    'disk' => 'public',
                    'type' => 'document',
                    'path' => "content-blocks/document/e2e-{$kind}-{$project}.pdf",
                    'filename' => "{$kind}-{$project}.pdf",
                    'mime_type' => 'application/pdf',
                    'size' => 2048,
                ]);
                if ($kind === 'folosit' && $lessonWithPdf) {
                    Lesson::withoutEvents(fn () => $lessonWithPdf->update([
                        'content' => $lessonWithPdf->content . "<p><a href=\"/api/builder-media/{$course->id}/{$asset->id}\">PDF {$project}</a></p>",
                    ]));
                    $lessonWithPdf->refresh();
                }
            }
        }

        // Câte un curs pe proiect pentru editorul de lecții (testul îi schimbă conținutul).
        foreach (['desktop', 'mobile'] as $project) {
            $editorCourse = Course::withoutEvents(fn () => Course::factory()->create([
                'title' => "Curs editor {$project}",
                'description' => 'Curs modificat de testul editorului de lecții.',
                'teacher_id' => $admin->id,
                'status' => 'draft',
            ]));
            $editorModule = Module::withoutEvents(fn () => Module::create([
                'course_id' => $editorCourse->id,
                'title' => 'Modul editor',
                'order' => 1,
                'status' => 'draft',
            ]));
            Lesson::withoutEvents(fn () => Lesson::create([
                'course_id' => $editorCourse->id,
                'module_id' => $editorModule->id,
                'title' => 'Lecție de editat',
                'content' => '<p>Text inițial.</p>',
                'type' => 'text',
                'status' => 'draft',
                'order' => 1,
            ]));
        }

        // O mapă privată (doar pentru admin) cu două cursuri și o echipă: cardurile lor au butonul de reordonare.
        $map = CourseMap::create([
            'name' => 'Mapă E2E',
            'description' => 'Mapă folosită de testele end-to-end.',
            'visibility' => 'private',
            'created_by' => $admin->id,
            'order' => 0,
        ]);
        $map->courses()->attach([
            $course->id => ['order' => 0],
            Course::where('title', 'Curs editor desktop')->value('id') => ['order' => 1],
        ]);
        Team::create(['name' => 'Echipa E2E', 'description' => 'Echipă de test', 'owner_id' => $admin->id, 'sort_order' => 0]);
        Team::create(['name' => 'Echipa E2E 2', 'description' => 'A doua echipă de test', 'owner_id' => $admin->id, 'sort_order' => 1]);

        // Un test cu câte o întrebare din fiecare tip (editoarele de întrebări), nelegat de cursuri.
        $allTypes = Test::factory()->create([
            'title' => 'Test cu toate tipurile',
            'status' => 'draft',
            'created_by' => $admin->id,
            'max_attempts' => null,
            'passing_score' => 50,
        ]);
        $typed = [
            ['multiple_choice', 'Care sunt culori primare?', [['text' => 'Roșu', 'is_correct' => true], ['text' => 'Verde', 'is_correct' => false], ['text' => 'Albastru', 'is_correct' => true]]],
            ['single_choice', 'Care este cel mai mare ocean?', [['text' => 'Pacific', 'is_correct' => true], ['text' => 'Atlantic', 'is_correct' => false]]],
            ['true_false', 'Pământul este rotund.', [['text' => 'Adevărat', 'is_correct' => true], ['text' => 'Fals', 'is_correct' => false]]],
            ['yes_no', 'Ai citit regulamentul?', [['text' => 'Da', 'is_correct' => true], ['text' => 'Nu', 'is_correct' => false]]],
            ['matching', 'Potrivește țara cu capitala.', [
                ['left' => 'România', 'right' => 'București', 'text' => 'România', 'answer_text' => 'București', 'is_correct' => true, 'order' => 0],
                ['left' => 'Franța', 'right' => 'Paris', 'text' => 'Franța', 'answer_text' => 'Paris', 'is_correct' => true, 'order' => 1],
            ]],
            ['ordering', 'Ordonează pașii.', [
                ['text' => 'Pregătire', 'is_correct' => true, 'order' => 0],
                ['text' => 'Execuție', 'is_correct' => true, 'order' => 1],
                ['text' => 'Verificare', 'is_correct' => true, 'order' => 2],
            ]],
        ];
        foreach ($typed as $order => [$type, $content, $answers]) {
            Question::factory()->create([
                'test_id' => $allTypes->id, 'type' => $type, 'content' => $content,
                'answers' => $answers, 'points' => 1, 'order' => $order,
            ]);
        }

        // Cursanții văd doar cursurile atribuite.
        foreach ($students as $student) {
            DB::table('course_user')->insert([
                'course_id' => $course->id,
                'user_id' => $student->id,
                'enrolled' => true,
                'enrolled_at' => now(),
                'is_mandatory' => false,
                'assigned_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
