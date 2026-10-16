<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\User;
use App\Support\HtmlSanitizer;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AiCoursePlanService
{
    public function __construct(private CourseBuilderService $builder) {}

    public function revision(int $courseId): string
    {
        return hash('sha256', json_encode([
            Course::findOrFail($courseId)->getAttributes(),
            Module::where('course_id', $courseId)->orderBy('id')->get()->map->getAttributes()->all(),
            Lesson::where('course_id', $courseId)->orderBy('id')->get()->map->getAttributes()->all(),
            \App\Models\ContentBlock::whereIn('lesson_id', Lesson::where('course_id', $courseId)->select('id'))->orderBy('id')->get()->map->getAttributes()->all(),
        ], JSON_THROW_ON_ERROR));
    }

    public function normalize(array $plan): array
    {
        $plan = validator($plan, [
            'operations' => 'sometimes|array|max:100',
            'operations.*' => 'array',
            'course_updates' => 'sometimes|array',
            'base_revision' => 'nullable|string|size:64',
        ])->validate();
        $updates = validator($plan['course_updates'] ?? [], [
            'title' => 'sometimes|required|string|max:255', 'description' => 'sometimes|nullable|string|max:50000',
            'short_description' => 'sometimes|nullable|string|max:1000', 'card_color' => 'sometimes|nullable|string|max:50',
            'level' => 'sometimes|nullable|string|max:50', 'status' => 'sometimes|in:draft',
            'visibility' => 'sometimes|in:public,private', 'estimated_duration_hours' => 'sometimes|numeric|min:0',
            'sequential_unlock' => 'sometimes|boolean', 'min_test_score' => 'sometimes|numeric|min:0|max:100',
            'has_certificate' => 'sometimes|boolean', 'marketing_tags' => 'sometimes|array',
            'marketing_tags.*' => 'string|max:100',
        ])->validate();
        $operations = [];
        foreach ($plan['operations'] ?? [] as $index => $operation) {
            $rawType = $operation['op'] ?? null;
            if (!is_string($rawType)) $this->invalid("operations.$index.op", 'Lipsește tipul operației.');
            $type = match (strtolower(str_replace('_', '', trim($rawType)))) {
                'createmodule' => 'create_module', 'updatemodule' => 'update_module', 'deletemodule' => 'delete_module',
                'createlesson' => 'create_lesson', 'updatelesson' => 'update_lesson', 'deletelesson' => 'delete_lesson',
                'reordermodules' => 'reorderModules', 'reorderlessons' => 'reorderLessons', 'movelesson' => 'moveLesson',
                default => null,
            };
            if ($type === null) $this->invalid("operations.$index.op", 'Operație necunoscută în planul AI.');
            $operation['op'] = $type;
            if (array_key_exists('body', $operation) || array_key_exists('html', $operation)) {
                $operation['content'] = $operation['content'] ?? $operation['body'] ?? $operation['html'];
            }
            $rules = ['op' => 'required|string'];
            if (in_array($type, ['create_module', 'update_module', 'create_lesson', 'update_lesson'], true)) {
                $rules += ['title' => str_starts_with($type, 'create') ? 'required|string|max:255' : 'sometimes|required|string|max:255',
                    'status' => 'sometimes|in:draft,published', 'order' => 'sometimes|integer|min:0'];
            }
            if (in_array($type, ['create_module', 'update_module'], true)) {
                $rules += ['description' => 'sometimes|nullable|string|max:50000',
                    'lessons' => $type === 'create_module' ? 'required|array|min:1|max:50' : 'sometimes|array|max:50',
                    'lessons.*' => 'array', 'lessons.*.title' => 'required|string|max:255',
                    'lessons.*.content' => 'required|string|max:120000', 'lessons.*.status' => 'sometimes|in:draft,published',
                    'lessons.*.order' => 'sometimes|integer|min:0', 'lessons.*.is_preview' => 'sometimes|boolean'];
                foreach ((is_array($operation['lessons'] ?? null) ? $operation['lessons'] : []) as $key => $lesson) {
                    if (is_array($lesson)) $operation['lessons'][$key]['content'] = $lesson['content'] ?? $lesson['body'] ?? $lesson['html'] ?? null;
                }
            }
            if (in_array($type, ['create_lesson', 'update_lesson'], true)) {
                $rules += ['content' => $type === 'create_lesson' ? 'required|string|max:120000' : 'sometimes|required|string|max:120000',
                    'is_preview' => 'sometimes|boolean'];
            }
            if (in_array($type, ['update_module', 'delete_module', 'reorderLessons'], true)) $rules['module_id'] = 'required|integer|min:1';
            if ($type === 'create_lesson') $rules['module_id'] = 'nullable|integer|min:1';
            if (in_array($type, ['update_lesson', 'delete_lesson', 'moveLesson'], true)) $rules['lesson_id'] = 'required|integer|min:1';
            if ($type === 'moveLesson') $rules += ['to_module_id' => 'present|nullable|integer|min:1', 'to_index' => 'sometimes|integer|min:0'];
            if (in_array($type, ['reorderModules', 'reorderLessons'], true)) {
                $key = $type === 'reorderModules' ? 'module_ids' : 'lesson_ids';
                $rules += [$key => 'required|array|min:1|max:200', "$key.*" => 'required|integer|min:1|distinct'];
            }
            $operation = validator($operation, $rules)->validate();
            if (in_array($type, ['update_lesson', 'update_module'], true) && !array_filter(Arr::except($operation, ['op', 'module_id', 'lesson_id']), fn ($value) => $value !== [])) {
                $this->invalid("operations.$index", 'Operația de actualizare nu conține schimbări.');
            }
            if (isset($operation['content'])) $operation['content'] = $this->lessonContent($operation['content'], "operations.$index.content", $type !== 'update_lesson');
            foreach ($operation['lessons'] ?? [] as $key => $lesson) {
                $operation['lessons'][$key]['content'] = $this->lessonContent($lesson['content'], "operations.$index.lessons.$key.content");
            }
            $operations[] = $operation;
        }
        if (!$operations && !$updates) $this->invalid('operations', 'Planul AI nu conține schimbări aplicabile.');

        return ['operations' => $operations, 'course_updates' => $updates, 'base_revision' => $plan['base_revision'] ?? null];
    }

    public function apply(int $courseId, array $plan, User $actor): array
    {
        $plan = $this->normalize($plan);
        if ($plan['base_revision'] === null) $this->invalid('base_revision', 'Regenerează propunerea AI pentru a verifica versiunea curentă a cursului.');

        return DB::transaction(function () use ($courseId, $plan, $actor) {
            $course = Course::whereKey($courseId)->lockForUpdate()->firstOrFail();
            abort_if($plan['base_revision'] !== null && !hash_equals($this->revision($courseId), $plan['base_revision']), 409,
                'Cursul a fost modificat între timp. Regenerează planul AI înainte să îl aplici.');
            $steps = 0;
            if ($plan['course_updates']) {
                $this->builder->updateCourse($course, $plan['course_updates']);
                $steps++;
            }
            foreach ($plan['operations'] as $operation) {
                $type = $operation['op'];
                $data = Arr::except($operation, ['op', 'module_id', 'lesson_id', 'lessons']);
                if ($type === 'create_module') {
                    $module = $this->builder->createModule($course, $data + ['status' => 'draft']);
                    foreach ($operation['lessons'] as $lesson) { $this->builder->createLesson($module, $lesson + ['status' => 'draft']); $steps++; }
                } elseif ($type === 'update_module' || $type === 'delete_module') {
                    $module = Module::where('course_id', $courseId)->findOrFail($operation['module_id']);
                    if ($type === 'delete_module') $this->builder->deleteModule($module);
                    else {
                        if ($data) $this->builder->updateModule($module, $data);
                        foreach ($operation['lessons'] ?? [] as $lesson) { $this->builder->createLesson($module, $lesson + ['status' => 'draft']); $steps++; }
                    }
                } elseif ($type === 'create_lesson') {
                    $module = !empty($operation['module_id']) ? Module::where('course_id', $courseId)->findOrFail($operation['module_id']) : null;
                    if ($module) $this->builder->createLesson($module, $data + ['status' => 'draft']);
                    else $this->builder->createCourseLesson($course, $data + ['status' => 'draft']);
                } elseif ($type === 'update_lesson' || $type === 'delete_lesson') {
                    $lesson = Lesson::where('course_id', $courseId)->findOrFail($operation['lesson_id']);
                    if ($type === 'delete_lesson') $this->builder->deleteLesson($lesson);
                    else $this->builder->updateLesson($lesson, $data);
                } else {
                    $this->builder->applyStructurePatch($courseId, [$operation], $actor);
                }
                $steps++;
            }
            ActivityLog::create(['user_id' => $actor->id, 'action' => 'builder.apply_ai_plan', 'model_type' => Course::class,
                'model_id' => $courseId, 'description' => 'Aplicare plan AI confirmat', 'new_values' => ['applied_steps' => $steps]]);

            return ['appliedSteps' => $steps, 'revision' => $this->revision($courseId)];
        });
    }

    private function lessonContent(string $content, string $path, bool $requireDeveloped = true): string
    {
        $content = str_replace('<\\/', '</', $content);
        $content = HtmlSanitizer::clean($content);
        // Same developed-prose rule as the generation validator, without requiring artificial paragraphs.
        $plain = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (trim($plain) === '') $this->invalid($path, 'Conținutul lecției nu poate fi gol.');
        if (!$requireDeveloped) return $content;
        $words = preg_match_all('/[\p{L}\p{N}]+/u', $plain) ?: 0;
        $lines = preg_split('/\n+/', strip_tags(preg_replace('/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/i', "\n", $content))) ?: [];
        $sentences = preg_split('/(?<=[.!?])\s+|[;\n]+/u', trim($plain)) ?: [];
        $lineCount = count(array_filter($lines, fn ($line) => trim($line) !== ''));
        $sentenceCount = count(array_filter($sentences, fn ($sentence) => mb_strlen(trim($sentence)) >= 20));
        if (max($lineCount, $sentenceCount, intdiv($words, 20)) < 4) $this->invalid($path, 'Lecția nu are conținut suficient. Dezvoltă explicația și exemplul.');

        return $content;
    }

    private function invalid(string $path, string $message): never
    {
        throw ValidationException::withMessages([$path => $message]);
    }
}
