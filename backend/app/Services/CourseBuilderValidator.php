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
                $this->validateLesson($lesson, $addError);
            }
        }

        foreach ($rootLessons as $lesson) {
            $this->validateLesson($lesson, $addError);
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

    protected function validateLesson($lesson, callable $addError): void
    {
        if (!trim((string) $lesson->title)) {
            $addError('lesson.title.required', "lessons.{$lesson->id}.title", 'Titlul lectiei este obligatoriu.');
        }

        $blocks = $lesson->contentBlocks ?? collect();
        $hasLegacyContent = trim((string) ($lesson->content ?? '')) !== '';

        if ($blocks->count() === 0 && !$hasLegacyContent) {
            $addError(
                'lesson.content.required',
                "lessons.{$lesson->id}.content",
                'Lectia trebuie sa contina continut (minim un content block sau text).'
            );
        }
    }
}
