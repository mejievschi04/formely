<?php

namespace App\Services;

use App\Jobs\GenerateAiCourseStep;
use App\Models\AiCourseGeneration;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class StagedAiCourseGenerator
{
    public function __construct(private AiLessonQuality $quality, private CourseBuilderService $builder, private AiQuotaGate $quota) {}

    public function step(AiCourseGeneration $run): void
    {
        $input = $run->input;
        $brief = $input['guided_brief'];
        if ($run->outline === null) {
            $outline = $this->request(VoltPromptService::buildStagedCourseOutlinePrompt(), $input, $run->error);
            $this->validateOutline($outline, $brief);
            $this->checkpoint($run, ['outline' => $outline, 'status' => 'running', 'error' => null], 0);
            return;
        }
        if ($run->completed_lessons < $run->total_lessons) {
            $index = $run->completed_lessons;
            $perModule = (int) $brief['lessons_per_module'];
            $moduleIndex = intdiv($index, $perModule);
            $lessonIndex = $index % $perModule;
            $outline = $run->outline;
            $lesson = $outline['modules'][$moduleIndex]['lessons'][$lessonIndex];
            $data = $input + ['outline' => $outline, 'selected_lesson' => $lesson, 'module_index' => $moduleIndex, 'lesson_index' => $lessonIndex];
            // Goals/titles maintain continuity without resending entire finished lessons.
            $response = $this->request(VoltPromptService::buildSingleCourseLessonPrompt(), $data, $run->error);
            $content = $this->quality->validate($response, $brief['lesson_size'], $run->lessons ?? []);
            $saved = $run->lessons ?? [];
            $saved[] = ['title' => $lesson['title'], 'content' => $content];
            $this->checkpoint($run, ['lessons' => $saved, 'completed_lessons' => $index + 1, 'status' => 'running', 'error' => null], $index + 1);
            return;
        }

        DB::transaction(function () use ($run) {
            $locked = AiCourseGeneration::query()->lockForUpdate()->findOrFail($run->id);
            if ($locked->status === 'completed') {
                return;
            }
            $actor = User::query()->findOrFail($locked->user_id);
            $company = Company::query()->findOrFail($locked->company_id);
            abort_unless($actor->status === 'active' && (int) $actor->company_id === (int) $company->id, 403);
            abort_unless($company->isUsable() && app(PlanEntitlementService::class)->companyCan($company, 'ai_creator'), 403);
            $outline = $locked->outline;
            $course = $this->builder->createCourse([
                'title' => $outline['title'], 'description' => $outline['description'],
                'short_description' => $outline['short_description'] ?? mb_substr($outline['description'], 0, 150),
            ], $actor);
            $index = 0;
            foreach ($outline['modules'] as $i => $data) {
                $module = $this->builder->createModule($course, ['title' => $data['title'], 'description' => $data['description'] ?? '', 'order' => $i, 'status' => 'published']);
                foreach ($data['lessons'] as $j => $lesson) {
                    $this->builder->createLesson($module, $locked->lessons[$index++] + ['order' => $j, 'status' => 'published', 'type' => 'text']);
                }
            }
            $usage = $this->quota->recordSuccess($company, 'course_generation');
            $result = [
                'response_type' => 'course', 'course_id' => $course->id, 'course_created' => true,
                'content' => 'Cursul „'.$course->title.'” a fost creat: '.count($outline['modules']).' module și '.$index.' lecții. Este salvat ca draft, gata de verificare.',
                'ai_usage' => $usage,
            ];
            $locked->update(['status' => 'completed', 'result' => $result, 'error' => null, 'input' => []]);
        });
    }

    private function checkpoint(AiCourseGeneration $run, array $changes, int $nextStep): void
    {
        // The database queue and checkpoint commit together, including on worker restart.
        DB::transaction(function () use ($run, $changes, $nextStep) {
            $run->update($changes);
            GenerateAiCourseStep::dispatch($run->id, $nextStep)->beforeCommit();
        });
    }

    private function request(string $system, array $data, ?string $previousError = null): array
    {
        $provider = config('ai.provider');
        if (!in_array($provider, ['openai', 'groq']) || !config('ai.enabled')) {
            throw new \RuntimeException('Serviciul AI nu este disponibil.');
        }
        // Bound source context independently of lesson count and preserve every source.
        $sources = $data['attachments'] ?? [];
        $budget = intdiv(48000, max(1, count($sources) + 1));
        $data['source_text'] = mb_substr((string) ($data['source_text'] ?? ''), 0, $budget);
        $data['attachments'] = array_map(fn ($source) => ['name' => $source['name'], 'text' => mb_substr($source['text'], 0, $budget)], $sources);
        $messages = [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
        ];
        if ($previousError) {
            $messages[] = ['role' => 'user', 'content' => 'Corectează problema din încercarea precedentă a acestei etape: '.$previousError];
        }
        $response = Http::withToken(config("ai.$provider.api_key"))->acceptJson()
            ->timeout(min(180, max(10, (int) config('ai.timeouts.request', 180))))
            ->connectTimeout(15)->withOptions(['verify' => (bool) config('ai.verify_ssl', true)])
            ->post(rtrim(config("ai.$provider.api_url"), '/').'/chat/completions', [
                'model' => config("ai.$provider.creator_model") ?: config("ai.$provider.model"),
                'messages' => $messages, 'stream' => false, 'temperature' => 0.2,
                'max_tokens' => isset($data['selected_lesson']) ? 6000 : 8192, 'response_format' => ['type' => 'json_object'],
            ]);
        if (!$response->successful()) {
            // Never store provider response bodies or credentials in user-visible errors.
            throw new \RuntimeException('Furnizorul AI nu a putut finaliza etapa (HTTP '.$response->status().'). Reîncearcă etapa.');
        }
        if (data_get($response->json(), 'choices.0.finish_reason') === 'length') {
            throw new \RuntimeException('Răspunsul etapei a depășit limita. Livrează numai structura sau lecția cerută, fără repetiții.');
        }
        $text = data_get($response->json(), 'choices.0.message.content');
        $decoded = is_string($text) ? json_decode($text, true) : null;
        if (!is_array($decoded) || array_is_list($decoded)) {
            throw new \RuntimeException('Etapa nu a returnat un obiect JSON valid.');
        }
        return $decoded;
    }

    private function validateOutline(array $outline, array $brief): void
    {
        validator($outline, [
            'title' => 'required|string|max:255', 'description' => 'required|string|max:10000',
            'short_description' => 'nullable|string|max:255',
            'modules' => 'required|array|size:'.$brief['modules_count'],
            'modules.*.title' => 'required|string|max:255', 'modules.*.description' => 'nullable|string|max:5000',
            'modules.*.lessons' => 'required|array|size:'.$brief['lessons_per_module'],
            'modules.*.lessons.*.title' => 'required|string|max:255',
            'modules.*.lessons.*.goal' => 'required|string|max:2000',
            'modules.*.lessons.*.kind' => 'required|in:concept,procedure,case,technical,consolidation',
        ])->validate();
    }
}
