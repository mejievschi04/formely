<?php

namespace App\Services;

use App\Models\Course;

class CourseBuilderValidator
{
    /**
     * Returns a validation report suitable for UI display.
     *
     * Shape:
     * - ok: bool
     * - errors: [{ code, path, message }]
     * - warnings: [{ code, path, message }]
     */
    public function validate(Course $course): array
    {
        $errors = [];
        $warnings = [];

        $addError = function (string $code, string $path, string $message) use (&$errors) {
            $errors[] = compact('code', 'path', 'message');
        };
        $addWarning = function (string $code, string $path, string $message) use (&$warnings) {
            $warnings[] = compact('code', 'path', 'message');
        };

        if (!trim((string) $course->title)) {
            $addError('course.title.required', 'course.title', 'Titlul cursului este obligatoriu.');
        }

        if (!trim((string) $course->description)) {
            $addWarning('course.description.missing', 'course.description', 'Descrierea cursului lipseste (recomandat pentru B2B/B2C).');
        }

        if (!$course->image) {
            $addWarning('course.thumbnail.missing', 'course.image', 'Thumbnail-ul lipseste (recomandat).');
        }

        $modules = $course->modules ?? collect();
        $rootLessons = $course->lessons()->whereNull('module_id')->with('contentBlocks')->get();

        if ($modules->count() === 0 && $rootLessons->count() === 0) {
            $addError('course.structure.required', 'course.structure', 'Cursul trebuie sa aiba cel putin un modul sau o lectie directa.');
        }

        foreach ($modules as $module) {
            if (!trim((string) $module->title)) {
                $addError('module.title.required', "modules.{$module->id}.title", 'Titlul modulului este obligatoriu.');
            }

            $lessons = $module->lessons ?? collect();
            if ($lessons->count() === 0) {
                $addError('module.lessons.required', "modules.{$module->id}.lessons", 'Modulul trebuie sa aiba cel putin o lectie.');
            }

            foreach ($lessons as $lesson) {
                $this->validateLesson($lesson, $addError, $addWarning);
            }
        }

        foreach ($rootLessons as $lesson) {
            $this->validateLesson($lesson, $addError, $addWarning);
        }

        $course->loadMissing(['courseTests.test.questions', 'courseTests.test.questionBank.questions']);
        foreach ($course->courseTests ?? [] as $courseTest) {
            $test = $courseTest->test;
            if (! $test) {
                continue;
            }
            $questionCount = $this->linkedTestQuestionCount($test);
            if ((bool) ($courseTest->required ?? false) && $questionCount === 0) {
                $addError(
                    'assessment.questions.required',
                    "course_tests.{$courseTest->id}",
                    'Testul obligatoriu „' . ($test->title ?: 'fără titlu') . '” nu are întrebări și nu poate fi publicat odată cu cursul.'
                );
            }
        }

        if ($course->sequential_unlock) {
            $addWarning('course.sequential_unlock.enabled', 'course.sequential_unlock', 'Sequential unlock este activ; verifica dependentele si lectiile preview.');
        }

        return [
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    public function qualityAudit(Course $course): array
    {
        $course->loadMissing(['modules.lessons.contentBlocks', 'lessons.contentBlocks', 'courseTests.test']);

        $issues = [];
        $strengths = [];
        $recommendations = [];

        $modules = $course->modules ?? collect();
        $rootLessons = $course->lessons ?? collect();
        $allLessons = $modules->flatMap(fn ($module) => $module->lessons ?? collect())
            ->concat($rootLessons)
            ->values();

        $addIssue = function (string $severity, string $category, string $title, string $message, string $path = 'course') use (&$issues) {
            $issues[] = compact('severity', 'category', 'title', 'message', 'path');
        };

        if (!trim((string) $course->description)) {
            $addIssue('warning', 'course_positioning', 'Descriere lipsă', 'Cursul nu are o descriere clară pentru elevi.', 'course.description');
            $recommendations[] = 'Adaugă o descriere orientată pe rezultat: ce va putea face elevul după curs.';
        } else {
            $strengths[] = 'Cursul are descriere.';
        }

        if ($modules->count() === 0 && $rootLessons->count() === 0) {
            $addIssue('critical', 'structure', 'Structură lipsă', 'Cursul nu are module sau lecții.', 'course.structure');
        } elseif ($modules->count() > 0) {
            $strengths[] = 'Cursul are structură pe module.';
        }

        $emptyLessons = 0;
        $shortLessons = 0;
        $longLessons = 0;
        $lessonsWithoutDuration = 0;

        foreach ($allLessons as $lesson) {
            $textLength = $this->lessonTextLength($lesson);
            $duration = (int) ($lesson->duration_minutes ?? 0);
            $path = 'lessons.' . $lesson->id;

            // Lecția doar cu video (link extern redat în lecție) nu e goală și nu are de ce să fie „prea scurtă”.
            if ($textLength === 0 && $this->htmlHasEmbeddedVideo((string) ($lesson->content ?? ''))) {
                continue;
            }

            if ($textLength === 0) {
                $emptyLessons++;
                $addIssue('warning', 'lesson_content', 'Lecție fără text', "Lecția „{$lesson->title}” nu are text. Poate rămâne așa.", $path);
                continue;
            }

            if ($textLength < 450) {
                $shortLessons++;
                $addIssue('warning', 'lesson_depth', 'Lecție prea scurtă', "Lecția „{$lesson->title}” pare prea scurtă pentru predare solidă.", $path);
            }

            if ($textLength > 12000) {
                $longLessons++;
                $addIssue('info', 'lesson_depth', 'Lecție foarte lungă', "Lecția „{$lesson->title}” este lungă și poate necesita împărțire.", $path);
            }

            if ($duration <= 0) {
                $lessonsWithoutDuration++;
                $addIssue('info', 'lesson_metadata', 'Durată lipsă', "Lecția „{$lesson->title}” nu are durată estimată.", $path . '.duration_minutes');
            }
        }

        if ($allLessons->count() > 0 && $emptyLessons === 0) {
            $strengths[] = 'Toate lecțiile au conținut.';
        }

        foreach ($modules as $module) {
            $lessons = $module->lessons ?? collect();
            if ($lessons->count() === 0) {
                $addIssue('critical', 'structure', 'Modul fără lecții', "Modulul „{$module->title}” nu are lecții.", 'modules.' . $module->id);
            }
            if (!trim((string) ($module->objective ?? '')) && !trim((string) ($module->description ?? ''))) {
                $addIssue('warning', 'learning_objectives', 'Obiectiv de modul neclar', "Modulul „{$module->title}” nu are obiectiv/descriere clară.", 'modules.' . $module->id);
            }
        }

        $testsCount = $course->courseTests?->count() ?? 0;
        if ($testsCount === 0) {
            $addIssue('warning', 'assessment', 'Lipsesc evaluările', 'Cursul nu are teste atașate pentru verificarea învățării.', 'course.tests');
            $recommendations[] = 'Adaugă cel puțin un test final sau checkpoint-uri pe module.';
        } else {
            $strengths[] = "Cursul are {$testsCount} test(e) atașate.";
        }

        if ($shortLessons > 0) {
            $recommendations[] = 'Extinde lecțiile scurte cu exemple, pași practici și verificări rapide.';
        }
        if ($longLessons > 0) {
            $recommendations[] = 'Împarte lecțiile foarte lungi în secțiuni mai ușor de parcurs.';
        }
        if ($lessonsWithoutDuration > 0) {
            $recommendations[] = 'Completează durata estimată pentru lecții ca elevii să își poată planifica timpul.';
        }

        $criticalCount = count(array_filter($issues, fn ($issue) => $issue['severity'] === 'critical'));
        $warningCount = count(array_filter($issues, fn ($issue) => $issue['severity'] === 'warning'));
        $infoCount = count(array_filter($issues, fn ($issue) => $issue['severity'] === 'info'));
        $score = max(0, min(100, 100 - ($criticalCount * 25) - ($warningCount * 10) - ($infoCount * 3)));

        return [
            'readiness_score' => $score,
            'status' => $score >= 85 ? 'ready' : ($score >= 65 ? 'needs_review' : 'not_ready'),
            'summary' => [
                'modules' => $modules->count(),
                'lessons' => $allLessons->count(),
                'tests' => $testsCount,
                'critical_issues' => $criticalCount,
                'warnings' => $warningCount,
                'info' => $infoCount,
            ],
            'strengths' => array_values(array_unique($strengths)),
            'issues' => $issues,
            'recommendations' => array_values(array_unique($recommendations)),
            'publish_blocked' => $criticalCount > 0,
        ];
    }

    protected function validateLesson($lesson, callable $addError, callable $addWarning): void
    {
        if (!trim((string) $lesson->title)) {
            $addError('lesson.title.required', "lessons.{$lesson->id}.title", 'Titlul lectiei este obligatoriu.');
        }

        $hasUsableContent = $this->lessonHasUsableContent($lesson);
        if (! $hasUsableContent) {
            $addWarning(
                'lesson.content.missing',
                "lessons.{$lesson->id}.content",
                'Lectia nu are text. Poate fi salvata si publicata si fara continut textual.'
            );
        }
    }

    protected function lessonHasUsableContent($lesson): bool
    {
        if ($this->htmlHasText((string) ($lesson->content ?? ''))) {
            return true;
        }
        if (trim((string) ($lesson->video_url ?? '')) !== '') {
            return true;
        }
        if ($this->htmlHasEmbeddedVideo((string) ($lesson->content ?? ''))) {
            return true;
        }

        foreach ($lesson->contentBlocks ?? collect() as $block) {
            if (isset($block->visible) && $block->visible === false) {
                continue;
            }
            $type = (string) ($block->type ?? '');
            $source = trim((string) ($block->source ?? ''));
            $payload = is_array($block->payload ?? null) ? $block->payload : [];
            $payloadText = '';
            foreach (['content', 'text', 'html', 'description', 'transcript', 'instructions'] as $key) {
                if (!empty($payload[$key]) && is_scalar($payload[$key])) {
                    $payloadText .= ' ' . $payload[$key];
                }
            }
            if (in_array($type, ['video', 'file', 'image', 'pdf', 'document'], true)) {
                if ($source !== '' || !empty($payload['url']) || !empty($payload['src']) || !empty($payload['path'])) {
                    return true;
                }
                continue;
            }
            if ($source !== '' || $this->htmlHasText($payloadText)) {
                return true;
            }
        }

        return false;
    }

    /** Video adăugat din editorul de lecții (figure data-lesson-video cu linkul original). */
    protected function htmlHasEmbeddedVideo(string $html): bool
    {
        return (bool) preg_match('/<figure\b[^>]*\bdata-lesson-video=["\']true["\'][^>]*\bdata-src=["\'][^"\']+["\']|<figure\b[^>]*\bdata-src=["\'][^"\']+["\'][^>]*\bdata-lesson-video=["\']true["\']/i', $html);
    }

    protected function htmlHasText(string $html): bool
    {
        $text = trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = preg_replace('/\x{00a0}|\s+/u', ' ', $text ?? '') ?? '';

        return trim($text) !== '';
    }

    protected function lessonTextLength($lesson): int
    {
        $parts = [];
        foreach ($lesson->contentBlocks ?? collect() as $block) {
            $payload = is_array($block->payload ?? null) ? $block->payload : [];
            foreach (['content', 'text', 'html', 'description', 'transcript', 'instructions'] as $key) {
                if (!empty($payload[$key]) && is_scalar($payload[$key])) {
                    $parts[] = (string) $payload[$key];
                }
            }
            if (!empty($block->source)) {
                $parts[] = (string) $block->source;
            }
        }
        if (!empty($lesson->content)) {
            $parts[] = (string) $lesson->content;
        }

        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(implode(' ', $parts)), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');

        return mb_strlen($text);
    }

    protected function linkedTestQuestionCount($test): int
    {
        if (($test->question_source ?? '') === 'bank' && $test->questionBank) {
            return (int) $test->questionBank->questions->count();
        }

        return (int) $test->questions->count();
    }
}
