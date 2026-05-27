<?php

/**
 * Script pentru a adăuga lecții de test în modulele goale
 */

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Course;
use App\Models\Module;
use App\Models\Lesson;
use App\Services\CourseBuilderService;

echo "========================================\n";
echo "ADĂUGARE LECȚII ÎN MODULE GOALE\n";
echo "========================================\n\n";

$courseBuilderService = app(CourseBuilderService::class);

// Găsește modulele fără lecții
$modulesWithoutLessons = Module::whereDoesntHave('lessons')->get();

if ($modulesWithoutLessons->count() === 0) {
    echo "✅ Nu există module fără lecții!\n";
    exit(0);
}

echo "Găsite {$modulesWithoutLessons->count()} module fără lecții:\n\n";

foreach ($modulesWithoutLessons as $module) {
    $course = $module->course;
    echo "Modul: \"{$module->title}\" (ID: {$module->id})\n";
    echo "Curs: \"{$course->title}\" (ID: {$course->id})\n";
    
    // Adaugă 2-3 lecții de test pentru fiecare modul
    $lessonTitles = [
        "Introducere în {$module->title}",
        "Dezvoltare - {$module->title}",
        "Concluzie - {$module->title}"
    ];
    
    foreach ($lessonTitles as $index => $title) {
        try {
            $lesson = $courseBuilderService->createLesson($module, [
                'title' => $title,
                'content' => "<h1>{$title}</h1><p>Acesta este conținutul lecției. Poți edita acest conținut din panoul de administrare.</p><h2>Obiective</h2><ul><li>Înțelegerea conceptelor de bază</li><li>Aplicarea cunoștințelor practice</li><li>Evaluarea progresului</li></ul>",
                'type' => 'text',
                'duration_minutes' => 15 + ($index * 5),
                'order' => $index,
                'status' => 'published',
            ]);
            
            echo "  ✅ Lecție creată: \"{$lesson->title}\" (ID: {$lesson->id})\n";
        } catch (\Exception $e) {
            echo "  ❌ Eroare la crearea lecției: {$e->getMessage()}\n";
        }
    }
    
    echo "\n";
}

echo "========================================\n";
echo "PROCES COMPLET\n";
echo "========================================\n";

// Verificare finală
$modulesStillEmpty = Module::whereDoesntHave('lessons')->count();
if ($modulesStillEmpty > 0) {
    echo "⚠️  Încă există {$modulesStillEmpty} module fără lecții\n";
} else {
    echo "✅ Toate modulele au acum lecții!\n";
}
