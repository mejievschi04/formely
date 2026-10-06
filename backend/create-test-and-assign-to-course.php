<?php

/**
 * Script pentru crearea unui test și atribuirea lui la un curs
 * 
 * Utilizare:
 *   php create-test-and-assign-to-course.php [course_id] [--required]
 * 
 * Dacă course_id nu este specificat, va crea un curs nou.
 * --required face testul obligatoriu (implicit: true)
 */

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Course;
use App\Models\Test;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\User;
use App\Services\TestBuilderService;

echo "========================================\n";
echo "CREARE TEST ȘI ATRIBUȚIE LA CURS\n";
echo "========================================\n\n";

// Parse arguments
$courseId = $argv[1] ?? null;
$isRequired = !in_array('--optional', $argv);

// Get or create admin user
$admin = User::where('role', 'admin')->first();
if (!$admin) {
    $admin = User::factory()->create([
        'role' => 'admin',
        'email' => 'admin@volta.academy',
        'name' => 'Admin',
    ]);
    echo "✅ Utilizator admin creat: {$admin->email}\n\n";
}

// Get or create course
if ($courseId) {
    $course = Course::find($courseId);
    if (!$course) {
        echo "❌ Cursul cu ID {$courseId} nu a fost găsit!\n";
        exit(1);
    }
    echo "📚 Folosind cursul existent: \"{$course->title}\" (ID: {$course->id})\n\n";
} else {
    // Create a new course
    $course = Course::create([
        'title' => 'Curs de Test - ' . date('Y-m-d H:i'),
        'description' => 'Curs creat automat pentru testare',
        'status' => 'published',
        'teacher_id' => $admin->id,
        'reward_points' => 50,
    ]);
    echo "✅ Curs nou creat: \"{$course->title}\" (ID: {$course->id})\n\n";
}

// Create test using TestBuilderService
$testBuilderService = app(TestBuilderService::class);

$testData = [
    'title' => 'Test Final - ' . $course->title,
    'description' => 'Test final pentru evaluarea cunoștințelor',
    'type' => 'graded',
    'status' => 'published',
    'time_limit_minutes' => 30,
    'max_attempts' => 3,
    'randomize_questions' => false,
    'randomize_answers' => false,
    'show_results_immediately' => true,
    'show_correct_answers' => true,
    'allow_review' => true,
    'question_source' => 'direct',
    'questions' => [
        [
            'type' => 'multiple_choice',
            'content' => 'Care este capitala României?',
            'answers' => [
                ['text' => 'București', 'is_correct' => true],
                ['text' => 'Cluj-Napoca', 'is_correct' => false],
                ['text' => 'Timișoara', 'is_correct' => false],
                ['text' => 'Iași', 'is_correct' => false],
            ],
            'points' => 10,
            'explanation' => 'București este capitala și cel mai mare oraș al României.',
        ],
        [
            'type' => 'multiple_choice',
            'content' => 'Câte module are acest curs?',
            'answers' => [
                ['text' => '1 modul', 'is_correct' => false],
                ['text' => '2 module', 'is_correct' => false],
                ['text' => '3 module', 'is_correct' => false],
                ['text' => 'Depinde de curs', 'is_correct' => true],
            ],
            'points' => 10,
            'explanation' => 'Numărul de module variază în funcție de structura cursului.',
        ],
        [
            'type' => 'multiple_choice',
            'content' => 'Ce este un test obligatoriu?',
            'answers' => [
                ['text' => 'Un test care trebuie promovat pentru a finaliza cursul', 'is_correct' => true],
                ['text' => 'Un test opțional', 'is_correct' => false],
                ['text' => 'Un test de practică', 'is_correct' => false],
                ['text' => 'Un test care nu se notează', 'is_correct' => false],
            ],
            'points' => 10,
            'explanation' => 'Un test obligatoriu trebuie promovat pentru a finaliza cursul.',
        ],
    ],
];

try {
    $test = $testBuilderService->createTest($testData, $admin);
    echo "✅ Test creat: \"{$test->title}\" (ID: {$test->id})\n";
    echo "   Status: {$test->status}\n";
    echo "   Întrebări: " . $test->questions()->count() . "\n";
    echo "   Tip: {$test->type}\n\n";
} catch (\Exception $e) {
    echo "❌ Eroare la crearea testului: {$e->getMessage()}\n";
    exit(1);
}

// Assign test to course
try {
    $courseTest = CourseTest::create([
        'course_id' => $course->id,
        'test_id' => $test->id,
        'scope' => 'course',
        'required' => $isRequired,
        'passing_score' => 70,
        'order' => 1,
    ]);

    echo "✅ Test atribuit cursului:\n";
    echo "   Curs: \"{$course->title}\" (ID: {$course->id})\n";
    echo "   Test: \"{$test->title}\" (ID: {$test->id})\n";
    echo "   Obligatoriu: " . ($isRequired ? 'Da' : 'Nu') . "\n";
    echo "   Scor minim: 70%\n";
    echo "   Scope: course\n\n";
} catch (\Exception $e) {
    echo "❌ Eroare la atribuirea testului: {$e->getMessage()}\n";
    exit(1);
}

// Verify assignment
$requiredTestsCount = CourseTest::where('course_id', $course->id)
    ->where('required', true)
    ->count();

echo "========================================\n";
echo "VERIFICARE\n";
echo "========================================\n";
echo "✅ Cursul \"{$course->title}\" are {$requiredTestsCount} test(e) obligatoriu(ri)\n";
echo "✅ Testul poate fi folosit pentru cursuri obligatorii\n\n";

// Summary
echo "========================================\n";
echo "REZUMAT\n";
echo "========================================\n";
echo "Curs ID: {$course->id}\n";
echo "Curs: \"{$course->title}\"\n";
echo "Test ID: {$test->id}\n";
echo "Test: \"{$test->title}\"\n";
echo "Obligatoriu: " . ($isRequired ? 'Da' : 'Nu') . "\n";
echo "Întrebări: " . $test->questions()->count() . "\n";
echo "\n✅ Proces completat cu succes!\n\n";
