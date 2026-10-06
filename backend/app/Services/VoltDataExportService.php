<?php

namespace App\Services;

use App\Http\Controllers\Api\Admin\StatisticsAdminController;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class VoltDataExportService
{
    private const MAX_ROWS = 5000;

    private const DATASETS = [
        'student_progress' => [
            'label' => 'Progres elevi',
            'columns' => [
                'id' => 'ID elev',
                'name' => 'Nume',
                'email' => 'Email',
                'courses_completed' => 'Cursuri finalizate',
                'lessons_completed' => 'Lecții finalizate',
                'tests_completed' => 'Teste finalizate',
                'avg_score' => 'Scor mediu teste (%)',
                'learning_time' => 'Timp învățare',
                'registered_at' => 'Data înregistrării',
            ],
        ],
        'enrollments' => [
            'label' => 'Înscrieri cursuri',
            'columns' => [
                'student_name' => 'Nume elev',
                'student_email' => 'Email elev',
                'course_title' => 'Curs',
                'progress_percent' => 'Progres (%)',
                'lessons_completed' => 'Lecții finalizate',
                'time_spent' => 'Timp petrecut',
                'enrolled_at' => 'Data înscrierii',
                'completed_at' => 'Data finalizării',
            ],
        ],
        'test_results' => [
            'label' => 'Rezultate teste',
            'columns' => [
                'student_name' => 'Nume elev',
                'student_email' => 'Email elev',
                'test_title' => 'Test',
                'course_title' => 'Curs',
                'score' => 'Scor',
                'max_score' => 'Scor maxim',
                'percentage' => 'Procent (%)',
                'passed' => 'Promovat',
                'attempt' => 'Încercare',
                'completed_at' => 'Data finalizării',
            ],
        ],
        'courses_overview' => [
            'label' => 'Sumar cursuri',
            'columns' => [
                'course_title' => 'Curs',
                'enrolled_students' => 'Elevi înscriși',
                'avg_progress' => 'Progres mediu (%)',
                'completed_count' => 'Finalizări',
                'completion_rate' => 'Rată finalizare (%)',
            ],
        ],
        'top_students' => [
            'label' => 'Top studenți',
            'columns' => [
                'rank' => 'Loc',
                'name' => 'Nume',
                'email' => 'Email',
                'courses_completed' => 'Cursuri finalizate',
                'lessons_completed' => 'Lecții finalizate',
                'avg_test_score' => 'Scor mediu teste (%)',
                'learning_time' => 'Timp învățare',
            ],
        ],
    ];

    public function __construct(
        private StatisticsAdminController $statisticsAdmin
    ) {
    }

    public function generateFromPrompt(string $prompt, array $options = []): array
    {
        $prompt = trim($prompt);
        if ($prompt === '') {
            throw new \InvalidArgumentException('Descrie ce date vrei exportate.');
        }

        $plan = $this->resolveExportPlan($prompt, $options);
        $datasetKey = (string) ($plan['dataset'] ?? 'student_progress');
        if (!isset(self::DATASETS[$datasetKey])) {
            $datasetKey = 'student_progress';
        }

        $filters = is_array($plan['filters'] ?? null) ? $plan['filters'] : [];
        if (!empty($options['date_from']) && empty($filters['date_from'])) {
            $filters['date_from'] = $options['date_from'];
        }
        if (!empty($options['date_to']) && empty($filters['date_to'])) {
            $filters['date_to'] = $options['date_to'];
        }

        $request = Request::create('/', 'GET', [
            'course_id' => $filters['course_id'] ?? null,
            'user_id' => $filters['user_id'] ?? null,
            'date_from' => $filters['date_from'] ?? null,
            'date_to' => $filters['date_to'] ?? null,
        ]);

        $baseData = $this->statisticsAdmin->buildCourseTestDetailData($request);
        $rows = $this->buildDatasetRows($datasetKey, $baseData, $filters);
        $columns = $this->resolveColumns($datasetKey, $plan['columns'] ?? null);
        $headers = array_map(fn ($key) => self::DATASETS[$datasetKey]['columns'][$key] ?? $key, $columns);
        $tableRows = array_map(function (array $row) use ($columns) {
            return array_map(fn ($key) => $row[$key] ?? '', $columns);
        }, $rows);

        $kpis = [];
        if (!empty($plan['include_kpis'])) {
            $kpis = $this->buildKpis($datasetKey, $rows, $baseData);
        }

        return [
            'title' => (string) ($plan['title'] ?? self::DATASETS[$datasetKey]['label']),
            'summary' => (string) ($plan['summary'] ?? ''),
            'dataset' => $datasetKey,
            'dataset_label' => self::DATASETS[$datasetKey]['label'],
            'headers' => $headers,
            'column_keys' => $columns,
            'rows' => $tableRows,
            'row_count' => count($tableRows),
            'kpis' => $kpis,
            'filters_applied' => [
                'date_from' => $baseData['meta']['date_from'] ?? null,
                'date_to' => $baseData['meta']['date_to'] ?? null,
                'course_id' => $filters['course_id'] ?? null,
                'passed_only' => !empty($filters['passed_only']),
                'limit' => $filters['limit'] ?? null,
            ],
            'filename_slug' => $this->slugify((string) ($plan['title'] ?? $datasetKey)),
        ];
    }

    public function getDatasetCatalog(): array
    {
        return collect(self::DATASETS)->map(function (array $dataset, string $key) {
            return [
                'id' => $key,
                'label' => $dataset['label'],
                'columns' => collect($dataset['columns'])->map(fn ($label, $col) => [
                    'id' => $col,
                    'label' => $label,
                ])->values()->all(),
            ];
        })->values()->all();
    }

    private function resolveExportPlan(string $prompt, array $options): array
    {
        $catalog = collect(self::DATASETS)->map(function (array $dataset, string $key) {
            return [
                'id' => $key,
                'label' => $dataset['label'],
                'columns' => array_keys($dataset['columns']),
            ];
        })->values()->all();

        $today = Carbon::now()->toDateString();
        $system = <<<'PROMPT'
Ești Formely AI, asistentul de raportare Formely. Primești o cerere în limbaj natural de la un administrator care vrea un export Excel.

Alege DOAR un dataset din catalogul furnizat. Nu inventa coloane sau tabele noi. Nu genera SQL.
Returnează STRICT JSON valid cu schema:
{
  "title": "titlu scurt raport",
  "summary": "1-2 propoziții despre ce conține exportul",
  "dataset": "cheie din catalog",
  "columns": ["lista coloane din catalog, în ordinea dorită"],
  "filters": {
    "date_from": "YYYY-MM-DD sau null",
    "date_to": "YYYY-MM-DD sau null",
    "course_id": null,
    "user_id": null,
    "passed_only": false,
    "limit": 100,
    "sort_by": "coloană validă sau null",
    "sort_dir": "asc|desc"
  },
  "include_kpis": true
}

Reguli:
- Dacă utilizatorul cere top/ranking → dataset top_students
- Dacă cere înscrieri/progres pe curs → enrollments sau courses_overview
- Dacă cere teste/examene/scoruri → test_results
- Dacă cere elevi/studenți general → student_progress
- Perioada relativă: "ultima lună" = date_from cu ~30 zile în urmă, date_to = azi
- limit maxim 500, implicit 100 pentru top_students
PROMPT;

        $userMessage = json_encode([
            'today' => $today,
            'user_request' => $prompt,
            'optional_context' => [
                'date_from' => $options['date_from'] ?? null,
                'date_to' => $options['date_to'] ?? null,
            ],
            'dataset_catalog' => $catalog,
        ], JSON_UNESCAPED_UNICODE);

        $raw = $this->callAi($system, $userMessage);
        $parsed = $this->decodeJsonObject($raw);
        if (!$parsed || empty($parsed['dataset'])) {
            Log::warning('Formely AI export plan invalid, using fallback', ['raw' => mb_substr($raw, 0, 500)]);
            return $this->fallbackPlan($prompt, $options);
        }

        return $parsed;
    }

    private function fallbackPlan(string $prompt, array $options): array
    {
        $lower = mb_strtolower($prompt);
        $dataset = 'student_progress';
        if (str_contains($lower, 'test') || str_contains($lower, 'examen') || str_contains($lower, 'scor')) {
            $dataset = 'test_results';
        } elseif (str_contains($lower, 'curs') && (str_contains($lower, 'sumar') || str_contains($lower, 'overview'))) {
            $dataset = 'courses_overview';
        } elseif (str_contains($lower, 'înscri') || str_contains($lower, 'inscri')) {
            $dataset = 'enrollments';
        } elseif (str_contains($lower, 'top')) {
            $dataset = 'top_students';
        }

        return [
            'title' => 'Export Formely AI — ' . (self::DATASETS[$dataset]['label'] ?? 'Raport'),
            'summary' => 'Export generat automat pe baza cererii: ' . mb_substr($prompt, 0, 160),
            'dataset' => $dataset,
            'columns' => array_keys(self::DATASETS[$dataset]['columns']),
            'filters' => [
                'date_from' => $options['date_from'] ?? null,
                'date_to' => $options['date_to'] ?? null,
                'limit' => str_contains($lower, 'top') ? 10 : 500,
            ],
            'include_kpis' => true,
        ];
    }

    private function buildDatasetRows(string $datasetKey, array $baseData, array $filters): array
    {
        $students = collect($baseData['students'] ?? [])->keyBy('id');
        $courses = collect($baseData['courses'] ?? [])->keyBy('id');
        $enrollments = $baseData['enrollments'] ?? [];
        $testResults = $baseData['test_results'] ?? [];

        $rows = match ($datasetKey) {
            'enrollments' => $this->buildEnrollmentRows($enrollments, $students, $courses),
            'test_results' => $this->buildTestResultRows($testResults, $students, $courses, $filters),
            'courses_overview' => $this->buildCoursesOverviewRows($enrollments, $courses),
            'top_students' => $this->buildTopStudentRows($enrollments, $testResults, $students),
            default => $this->buildStudentProgressRows($enrollments, $testResults, $students),
        };

        $rows = $this->applySorting($rows, $filters);
        $limit = max(1, min(self::MAX_ROWS, (int) ($filters['limit'] ?? self::MAX_ROWS)));
        if ($datasetKey === 'top_students' && empty($filters['limit'])) {
            $limit = 10;
        }

        return array_slice($rows, 0, $limit);
    }

    private function buildStudentProgressRows(array $enrollments, array $testResults, $students): array
    {
        $byUser = [];
        foreach ($enrollments as $e) {
            $uid = (int) $e['user_id'];
            if (!isset($byUser[$uid])) {
                $byUser[$uid] = [
                    'courses_completed' => 0,
                    'lessons_completed' => 0,
                    'learning_seconds' => 0,
                    'test_scores' => [],
                    'tests_completed' => 0,
                ];
            }
            if (!empty($e['completed_at'])) {
                $byUser[$uid]['courses_completed']++;
            }
            $byUser[$uid]['lessons_completed'] += (int) ($e['lessons_completed'] ?? 0);
            $byUser[$uid]['learning_seconds'] += (int) ($e['time_spent_seconds'] ?? 0);
        }

        foreach ($testResults as $t) {
            $uid = (int) $t['user_id'];
            if (!isset($byUser[$uid])) {
                $byUser[$uid] = [
                    'courses_completed' => 0,
                    'lessons_completed' => 0,
                    'learning_seconds' => 0,
                    'test_scores' => [],
                    'tests_completed' => 0,
                ];
            }
            $byUser[$uid]['tests_completed']++;
            if ($t['percentage'] !== null) {
                $byUser[$uid]['test_scores'][] = (float) $t['percentage'];
            }
        }

        $rows = [];
        foreach ($byUser as $uid => $agg) {
            $student = $students->get($uid);
            $avg = !empty($agg['test_scores'])
                ? round(array_sum($agg['test_scores']) / count($agg['test_scores']), 1)
                : 0;
            $rows[] = [
                'id' => $uid,
                'name' => $student->name ?? ('Utilizator #' . $uid),
                'email' => $student->email ?? '',
                'courses_completed' => $agg['courses_completed'],
                'lessons_completed' => $agg['lessons_completed'],
                'tests_completed' => $agg['tests_completed'],
                'avg_score' => $avg,
                'learning_time' => $this->formatDuration($agg['learning_seconds']),
                'registered_at' => $student?->created_at ? Carbon::parse($student->created_at)->format('Y-m-d') : '',
            ];
        }

        return $rows;
    }

    private function buildEnrollmentRows(array $enrollments, $students, $courses): array
    {
        $rows = [];
        foreach ($enrollments as $e) {
            $student = $students->get((int) $e['user_id']);
            $course = $courses->get((int) $e['course_id']);
            $rows[] = [
                'student_name' => $student->name ?? ('Utilizator #' . $e['user_id']),
                'student_email' => $student->email ?? '',
                'course_title' => $course->title ?? ('Curs #' . $e['course_id']),
                'progress_percent' => (int) ($e['progress_percentage'] ?? 0),
                'lessons_completed' => (int) ($e['lessons_completed'] ?? 0),
                'time_spent' => $this->formatDuration((int) ($e['time_spent_seconds'] ?? 0)),
                'enrolled_at' => $this->formatDate($e['enrolled_at'] ?? null),
                'completed_at' => $this->formatDate($e['completed_at'] ?? null),
            ];
        }

        return $rows;
    }

    private function buildTestResultRows(array $testResults, $students, $courses, array $filters): array
    {
        $rows = [];
        foreach ($testResults as $t) {
            if (!empty($filters['passed_only']) && empty($t['passed'])) {
                continue;
            }
            $student = $students->get((int) $t['user_id']);
            $course = $courses->get((int) ($t['course_id'] ?? 0));
            $rows[] = [
                'student_name' => $student->name ?? ('Utilizator #' . $t['user_id']),
                'student_email' => $student->email ?? '',
                'test_title' => $t['test_title'] ?? ('Test #' . ($t['test_id'] ?? '')),
                'course_title' => $course->title ?? '',
                'score' => $t['score'] ?? '',
                'max_score' => $t['max_score'] ?? '',
                'percentage' => $t['percentage'] ?? '',
                'passed' => !empty($t['passed']) ? 'Da' : 'Nu',
                'attempt' => $t['attempt_number'] ?? 1,
                'completed_at' => $this->formatDate($t['completed_at'] ?? null),
            ];
        }

        return $rows;
    }

    private function buildCoursesOverviewRows(array $enrollments, $courses): array
    {
        $byCourse = [];
        foreach ($enrollments as $e) {
            $cid = (int) $e['course_id'];
            if (!isset($byCourse[$cid])) {
                $byCourse[$cid] = [
                    'count' => 0,
                    'progress_sum' => 0,
                    'completed' => 0,
                ];
            }
            $byCourse[$cid]['count']++;
            $byCourse[$cid]['progress_sum'] += (int) ($e['progress_percentage'] ?? 0);
            if (!empty($e['completed_at'])) {
                $byCourse[$cid]['completed']++;
            }
        }

        $rows = [];
        foreach ($byCourse as $cid => $agg) {
            $course = $courses->get($cid);
            $count = max(1, $agg['count']);
            $rows[] = [
                'course_title' => $course->title ?? ('Curs #' . $cid),
                'enrolled_students' => $agg['count'],
                'avg_progress' => round($agg['progress_sum'] / $count, 1),
                'completed_count' => $agg['completed'],
                'completion_rate' => round(($agg['completed'] / $count) * 100, 1),
            ];
        }

        usort($rows, fn ($a, $b) => ($b['enrolled_students'] ?? 0) <=> ($a['enrolled_students'] ?? 0));

        return $rows;
    }

    private function buildTopStudentRows(array $enrollments, array $testResults, $students): array
    {
        $progressRows = $this->buildStudentProgressRows($enrollments, $testResults, $students);
        usort($progressRows, function ($a, $b) {
            $scoreCmp = ($b['avg_score'] ?? 0) <=> ($a['avg_score'] ?? 0);
            if ($scoreCmp !== 0) {
                return $scoreCmp;
            }
            return ($b['courses_completed'] ?? 0) <=> ($a['courses_completed'] ?? 0);
        });

        $ranked = [];
        foreach ($progressRows as $index => $row) {
            $ranked[] = [
                'rank' => $index + 1,
                'name' => $row['name'],
                'email' => $row['email'],
                'courses_completed' => $row['courses_completed'],
                'lessons_completed' => $row['lessons_completed'],
                'avg_test_score' => $row['avg_score'],
                'learning_time' => $row['learning_time'],
            ];
        }

        return $ranked;
    }

    private function buildKpis(string $datasetKey, array $rows, array $baseData): array
    {
        return match ($datasetKey) {
            'test_results' => [
                ['Total rezultate', count($rows)],
                ['Promovări', count(array_filter($rows, fn ($r) => ($r['passed'] ?? '') === 'Da'))],
                ['Elevi în raport', count($baseData['students'] ?? [])],
            ],
            'courses_overview' => [
                ['Cursuri în raport', count($rows)],
                ['Elevi înscriși (total)', array_sum(array_column($rows, 'enrolled_students'))],
            ],
            'top_students' => [
                ['Studenți în top', count($rows)],
                ['Scor mediu top', count($rows)
                    ? round(array_sum(array_column($rows, 'avg_test_score')) / count($rows), 1) . '%'
                    : '0%'],
            ],
            default => [
                ['Elevi în raport', count($rows)],
                ['Cursuri finalizate (total)', array_sum(array_column($rows, 'courses_completed'))],
                ['Teste finalizate (total)', array_sum(array_column($rows, 'tests_completed'))],
            ],
        };
    }

    private function resolveColumns(string $datasetKey, mixed $requested): array
    {
        $available = array_keys(self::DATASETS[$datasetKey]['columns']);
        if (!is_array($requested) || empty($requested)) {
            return $available;
        }

        $filtered = array_values(array_filter($requested, fn ($col) => in_array($col, $available, true)));

        return !empty($filtered) ? $filtered : $available;
    }

    private function applySorting(array $rows, array $filters): array
    {
        $sortBy = (string) ($filters['sort_by'] ?? '');
        if ($sortBy === '' || empty($rows) || !array_key_exists($sortBy, $rows[0])) {
            return $rows;
        }

        $dir = strtolower((string) ($filters['sort_dir'] ?? 'desc')) === 'asc' ? 1 : -1;
        usort($rows, function ($a, $b) use ($sortBy, $dir) {
            $va = $a[$sortBy] ?? '';
            $vb = $b[$sortBy] ?? '';
            if (is_numeric($va) && is_numeric($vb)) {
                return ($va <=> $vb) * $dir;
            }

            return strcmp((string) $va, (string) $vb) * $dir;
        });

        return $rows;
    }

    private function formatDuration(int $seconds): string
    {
        $seconds = max(0, $seconds);
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);
        if ($h > 0) {
            return sprintf('%dh %dm', $h, $m);
        }
        if ($m > 0) {
            return sprintf('%dm', $m);
        }

        return sprintf('%ds', $seconds);
    }

    private function formatDate(mixed $value): string
    {
        if (!$value) {
            return '';
        }
        try {
            return Carbon::parse($value)->format('Y-m-d H:i');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function slugify(string $text): string
    {
        $slug = Str::slug($text, '-');
        if ($slug === '') {
            $slug = 'volt-export';
        }

        return substr($slug, 0, 48);
    }

    private function decodeJsonObject(string $response): ?array
    {
        $jsonPattern = '/\{[\s\S]*\}/';
        if (preg_match($jsonPattern, $response, $matches)) {
            $parsed = json_decode($matches[0], true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                return $parsed;
            }
        }

        $parsed = json_decode($response, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
            return $parsed;
        }

        return null;
    }

    private function callAi(string $systemPrompt, string $userPrompt): string
    {
        $provider = (string) config('ai.provider', 'groq');
        if ($provider === 'groq') {
            $apiKey = (string) config('ai.groq.api_key', '');
            $apiUrl = (string) config('ai.groq.api_url', 'https://api.groq.com/openai/v1');
            $model = (string) (config('ai.groq.creator_model') ?: config('ai.groq.model', 'llama-3.1-8b-instant'));
        } else {
            $apiKey = (string) config('ai.openai.api_key', '');
            $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
            $model = (string) (config('ai.openai.creator_model') ?: config('ai.openai.model', 'gpt-4o-mini'));
        }

        if (!$apiKey) {
            $openaiKey = (string) config('ai.openai.api_key', '');
            if ($provider === 'groq' && $openaiKey !== '') {
                $apiKey = $openaiKey;
                $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
                $model = (string) config('ai.openai.model', 'gpt-4o-mini');
            } else {
                throw new \RuntimeException('Cheia AI nu este configurată.');
            }
        }

        $verify = (bool) config('ai.verify_ssl', true);
        $headers = ['Content-Type' => 'application/json', 'Authorization' => "Bearer {$apiKey}"];

        $response = Http::withHeaders($headers)->withOptions(['verify' => $verify])
            ->timeout(90)
            ->post(rtrim($apiUrl, '/') . '/chat/completions', [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'temperature' => 0.2,
                'max_tokens' => 1200,
                'response_format' => ['type' => 'json_object'],
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Eroare AI la planificarea exportului: ' . $response->body());
        }

        $content = $response->json('choices.0.message.content');
        if (!is_string($content) || trim($content) === '') {
            throw new \RuntimeException('Răspuns AI gol pentru export.');
        }

        return $content;
    }
}
