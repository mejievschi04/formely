<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\Test;
use App\Models\ExamResult;
use App\Models\TestResult;
use App\Models\ActivityLog;
use App\Services\ExamAttemptSessionService;
use App\Services\ExamBankQuestionSyncService;
use App\Services\CourseProgressService;
use App\Services\TestAttemptAnswerOrderService;
use App\Services\TestAttemptService;
use App\Services\TestQuestionSelectionService;
use App\Support\LearningVisibility;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ExamController extends Controller
{
    protected $progressService;
    protected TestQuestionSelectionService $questionSelectionService;
    protected TestAttemptAnswerOrderService $answerOrderService;
    protected TestAttemptService $attemptService;
    protected ExamBankQuestionSyncService $examBankQuestionSyncService;
    protected ExamAttemptSessionService $examAttemptSessionService;

    public function __construct(
        CourseProgressService $progressService,
        TestQuestionSelectionService $questionSelectionService,
        TestAttemptAnswerOrderService $answerOrderService,
        TestAttemptService $attemptService,
        ExamBankQuestionSyncService $examBankQuestionSyncService,
        ExamAttemptSessionService $examAttemptSessionService
    ) {
        $this->progressService = $progressService;
        $this->questionSelectionService = $questionSelectionService;
        $this->answerOrderService = $answerOrderService;
        $this->attemptService = $attemptService;
        $this->examBankQuestionSyncService = $examBankQuestionSyncService;
        $this->examAttemptSessionService = $examAttemptSessionService;
    }

    /**
     * Elevi: doar teste publicate. Admin / instructor pe cursul legat pot previzualiza draft.
     */
    protected function gateUnpublishedTest(Test $test, $user, ?int $courseId): ?JsonResponse
    {
        if (($test->status ?? '') === 'published') {
            return null;
        }
        if ($user->isAdmin()) {
            return null;
        }
        if ($user->isInstructor()) {
            $q = CourseTest::query()
                ->where('test_id', $test->id)
                ->whereHas('course', function ($c) use ($user) {
                    $c->where('teacher_id', $user->id);
                });
            if ($courseId) {
                $q->where('course_id', $courseId);
            }
            if ($q->exists()) {
                return null;
            }
        }

        return response()->json([
            'message' => 'Testul nu este disponibil.',
            'unpublished' => true,
        ], 403);
    }

    protected function gateLockedCourseTest(Test $test, $user, ?int $courseId): ?JsonResponse
    {
        if (! $courseId || $user->isLearningActivityExempt()) {
            return null;
        }

        $course = Course::find($courseId);
        if (! $course) {
            return response()->json(['message' => 'Cursul nu a fost găsit.'], 404);
        }

        $linked = CourseTest::where('course_id', $course->id)->where('test_id', $test->id)->exists();
        if (! $linked) {
            return response()->json(['message' => 'Testul nu aparține acestui curs.'], 403);
        }

        if (! app(\App\Services\ProgressionEngine::class)->isTestUnlocked($user, $test, $course)) {
            return response()->json([
                'message' => 'Testul este blocat. Trebuie să promovezi testul anterior.',
                'locked' => true,
            ], 403);
        }

        return null;
    }

    protected function gateLearnerCourseTest(Test $test, $user, ?int &$courseId): ?JsonResponse
    {
        if ($user->isLearningActivityExempt()) {
            return null;
        }

        $links = CourseTest::query()->where('test_id', $test->id);
        $count = (clone $links)->count();
        if ($count === 0) {
            return null;
        }

        if (! $courseId) {
            if ($count === 1) {
                $courseId = (int) (clone $links)->value('course_id');
            } else {
                return response()->json([
                    'message' => 'Specifică course_id pentru acest test.',
                ], 422);
            }
        }

        $course = Course::find($courseId);
        if (! $course) {
            return response()->json(['message' => 'Cursul nu a fost găsit.'], 404);
        }
        if (($course->status ?? '') !== 'published') {
            return response()->json(['message' => 'Testul nu este disponibil.'], 403);
        }
        if (! CourseTest::where('course_id', $course->id)->where('test_id', $test->id)->exists()) {
            return response()->json(['message' => 'Testul nu aparține acestui curs.'], 403);
        }
        if (! LearningVisibility::isEnrolledInCourse($user, (int) $course->id)) {
            return response()->json([
                'message' => 'Nu ești înscris la acest curs.',
                'not_enrolled' => true,
            ], 403);
        }

        if (! app(\App\Services\PublishedCourseView::class)->learnerMayAccessLinkedTest($course, (int) $test->id, request())) {
            return response()->json([
                'message' => 'Testul nu este disponibil.',
                'unpublished' => true,
            ], 403);
        }

        return null;
    }

    protected function shouldRevealExamSolutions(object $assessment): bool
    {
        if ($assessment instanceof Test) {
            if (! (bool) ($assessment->show_correct_answers ?? false)) {
                return false;
            }
            if ((bool) ($assessment->show_only_submitted_answers ?? false)) {
                return false;
            }

            return true;
        }

        $settings = is_array($assessment->settings ?? null) ? $assessment->settings : [];
        if (! (bool) ($settings['show_correct_answers'] ?? false)) {
            return false;
        }
        if ((bool) ($settings['show_only_submitted_answers'] ?? false)) {
            return false;
        }

        return true;
    }

    protected function gateTestTimeLimit(Test $test, ?Carbon $startedAt): ?JsonResponse
    {
        $limitMinutes = (int) ($test->time_limit_minutes ?? 0);
        if ($limitMinutes <= 0 || ! $startedAt) {
            return null;
        }

        $expiresAt = $startedAt->copy()->addMinutes($limitMinutes)->addSeconds(15);
        if (now()->gt($expiresAt)) {
            return response()->json([
                'message' => 'Limita de timp a testului a expirat.',
                'time_expired' => true,
            ], 403);
        }

        return null;
    }

    /**
     * Elevi: doar examene publicate. Admin / instructor titular curs pot previzualiza draft.
     */
    protected function gateUnpublishedExam(Exam $exam, $user): ?JsonResponse
    {
        if (($exam->status ?? 'draft') === 'published') {
            return null;
        }
        if ($user->isAdmin()) {
            return null;
        }
        if ($user->isInstructor() && $exam->course_id) {
            $course = Course::find($exam->course_id);
            if ($course && (int) $course->teacher_id === (int) $user->id) {
                return null;
            }
        }
        if ($user->isInstructor() && ! $exam->course_id && \App\Support\SchemaCache::hasColumn('exams', 'created_by')) {
            if ((int) ($exam->created_by ?? 0) === (int) $user->id) {
                return null;
            }
        }

        return response()->json([
            'message' => 'Examenul nu este încă publicat.',
            'unpublished' => true,
        ], 403);
    }

    protected function resolveExamDeadline(Exam $exam, $user): array
    {
        $settings = is_array($exam->settings) ? $exam->settings : [];
        $type = (string) ($settings['deadline_type'] ?? 'none');
        $deadlineAt = null;

        if ($type === 'fixed') {
            $raw = $settings['deadline_at'] ?? null;
            if (is_string($raw) && trim($raw) !== '') {
                try {
                    $deadlineAt = Carbon::parse($raw);
                } catch (\Throwable $e) {
                    $deadlineAt = null;
                }
            }
        } elseif ($type === 'relative') {
            $days = max(0, (int) ($settings['deadline_days'] ?? 0));
            if ($days > 0) {
                $anchor = null;

                if ($exam->course_id) {
                    $courseUser = DB::table('course_user')
                        ->where('course_id', $exam->course_id)
                        ->where('user_id', $user->id)
                        ->first();

                    if ($courseUser && ! empty($courseUser->created_at)) {
                        try {
                            $anchor = Carbon::parse($courseUser->created_at);
                        } catch (\Throwable $e) {
                            $anchor = null;
                        }
                    }
                }

                if (! $anchor && empty($exam->course_id)) {
                    $anchor = $this->examAttemptSessionService->firstStartedAt((int) $exam->id, (int) $user->id);
                }

                if (! $anchor && $exam->course_id && $exam->created_at) {
                    $anchor = Carbon::parse($exam->created_at);
                }

                if ($anchor) {
                    $deadlineAt = $anchor->copy()->addDays($days)->endOfDay();
                }
            }
        }

        return [
            'type' => $type,
            'deadline_at' => $deadlineAt?->toIso8601String(),
            'is_overdue' => $deadlineAt ? now()->greaterThan($deadlineAt) : false,
        ];
    }

    protected function gateExamAvailability(Exam $exam, $user): ?JsonResponse
    {
        if ($user->isAdmin() || $user->isInstructor()) {
            return null;
        }

        if (! $exam->isVisibleToLearner($user)) {
            return response()->json([
                'message' => 'Nu ai acces la acest examen.',
                'allowed' => false,
            ], 403);
        }

        $settings = is_array($exam->settings) ? $exam->settings : [];
        $deadline = $this->resolveExamDeadline($exam, $user);
        if ($deadline['is_overdue'] && empty($settings['deadline_flexible'])) {
            return response()->json([
                'message' => 'Termenul pentru acest examen a expirat.',
                'deadline_passed' => true,
                'deadline_at' => $deadline['deadline_at'],
            ], 403);
        }

        return null;
    }

    protected function isAnswerCorrectFlag($answer): bool
    {
        if (!is_array($answer)) {
            return false;
        }

        $value = $answer['is_correct'] ?? $answer['isCorrect'] ?? $answer['correct'] ?? false;
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value === 1;
        }
        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
        }
        return false;
    }

    protected function answerTextForShuffleKey($answer): string
    {
        if (!is_array($answer)) {
            return (string) $answer;
        }

        return (string) (
            $answer['text']
            ?? $answer['answer_text']
            ?? $answer['content']
            ?? $answer['label']
            ?? ''
        );
    }

    protected function comparableAnswerText(mixed $value): string
    {
        if (is_array($value)) {
            $text = (string) ($value['text'] ?? $value['answer_text'] ?? $value['content'] ?? $value['label'] ?? $value['value'] ?? '');
        } elseif (is_object($value)) {
            $text = (string) ($value->text ?? $value->answer_text ?? $value->content ?? $value->label ?? $value->value ?? '');
        } else {
            $text = (string) $value;
        }

        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text)));
    }

    protected function resolveSelectedAnswerIndex(mixed $userAnswer, array $answers): ?int
    {
        if ($userAnswer === null || $userAnswer === '') {
            return null;
        }

        if (is_array($userAnswer)) {
            foreach (['index', 'answerIndex', 'answer_index', 'selectedIndex', 'selected_index'] as $key) {
                if (array_key_exists($key, $userAnswer)) {
                    $idx = is_numeric($userAnswer[$key]) ? (int) $userAnswer[$key] : null;
                    if ($idx !== null && array_key_exists($idx, $answers)) {
                        return $idx;
                    }
                }
            }

            foreach (['id', 'answer_id', 'answerId', 'value', 'text', 'answer_text', 'content', 'label'] as $key) {
                if (!array_key_exists($key, $userAnswer)) {
                    continue;
                }
                $resolved = $this->resolveSelectedAnswerIndex($userAnswer[$key], $answers);
                if ($resolved !== null) {
                    return $resolved;
                }
            }

            return null;
        }

        $raw = (string) $userAnswer;
        if (is_numeric($raw) && array_key_exists((int) $raw, $answers)) {
            return (int) $raw;
        }

        foreach ($answers as $index => $answer) {
            if (!is_array($answer) && !is_object($answer)) {
                continue;
            }

            foreach (['id', 'answer_id', 'value'] as $idKey) {
                $answerId = is_array($answer) ? ($answer[$idKey] ?? null) : ($answer->{$idKey} ?? null);
                if ($answerId !== null && (string) $answerId === $raw) {
                    return (int) $index;
                }
            }
        }

        $needle = $this->comparableAnswerText($raw);
        if ($needle === '') {
            return null;
        }

        foreach ($answers as $index => $answer) {
            if ($this->comparableAnswerText($answer) === $needle) {
                return (int) $index;
            }
        }

        return null;
    }

    /**
     * @return int[]
     */
    protected function resolveCorrectAnswerIndices(array $answers, string $type): array
    {
        if (! in_array($type, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            return [];
        }

        $indices = [];
        foreach ($answers as $idx => $answer) {
            if ($this->isAnswerCorrectFlag($answer)) {
                $indices[] = (int) $idx;
            }
        }

        if ($type === 'single_choice' || $type === 'true_false' || $type === 'yes_no') {
            return $indices !== [] ? [$indices[0]] : [];
        }

        return array_values(array_unique($indices));
    }

    /**
     * @return int[]
     */
    protected function resolveSelectedAnswerIndices(mixed $userAnswer, array $answers): array
    {
        if ($userAnswer === null || $userAnswer === '') {
            return [];
        }

        if (is_array($userAnswer)) {
            if (array_is_list($userAnswer)) {
                $indices = [];
                foreach ($userAnswer as $item) {
                    if (is_numeric($item) && array_key_exists((int) $item, $answers)) {
                        $indices[] = (int) $item;
                    }
                }

                return array_values(array_unique($indices));
            }

            foreach (['indices', 'selectedIndices', 'selected_indices', 'answers'] as $key) {
                if (isset($userAnswer[$key]) && is_array($userAnswer[$key])) {
                    return $this->resolveSelectedAnswerIndices($userAnswer[$key], $answers);
                }
            }

            $single = $this->resolveSelectedAnswerIndex($userAnswer, $answers);

            return $single !== null ? [$single] : [];
        }

        if (is_numeric($userAnswer) && array_key_exists((int) $userAnswer, $answers)) {
            return [(int) $userAnswer];
        }

        $single = $this->resolveSelectedAnswerIndex($userAnswer, $answers);

        return $single !== null ? [$single] : [];
    }

    protected function gradeChoiceQuestion(string $questionType, array $correctIndices, mixed $userAnswer, array $answers): bool
    {
        $correctIndices = array_values(array_unique(array_map('intval', $correctIndices)));
        sort($correctIndices);

        if ($questionType === 'multiple_choice') {
            $selected = $this->resolveSelectedAnswerIndices($userAnswer, $answers);
            sort($selected);

            return $correctIndices !== [] && $selected === $correctIndices;
        }

        $selectedIndex = $this->resolveSelectedAnswerIndex($userAnswer, $answers);
        if ($selectedIndex === null || $correctIndices === []) {
            return false;
        }

        return $selectedIndex === $correctIndices[0];
    }

    protected function normalizeArrayLike(mixed $value): ?array
    {
        if ($value instanceof \Illuminate\Support\Collection) {
            return $value->all();
        }

        if (is_array($value)) {
            return $value;
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    protected function normalizedSequenceValue(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }

        return array_values(array_map(static function ($item) {
            if (is_scalar($item) || $item === null) {
                return (string) $item;
            }
            return json_encode($item);
        }, $value));
    }

    protected function shuffleBySeed(array $items, string $seedBase): array
    {
        $indexed = [];
        foreach ($items as $idx => $item) {
            $label = is_array($item)
                ? (string) ($item['text'] ?? $item['answer_text'] ?? $item['content'] ?? $item['label'] ?? $item['left'] ?? $item['right'] ?? '')
                : (string) $item;
            $indexed[] = [
                'key' => hash('sha1', $seedBase . ":{$idx}:" . $label),
                'item' => $item,
            ];
        }

        usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);

        return array_values(array_map(fn ($entry) => $entry['item'], $indexed));
    }

    protected function buildMatchingQuestionData($question, ?Test $test, $user, int $attemptNumber): array
    {
        $payload = $this->normalizeArrayLike($question->payload ?? null) ?? [];
        $pairs = [];
        if (is_array($payload['pairs'] ?? null)) {
            $pairs = array_values($payload['pairs']);
        } else {
            $answers = $this->normalizeArrayLike($question->answers ?? null) ?? [];
            foreach ($answers as $answer) {
                if (!is_array($answer)) {
                    continue;
                }
                if (array_key_exists('left', $answer) || array_key_exists('right', $answer)) {
                    $pairs[] = $answer;
                } elseif (array_key_exists('pair', $answer) && is_array($answer['pair'])) {
                    $pairs[] = $answer['pair'];
                }
            }
        }
        $leftItems = [];
        $rightItems = [];

        foreach ($pairs as $index => $pair) {
            if (is_string($pair) && str_contains($pair, '|')) {
                [$leftRaw, $rightRaw] = array_pad(explode('|', $pair, 2), 2, '');
                $pair = ['left' => trim($leftRaw), 'right' => trim($rightRaw)];
            }

            if (!is_array($pair)) {
                continue;
            }
            $leftText = trim((string) ($pair['left'] ?? $pair['question'] ?? $pair['prompt'] ?? $pair['text'] ?? ''));
            $rightText = trim((string) ($pair['right'] ?? $pair['answer'] ?? $pair['value'] ?? $pair['content'] ?? ''));
            if ($leftText === '' || $rightText === '') {
                continue;
            }
            $leftItems[] = [
                'id' => (string) $index,
                'text' => $leftText,
            ];
            $rightItems[] = [
                'id' => (string) $index,
                'text' => $rightText,
            ];
        }

        $seedBase = $test
            ? $this->buildSelectionSeedBase($test, (int) $user->id, $attemptNumber) . ":q{$question->id}:matching"
            : "exam:{$question->id}:{$attemptNumber}:matching";

        return [
            'leftItems' => $leftItems,
            'rightItems' => $this->shuffleBySeed($rightItems, $seedBase),
            'correctMap' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $rightItems)),
        ];
    }

    protected function buildOrderingQuestionData($question, ?Test $test, $user, int $attemptNumber): array
    {
        $payload = $this->normalizeArrayLike($question->payload ?? null) ?? [];
        $items = [];
        if (is_array($payload['items'] ?? null)) {
            $items = array_values($payload['items']);
        } else {
            $answers = $this->normalizeArrayLike($question->answers ?? null) ?? [];
            foreach ($answers as $answer) {
                if (is_array($answer)) {
                    $text = trim((string) ($answer['text'] ?? $answer['answer_text'] ?? $answer['content'] ?? $answer['label'] ?? ''));
                    if ($text !== '') {
                        $items[] = $text;
                    }
                    continue;
                }

                if (is_scalar($answer) || $answer === null) {
                    $text = trim((string) $answer);
                    if ($text !== '') {
                        $items[] = $text;
                    }
                }
            }
        }
        $normalized = [];

        foreach ($items as $index => $item) {
            $text = is_array($item)
                ? (string) ($item['text'] ?? $item['label'] ?? $item['content'] ?? '')
                : (string) $item;
            if (trim($text) === '') {
                continue;
            }
            $normalized[] = [
                'id' => (string) $index,
                'text' => $text,
            ];
        }

        $seedBase = $test
            ? $this->buildSelectionSeedBase($test, (int) $user->id, $attemptNumber) . ":q{$question->id}:ordering"
            : "exam:{$question->id}:{$attemptNumber}:ordering";

        return [
            'items' => $this->shuffleBySeed($normalized, $seedBase),
            'correctOrder' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $normalized)),
        ];
    }

    protected function isSequenceAnswerCorrect(mixed $userAnswer, array $correctSequence): bool
    {
        $normalized = $this->normalizedSequenceValue($userAnswer);
        if ($normalized === null) {
            return false;
        }

        return $normalized === array_values(array_map('strval', $correctSequence));
    }

    protected function buildSelectionSeedBase(Test $test, int $userId, int $attemptNumber): string
    {
        $selection = is_array($test->question_selection) ? $test->question_selection : [];
        $seed = trim((string)($selection['seed'] ?? ''));
        $variantPoolSize = max(1, min(26, (int)($selection['variant_pool_size'] ?? 1)));
        $variantLabel = 'A';
        if ($variantPoolSize > 1) {
            $variantIndex = abs(crc32("{$test->id}:{$userId}")) % $variantPoolSize;
            $variantLabel = chr(65 + $variantIndex);
        }

        return "{$test->id}:{$userId}:{$attemptNumber}:seed:{$seed}:variant:{$variantLabel}";
    }

    /**
     * Order answers as the student sees them for this attempt (deterministic shuffle when randomize_answers).
     * Must use the same attempt number as selectQuestionsForTestAttempt / exam payload (existing results count + 1).
     *
     * @return array{answers: array, correct_index: int|null}
     */
    protected function resolveAnswersOrderForTestAttempt(Test $test, $question, $user, int $attemptNumber): array
    {
        $answers = $question->answers ?? [];
        if (!is_array($answers)) {
            $answers = [];
        }

        $type = $question->type ?? '';
        $correctIndices = $this->resolveCorrectAnswerIndices($answers, $type);

        if (($type === 'multiple_choice' || $type === 'single_choice' || $type === 'true_false' || $type === 'yes_no')
            && $test->randomize_answers
            && count($answers) > 1
        ) {
            $seedBase = $this->buildSelectionSeedBase($test, (int) $user->id, $attemptNumber) . ":q{$question->id}";
            $indexed = [];
            foreach ($answers as $idx => $ans) {
                $text = $this->answerTextForShuffleKey($ans);
                $key = hash('sha1', $seedBase . ":a{$idx}:" . $text);
                $indexed[] = ['key' => $key, 'idx' => $idx, 'ans' => $ans];
            }
            usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);
            $answers = array_values(array_map(fn ($x) => $x['ans'], $indexed));
            $correctIndices = $this->resolveCorrectAnswerIndices($answers, $type);
        }

        return [
            'answers' => $answers,
            'correct_index' => $correctIndices[0] ?? null,
            'correct_indices' => $correctIndices,
        ];
    }

    /**
     * Get exam/test details with access check
     * Supports both legacy Exam model and new Test model
     * For Test model: pass course_id as query param to resolve correct CourseTest (test can be in multiple courses)
     */
    public function show(Request $request, $examId)
    {
        try {
            $user = Auth::user();
            $courseId = $request->query('course_id') ? (int) $request->query('course_id') : null;
            $resolved = $this->resolveExamShowModel((int) $examId, $courseId, $request->query('kind'));

            if ($resolved['test']) {
                return $this->handleTest($resolved['test'], $user, $courseId, $request);
            }

            if ($resolved['exam']) {
                return $this->handleExam($resolved['exam'], $user);
            }

            return response()->json(['message' => 'Examen negăsit'], 404);
        } catch (\Throwable $e) {
            \Log::error('ExamController::show failed', [
                'exam_id' => $examId,
                'course_id' => $request->query('course_id'),
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Nu am putut încărca examenul.',
            ], 500);
        }
    }

    /**
     * tests și exams au ID-uri independente — același număr poate exista în ambele tabele.
     * $kind ('test' / 'exam') vine din linkuri care știu deja ce deschid (ex. „Încearcă testul” din admin)
     * și are prioritate față de ghicirea după curs.
     */
    protected function resolveExamShowModel(int $id, ?int $courseId, mixed $kind = null): array
    {
        $exam = Exam::with([
            'course:id,title',
            'module:id,title,course_id',
            'lesson:id,title,module_id',
            'questions' => function ($query) {
                $query->orderBy('order');
            },
            'questions.answers' => function ($query) {
                $query->orderBy('order');
            },
        ])->find($id);

        $test = Test::with([
            'questions' => function ($query) {
                $query->orderBy('order');
            },
            'questionBank.questions' => function ($query) {
                $query->orderBy('order');
            },
        ])->find($id);

        if ($kind === 'test' && $test) {
            return ['test' => $test, 'exam' => null];
        }
        if ($kind === 'exam' && $exam) {
            return ['test' => null, 'exam' => $exam];
        }

        if ($test && $exam) {
            if ($courseId) {
                if (CourseTest::where('test_id', $test->id)->where('course_id', $courseId)->exists()) {
                    return ['test' => $test, 'exam' => null];
                }
                if ((int) ($exam->course_id ?? 0) === $courseId) {
                    return ['test' => null, 'exam' => $exam];
                }
            } elseif ($exam->course_id === null) {
                return ['test' => null, 'exam' => $exam];
            }

            return ['test' => $test, 'exam' => null];
        }

        if ($test) {
            return ['test' => $test, 'exam' => null];
        }

        if ($exam) {
            return ['test' => null, 'exam' => $exam];
        }

        return ['test' => null, 'exam' => null];
    }

    /**
     * Catalog examene legacy fără curs (published, vizibile pentru elevul curent).
     */
    public function learnerStandaloneExams(Request $request): JsonResponse
    {
        $user = Auth::user();
        $exams = Exam::query()
            ->where('status', 'published')
            ->whereNull('course_id')
            ->orderBy('title')
            ->get()
            ->filter(fn (Exam $e) => $e->isVisibleToLearner($user) && ! $this->resolveExamDeadline($e, $user)['is_overdue'])
            ->values();

        return response()->json([
            'data' => $exams->map(fn (Exam $e) => [
                'id' => $e->id,
                'title' => $e->title,
                'description' => $e->description,
                'passing_score' => $e->passing_score,
                'time_limit_minutes' => $e->time_limit_minutes,
                'max_attempts' => $e->max_attempts,
            ]),
        ]);
    }
    
    /**
     * Handle Test model (new system)
     * @param int|null $courseId When provided, resolves CourseTest for this course (test can be in multiple courses)
     */
    protected function handleTest(Test $test, $user, ?int $courseId = null, ?Request $request = null)
    {
        if ($blocked = $this->gateUnpublishedTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLearnerCourseTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLockedCourseTest($test, $user, $courseId)) {
            return $blocked;
        }

        $this->attemptService->closeExpiredOpenAttempts((int) $user->id, (int) $test->id);

        $openAttempt = $this->attemptService
            ->currentOpenAttempt((int) $user->id, (int) $test->id, $courseId);

        $completedAttempts = $this->attemptService
            ->finishedAttempts((int) $user->id, (int) $test->id)
            ->get();

        $currentAttempt = $completedAttempts->count();
        $latestResult = $completedAttempts->first();
        $remainingAttempts = $this->attemptService->remainingAttemptsFor(
            $test,
            (int) $user->id,
            $currentAttempt,
            (bool) $openAttempt
        );
        $canRetake = $remainingAttempts === null || $remainingAttempts > 0;

        $req = $request ?? request();
        $forNewAttempt = $req instanceof Request && $req->boolean('new_attempt') && $canRetake;

        $basePassingScore = (int) ($test->passing_score ?? 70);
        $courseTestQuery = \App\Models\CourseTest::where('test_id', $test->id);
        if ($courseId) {
            $courseTestQuery->where('course_id', $courseId);
        }
        $courseTest = $courseTestQuery->first();
        $resolvedCourseId = $courseTest ? $courseTest->course_id : $courseId;
        $moduleId = ($courseTest && $courseTest->scope === 'module') ? $courseTest->scope_id : null;
        $resolvedPassingScore = $courseTest
            ? (int) ($courseTest->passing_score ?? $basePassingScore)
            : $basePassingScore;

        $viewingCompleted = $latestResult && ! $forNewAttempt && ! $openAttempt;
        $attemptNumberForSeed = $viewingCompleted
            ? max(1, (int) $latestResult->attempt_number)
            : max(1, $currentAttempt + 1);

        $activeAttempt = null;
        if ($viewingCompleted) {
            $questions = $this->attemptService->hydrateQuestions($latestResult->question_snapshot);
            if ($questions->isEmpty()) {
                $questions = $this->selectQuestionsForTestAttempt($test, $user, $attemptNumberForSeed);
            }
        } else {
            if ($openAttempt && $this->attemptService->attemptHasExpired($openAttempt)) {
                $this->attemptService->closeExpiredAttempt($openAttempt);
                $openAttempt = null;
            }
            if ($openAttempt) {
                $activeAttempt = $openAttempt;
                $questions = $this->attemptService->hydrateQuestions($openAttempt->question_snapshot);
                if ($questions->isEmpty()) {
                    $questions = $this->selectQuestionsForTestAttempt($test, $user, (int) $openAttempt->attempt_number);
                }
                $attemptNumberForSeed = max(1, (int) $openAttempt->attempt_number);
            } else {
                $questions = $this->selectQuestionsForTestAttempt($test, $user, $attemptNumberForSeed);
                $canStart = ! $user->isLearningActivityExempt()
                    && ! $this->attemptService->wouldExceedAttemptLimit($test, (int) $user->id, $currentAttempt + 1);
                if ($canStart) {
                    $activeAttempt = $this->attemptService->ensureOpenAttempt(
                        $test,
                        $user,
                        $courseId,
                        $questions,
                        $attemptNumberForSeed,
                        $resolvedPassingScore
                    );
                    if ($activeAttempt) {
                        $snapshot = $this->attemptService->hydrateQuestions($activeAttempt->question_snapshot);
                        if ($snapshot->isNotEmpty()) {
                            $questions = $snapshot;
                        }
                    } else {
                        $completedAttempts = $this->attemptService
                            ->finishedAttempts((int) $user->id, (int) $test->id)
                            ->get();
                        $currentAttempt = $completedAttempts->count();
                        $latestResult = $completedAttempts->first();
                        $viewingCompleted = (bool) $latestResult;
                        if ($viewingCompleted) {
                            $attemptNumberForSeed = max(1, (int) $latestResult->attempt_number);
                            $questions = $this->attemptService->hydrateQuestions($latestResult->question_snapshot);
                            if ($questions->isEmpty()) {
                                $questions = $this->selectQuestionsForTestAttempt($test, $user, $attemptNumberForSeed);
                            }
                        }
                    }
                }
            }
        }

        $submittedOnly = (bool) ($test->show_only_submitted_answers ?? false);
        $showSolutions = $viewingCompleted && $this->shouldRevealExamSolutions($test);
        $storedAnswers = is_array($latestResult?->answers) ? $latestResult->answers : [];
        $fullWire = ($showSolutions || ($viewingCompleted && $submittedOnly))
            ? $questions->map(fn ($question) => $this->buildReviewQuestionWire(
                $test, $question, $user, $attemptNumberForSeed, $storedAnswers
            ))
            : $this->transformTestQuestionsWire($questions, $test, $user, $attemptNumberForSeed);
        $transformedQuestions = $showSolutions
            ? $fullWire
            : $fullWire->map(fn (array $q) => $this->stripWireQuestionSolutionKeys($q))->values();

        $hasPassed = $latestResult
            && (float) ($latestResult->percentage ?? 0) >= (float) ($latestResult->passing_score_applied ?? $resolvedPassingScore);

        $remainingAttempts = $this->attemptService->remainingAttemptsFor(
            $test,
            (int) $user->id,
            $currentAttempt,
            (bool) $activeAttempt
        );
        $canRetake = $remainingAttempts === null || $remainingAttempts > 0;

        return response()->json([
            'id' => $test->id,
            'title' => $test->title,
            'description' => $test->description,
            'instructions' => null,
            'show_feedback_instant' => (bool) ($test->show_results_immediately ?? false),
            'show_correct_answers' => (bool) ($test->show_correct_answers ?? false),
            'show_only_submitted_answers' => (bool) ($test->show_only_submitted_answers ?? false),
            'type' => $test->type ?? 'final',
            'course_id' => $resolvedCourseId,
            'module_id' => $moduleId,
            'lesson_id' => null,
            'passing_score' => $resolvedPassingScore,
            'time_limit_minutes' => $test->time_limit_minutes,
            'max_attempts' => $test->max_attempts,
            'extra_attempts' => $this->attemptService->extraAttemptsFor((int) $user->id, (int) $test->id),
            'allowed_attempts' => $this->attemptService->allowedAttemptCount($test, (int) $user->id),
            'is_required' => (bool) $courseTest,
            'questions' => $transformedQuestions,
            'current_attempt' => $currentAttempt,
            'remaining_attempts' => $remainingAttempts,
            'can_retake' => $canRetake,
            'has_passed' => $hasPassed,
            'active_attempt' => $activeAttempt ? [
                'id' => $activeAttempt->id,
                'attempt_token' => $activeAttempt->attempt_token,
                'attempt_number' => $activeAttempt->attempt_number,
                'started_at' => optional($activeAttempt->started_at)?->toISOString(),
                'expires_at' => optional($activeAttempt->expires_at)?->toISOString(),
                'status' => $activeAttempt->status,
                'answers' => is_array($activeAttempt->answers) ? $activeAttempt->answers : [],
            ] : null,
            'latest_result' => $viewingCompleted ? [
                'id' => $latestResult->id,
                'score' => $latestResult->score ?? 0,
                'total_points' => $latestResult->max_score ?? $latestResult->total_points ?? 0,
                'percentage' => $latestResult->percentage ?? 0,
                'passed' => $hasPassed,
                'completed_at' => $latestResult->completed_at,
                'attempt_number' => $latestResult->attempt_number ?? 1,
                'answers' => is_array($latestResult->answers) ? $latestResult->answers : [],
                'needs_manual_review' => (bool) ($latestResult->needs_manual_review ?? false),
                'status' => $latestResult->status,
            ] : null,
        ]);
    }

    /**
     * Select questions for a test attempt.
     * Supports question banks + rule-based selection via tests.question_selection (JSON).
     *
     * For determinism we sort by a hash of (test,user,attempt,question_id) when using random selection.
     */
    protected function selectQuestionsForTestAttempt(Test $test, $user, int $attemptNumber)
    {
        return $this->questionSelectionService->selectForAttempt($test, (int) $user->id, $attemptNumber);
    }

    /** Elimină chei folosite la corectare din payload-ul trimis elevului în timpul testului. */
    protected function stripWireQuestionSolutionKeys(array $q): array
    {
        unset($q['correct_answer_indices'], $q['correct_answer_index'], $q['explanation']);
        $q['answerIndex'] = null;
        $q['answerIndices'] = null;
        if (isset($q['matching']) && is_array($q['matching'])) {
            $m = $q['matching'];
            unset($m['correctMap']);
            $q['matching'] = $m;
        }
        if (isset($q['ordering']) && is_array($q['ordering'])) {
            $o = $q['ordering'];
            unset($o['correctOrder']);
            $q['ordering'] = $o;
        }

        return $q;
    }

    /** Răspunsuri + corectitudine pentru ecranul imediat după trimitere (indici stabili). */
    protected function buildReviewQuestionWire(Test $test, $question, $user, int $attemptNumber, array $storedAnswers): ?array
    {
        $wire = $this->mapTestQuestionToStudentWire($test, $question, $user, $attemptNumber);
        $questionId = (int) $question->id;
        $userAnswer = $storedAnswers[$questionId] ?? $storedAnswers[(string) $questionId] ?? null;
        $questionType = (string) ($wire['type'] ?? 'multiple_choice');

        if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            $order = $this->answerOrderService->resolveChoiceOrderForAttempt(
                $test,
                $question,
                (int) $user->id,
                $attemptNumber
            );
            $originalSelected = $this->answerOrderService->selectedOriginalIndicesFromStored(
                $userAnswer,
                $questionType,
                $order
            );
            $wire['options'] = array_map(
                fn ($answer) => $this->answerOrderService->answerText($answer),
                $order['original_answers']
            );
            $wire['correct_answer_indices'] = $order['correct_original_indices'];
            $wire['answerIndex'] = $order['correct_original_indices'][0] ?? null;
            $wire['answerIndices'] = $questionType === 'multiple_choice'
                ? $order['correct_original_indices']
                : null;
            $wire['is_correct'] = $this->answerOrderService->gradeChoiceInOriginalSpace(
                $questionType,
                $originalSelected,
                $order['correct_original_indices']
            );

            return $wire;
        }

        if ($questionType === 'ordering' && is_array($wire['ordering'] ?? null)) {
            $wire['is_correct'] = $this->isSequenceAnswerCorrect(
                $userAnswer,
                $wire['ordering']['correctOrder'] ?? []
            );

            return $wire;
        }

        if ($questionType === 'matching' && is_array($wire['matching'] ?? null)) {
            $wire['is_correct'] = $this->isSequenceAnswerCorrect(
                $userAnswer,
                $wire['matching']['correctMap'] ?? []
            );

            return $wire;
        }

        return $wire;
    }

    /** O întrebare Test (JSON) în formatul folosit de frontend. */
    protected function mapTestQuestionToStudentWire(Test $test, $question, $user, int $attemptNumber): array
    {
        $questionType = $question->type ?? 'multiple_choice';
        $resolved = $this->resolveAnswersOrderForTestAttempt($test, $question, $user, $attemptNumber);
        $answers = $resolved['answers'];
        $correctIndices = $resolved['correct_indices'] ?? [];
        $correctAnswerIndex = $resolved['correct_index'];
        $matching = null;
        $ordering = null;

        if ($questionType === 'matching') {
            $matching = $this->buildMatchingQuestionData($question, $test, $user, $attemptNumber);
        } elseif ($questionType === 'ordering') {
            $ordering = $this->buildOrderingQuestionData($question, $test, $user, $attemptNumber);
        }

        return [
            'id' => $question->id,
            'text' => $question->content,
            'type' => $questionType,
            'metadata' => is_array($question->metadata ?? null) ? $question->metadata : null,
            'options' => in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)
                ? array_map(function ($ans) {
                    if (! is_array($ans)) {
                        return $ans;
                    }

                    return $ans['text'] ?? $ans['answer_text'] ?? $ans['content'] ?? '';
                }, $answers)
                : [],
            'answerIndex' => $correctAnswerIndex,
            'answerIndices' => $questionType === 'multiple_choice' ? $correctIndices : null,
            'points' => $question->points ?? 1,
            'comment' => $question->explanation ?? null,
            'explanation' => $question->explanation ?? null,
            'matching' => $matching,
            'ordering' => $ordering,
        ];
    }

    protected function transformTestQuestionsWire($questions, Test $test, $user, int $attemptNumber): Collection
    {
        return collect($questions)->map(fn ($question) => $this->mapTestQuestionToStudentWire($test, $question, $user, $attemptNumber));
    }

    protected function orderLegacyExamQuestionsForAttempt(Exam $exam, $user, int $attemptNumber): Collection
    {
        return $this->examBankQuestionSyncService->selectForAttempt(
            $exam,
            (int) $user->id,
            $attemptNumber
        );
    }

    protected function transformLegacyExamQuestionsWire(Exam $exam, $user, int $attemptNumber, ?Collection $questions = null): Collection
    {
        $source = $questions ?? $this->orderLegacyExamQuestionsForAttempt($exam, $user, $attemptNumber);

        return $source->map(function ($question) use ($user, $attemptNumber) {
            $answers = $question->answers;
            $answersCollection = $answers instanceof \Illuminate\Support\Collection
                ? $answers
                : collect(is_array($answers) ? $answers : []);
            $questionType = $question->question_type ?? 'multiple_choice';
            $answerRows = $answersCollection->values()->all();
            $correctIndices = [];
            if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
                foreach ($answerRows as $idx => $answer) {
                    if ($answer->is_correct ?? false) {
                        $correctIndices[] = (int) $idx;
                    }
                }
                if ($questionType === 'single_choice' || $questionType === 'true_false' || $questionType === 'yes_no') {
                    $correctIndices = $correctIndices !== [] ? [$correctIndices[0]] : [];
                } else {
                    $correctIndices = array_values(array_unique($correctIndices));
                }
            }
            $correctAnswerIndex = $correctIndices[0] ?? null;
            $matching = null;
            $ordering = null;
            $payload = is_array($question->payload) ? $question->payload : [];
            $explanation = $payload['explanation'] ?? ($question->explanation ?? null);

            if ($questionType === 'matching') {
                $matching = $this->buildMatchingQuestionData($question, null, $user, $attemptNumber);
            } elseif ($questionType === 'ordering') {
                $ordering = $this->buildOrderingQuestionData($question, null, $user, $attemptNumber);
            }

            return [
                'id' => $question->id,
                'text' => $question->question_text,
                'type' => $questionType,
                'options' => in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)
                    ? $answersCollection->pluck('answer_text')->values()->all()
                    : [],
                'answerIndex' => $correctAnswerIndex,
                'answerIndices' => $questionType === 'multiple_choice' ? $correctIndices : null,
                'points' => $question->points ?? 1,
                'comment' => $explanation,
                'explanation' => $explanation,
                'matching' => $matching,
                'ordering' => $ordering,
            ];
        });
    }

    /**
     * Handle legacy Exam model
     */
    protected function handleExam(Exam $exam, $user)
    {
        if ($blocked = $this->gateUnpublishedExam($exam, $user)) {
            return $blocked;
        }
        $resumeAttempt = ExamResult::where('exam_id', $exam->id)->where('user_id', $user->id)->count() + 1;
        $canResume = (bool) $this->examAttemptSessionService->find($exam, $user, $resumeAttempt);
        if (! $user->isAdmin() && ! $user->isInstructor() && ! $exam->isVisibleToLearner($user)) {
            return response()->json([
                'message' => 'Nu ai acces la acest examen.',
                'allowed' => false,
            ], 403);
        }
        if (! $canResume && ($blocked = $this->gateExamAvailability($exam, $user))) {
            return $blocked;
        }

        $settings = is_array($exam->settings) ? $exam->settings : [];
        $deadline = $this->resolveExamDeadline($exam, $user);

        // Check access
        $accessCheck = $this->progressService->isExamUnlocked(
            $user,
            $exam,
            $exam->module,
            $exam->lesson
        );

        if (!$accessCheck) {
            $message = empty($exam->course_id)
                ? 'Nu ai acces la acest examen.'
                : 'Testul nu este disponibil. Completează lecțiile/modulele anterioare.';

            return response()->json([
                'message' => $message,
                'unlocked' => false,
            ], 403);
        }

        // Get user's attempts
        $userAttempts = ExamResult::where('exam_id', $exam->id)
            ->where('user_id', $user->id)
            ->orderBy('attempt_number', 'desc')
            ->get();

        $currentAttempt = $userAttempts->count();
        $latestResult = $userAttempts->first();
        $remainingAttempts = $exam->max_attempts 
            ? max(0, $exam->max_attempts - $currentAttempt)
            : null;
        $canRetake = $exam->max_attempts 
            ? ($remainingAttempts > 0)
            : true;

        // Check if user has passed
        $hasPassed = $latestResult && $latestResult->passed;

        $req = request();
        $forNewAttempt = $req instanceof Request && $req->boolean('new_attempt') && $canRetake;
        $viewingCompleted = $latestResult && ! $forNewAttempt;
        $attemptNumberForSeed = $viewingCompleted
            ? max(1, (int) $latestResult->attempt_number)
            : max(1, $currentAttempt + 1);
        $session = $viewingCompleted
            ? $this->examAttemptSessionService->find($exam, $user, $attemptNumberForSeed)
            : $this->examAttemptSessionService->ensure($exam, $user, $attemptNumberForSeed);
        $attemptQuestions = $session
            ? $this->examAttemptSessionService->questions($session)
            : null;

        $fullWire = $this->transformLegacyExamQuestionsWire($exam, $user, $attemptNumberForSeed, $attemptQuestions);
        $showSolutions = $latestResult && ! $forNewAttempt && $this->shouldRevealExamSolutions($exam);
        $submittedOnly = (bool) ($settings['show_only_submitted_answers'] ?? false);
        $questions = ($showSolutions && ! $submittedOnly)
            ? $fullWire
            : $fullWire->map(fn (array $q) => $this->stripWireQuestionSolutionKeys($q))->values();

        return response()->json([
            'id' => $exam->id,
            'title' => $exam->title,
            'description' => $exam->description,
            'instructions' => $settings['instructions'] ?? null,
            'manual_review' => array_key_exists('manual_review', $settings) ? (bool) $settings['manual_review'] : true,
            'manual_review_mode' => (string) ($settings['manual_review_mode'] ?? 'after_complete'),
            'show_feedback_instant' => (bool) ($settings['show_feedback_instant'] ?? false),
            'show_correct_answers' => (bool) ($settings['show_correct_answers'] ?? false),
            'show_only_submitted_answers' => (bool) ($settings['show_only_submitted_answers'] ?? false),
            'navigation_mode' => (string) ($settings['navigation_mode'] ?? 'sequential'),
            'deadline_type' => $deadline['type'],
            'deadline_at' => $deadline['deadline_at'],
            'deadline_flexible' => (bool) ($settings['deadline_flexible'] ?? false),
            'deadline_overdue' => (bool) ($deadline['is_overdue'] ?? false),
            'course_id' => $exam->course_id,
            'module_id' => $exam->module_id,
            'lesson_id' => $exam->lesson_id,
            'passing_score' => $exam->passing_score ?? 70,
            'time_limit_minutes' => $exam->time_limit_minutes,
            'max_attempts' => $exam->max_attempts,
            'is_required' => $exam->is_required ?? false,
            'questions' => $questions,
            'active_attempt' => (! $viewingCompleted && $session) ? [
                'attempt_number' => (int) $session->attempt_number,
                'started_at' => optional($session->started_at)?->toISOString(),
                'expires_at' => optional($session->expires_at)?->toISOString(),
                'answers' => is_array($session->answers) ? $session->answers : [],
            ] : null,
            'current_attempt' => $currentAttempt,
            'remaining_attempts' => $remainingAttempts,
            'can_retake' => $canRetake,
            'has_passed' => $hasPassed,
            'latest_result' => $latestResult ? [
                'score' => $latestResult->score,
                'total_points' => $latestResult->total_points,
                'percentage' => $latestResult->percentage,
                'passed' => $latestResult->passed,
                'completed_at' => $latestResult->completed_at,
                'attempt_number' => $latestResult->attempt_number,
                'answers' => is_array($latestResult->answers ?? null) ? $latestResult->answers : [],
                'needs_manual_review' => (bool) ($latestResult->needs_manual_review ?? false),
                'status' => ($latestResult->needs_manual_review ?? false) ? 'pending_review' : 'completed',
            ] : null,
        ]);
    }

    /**
     * Submit exam/test answers
     * Supports both legacy Exam model and new Test model
     */
    public function submit(Request $request, $examId)
    {
        $user = Auth::user();

        $queryCourse = $request->query('course_id');
        $bodyCourse = $request->input('course_id');
        $queryId = ($queryCourse !== null && $queryCourse !== '') ? (int) $queryCourse : null;
        $bodyId = ($bodyCourse !== null && $bodyCourse !== '') ? (int) $bodyCourse : null;
        if ($queryId && $bodyId && $queryId !== $bodyId) {
            return response()->json([
                'message' => 'course_id din query și din body nu coincid.',
            ], 422);
        }
        $courseId = $queryId ?? $bodyId;

        $resolved = $this->resolveExamShowModel((int) $examId, $courseId, $request->query('kind'));

        if ($resolved['test']) {
            return $this->submitTest($request, $resolved['test'], $user, $courseId);
        }

        if ($resolved['exam']) {
            return $this->submitExam($request, $resolved['exam'], $user);
        }

        return response()->json(['message' => 'Examen negăsit'], 404);
    }

    /**
     * Persist the student's current answers on the in-progress attempt.
     */
    public function saveProgress(Request $request, $examId)
    {
        $user = Auth::user();
        $queryCourse = $request->query('course_id');
        $bodyCourse = $request->input('course_id');
        $queryId = ($queryCourse !== null && $queryCourse !== '') ? (int) $queryCourse : null;
        $bodyId = ($bodyCourse !== null && $bodyCourse !== '') ? (int) $bodyCourse : null;
        if ($queryId && $bodyId && $queryId !== $bodyId) {
            return response()->json([
                'message' => 'course_id din query și din body nu coincid.',
            ], 422);
        }
        $courseId = $queryId ?? $bodyId;
        $resolved = $this->resolveExamShowModel((int) $examId, $courseId, $request->query('kind'));

        if (! $resolved['test']) {
            if ($resolved['exam']) {
                if (! $resolved['exam']->isVisibleToLearner($user)) {
                    return response()->json(['message' => 'Nu ai acces la acest examen.'], 403);
                }
                $incoming = $request->input('answers', []);
                $answers = is_array($incoming) ? $incoming : [];
                $attemptNumber = ExamResult::where('exam_id', $resolved['exam']->id)->where('user_id', $user->id)->count() + 1;
                $session = $this->examAttemptSessionService->find($resolved['exam'], $user, $attemptNumber);
                if ($session) {
                    $this->examAttemptSessionService->rememberAnswers($session, $answers);
                }

                return response()->json([
                    'answers' => $answers,
                ]);
            }

            return response()->json([
                'message' => 'Salvarea progresului nu este disponibilă pentru acest test.',
            ], 400);
        }

        $test = $resolved['test'];
        if ($blocked = $this->gateUnpublishedTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLearnerCourseTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLockedCourseTest($test, $user, $courseId)) {
            return $blocked;
        }

        $incoming = $request->input('answers', []);
        if (! is_array($incoming)) {
            $incoming = [];
        }

        if ($user->isLearningActivityExempt()) {
            return response()->json(['answers' => $incoming]);
        }

        $attemptId = $request->input('attempt_id');
        $openAttempt = null;
        if ($attemptId) {
            $openAttempt = TestResult::query()
                ->where('id', (int) $attemptId)
                ->where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->where('status', 'in_progress')
                ->first();
        }
        if (! $openAttempt) {
            $openAttempt = $this->attemptService->currentOpenAttempt((int) $user->id, (int) $test->id, $courseId);
        }
        if (! $openAttempt) {
            return response()->json([
                'message' => 'Deschide testul înainte de a salva răspunsurile.',
            ], 403);
        }
        if ($this->attemptService->attemptHasExpired($openAttempt)) {
            $this->attemptService->closeExpiredAttempt($openAttempt);

            return response()->json([
                'message' => 'Limita de timp a testului a expirat.',
                'time_expired' => true,
            ], 403);
        }

        $answers = $this->attemptService->persistProgressAnswers($openAttempt, $incoming);

        return response()->json([
            'answers' => $answers,
            'attempt_id' => $openAttempt->id,
        ]);
    }
    
    /**
     * Submit Test (new system)
     */
    protected function submitTest(Request $request, Test $test, $user, ?int $courseId = null)
    {
        if ($blocked = $this->gateUnpublishedTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLearnerCourseTest($test, $user, $courseId)) {
            return $blocked;
        }
        if ($blocked = $this->gateLockedCourseTest($test, $user, $courseId)) {
            return $blocked;
        }

        $trackLearning = ! $user->isLearningActivityExempt();

        try {
            return DB::transaction(function () use ($request, $test, $user, $courseId, $trackLearning) {
            $attemptId = $request->input('attempt_id');
            $openAttempt = null;
            if ($trackLearning) {
                if ($attemptId) {
                    $openAttempt = TestResult::query()
                        ->where('id', (int) $attemptId)
                        ->where('user_id', $user->id)
                        ->where('test_id', $test->id)
                        ->lockForUpdate()
                        ->first();
                    if ($openAttempt && $openAttempt->course_id) {
                        $courseId = (int) $openAttempt->course_id;
                    }
                }
                if (! $openAttempt) {
                    $openAttempt = $this->attemptService
                        ->openAttemptQuery((int) $user->id, (int) $test->id, $courseId)
                        ->lockForUpdate()
                        ->first();
                }
                if ($openAttempt && $openAttempt->status !== 'in_progress' && $openAttempt->completed_at) {
                    return response()->json([
                        'message' => 'Încercarea a fost deja trimisă.',
                        'result' => [
                            'id' => $openAttempt->id,
                            'score' => $openAttempt->score,
                            'percentage' => $openAttempt->percentage,
                            'passed' => (bool) $openAttempt->passed,
                            'attempt_number' => $openAttempt->attempt_number,
                            'status' => $openAttempt->status,
                        ],
                    ]);
                }
            }

            $completedCount = $trackLearning
                ? $this->attemptService->finishedAttemptCount((int) $user->id, (int) $test->id)
                : 0;
            $nextAttempt = $openAttempt
                ? max(1, (int) $openAttempt->attempt_number)
                : $completedCount + 1;

            if ($trackLearning && $this->attemptService->wouldExceedAttemptLimit($test, (int) $user->id, $completedCount + 1)) {
                $allowed = $this->attemptService->allowedAttemptCount($test, (int) $user->id);
                return response()->json([
                    'message' => "Ai atins limita de {$allowed} încercări pentru acest test.",
                    'max_attempts_reached' => true,
                ], 403);
            }

            $questions = $openAttempt
                ? $this->attemptService->hydrateQuestions($openAttempt->question_snapshot)
                : collect();
            if ($questions->isEmpty() && $openAttempt) {
                $questions = $this->selectQuestionsForTestAttempt($test, $user, $nextAttempt);
            }
            if ($questions->isEmpty() && ! $trackLearning) {
                $questions = $this->selectQuestionsForTestAttempt($test, $user, $nextAttempt);
            }

            if ($trackLearning && ! $openAttempt) {
                return response()->json([
                    'message' => 'Deschide testul înainte de trimitere.',
                    'attempt_required' => true,
                ], 403);
            }

            if ($questions->isEmpty()) {
                return response()->json([
                    'message' => 'Testul nu are întrebări disponibile.',
                ], 400);
            }

            $incomingAnswers = $request->input('answers', []);
            if (! is_array($incomingAnswers)) {
                $incomingAnswers = [];
            }
            $answers = $openAttempt
                ? $this->attemptService->mergeSubmitAnswers($openAttempt, $incomingAnswers)
                : $incomingAnswers;
            $startedAt = $openAttempt?->started_at;
            $startedAtRaw = $request->input('started_at');
            if (! $startedAt && is_string($startedAtRaw) && trim($startedAtRaw) !== '') {
                try {
                    $startedAt = Carbon::parse($startedAtRaw);
                } catch (\Throwable $parseError) {
                    $startedAt = null;
                }
            }

            if ($openAttempt && $this->attemptService->attemptHasExpired($openAttempt)) {
                $this->attemptService->closeExpiredAttempt($openAttempt);

                return response()->json([
                    'message' => 'Limita de timp a testului a expirat.',
                    'time_expired' => true,
                ], 403);
            }
            if ($openAttempt && $openAttempt->status === 'expired') {
                return response()->json([
                    'message' => 'Limita de timp a testului a expirat.',
                    'time_expired' => true,
                ], 403);
            }
            if ($blocked = $this->gateTestTimeLimit($test, $startedAt)) {
                return $blocked;
            }
            
            // Calculate score and count correct answers (for statistics: X din Y întrebări)
        $score = 0;
        $totalPoints = 0;
        $correctAnswersCount = 0;
        $autoGradableTypes = ['multiple_choice', 'single_choice', 'true_false', 'yes_no', 'matching', 'ordering'];
        $hasManualQuestions = $questions->contains(function ($question) use ($autoGradableTypes) {
            return !in_array((string) ($question->type ?? 'multiple_choice'), $autoGradableTypes, true);
        });
        $needsManualReview = (bool) ($test->requires_manual_verification ?? false) || $hasManualQuestions;
        $totalQuestions = $questions->count();

        foreach ($questions as $question) {
            $points = $question->points ?? 1;
            $totalPoints += $points;

            $questionType = $question->type ?? '';

            if ($questionType === 'matching') {
                $structured = $this->buildMatchingQuestionData($question, $test, $user, $nextAttempt);
                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                if ($this->isSequenceAnswerCorrect($userAns, $structured['correctMap'] ?? [])) {
                    $score += $points;
                    $correctAnswersCount++;
                }
                continue;
            }

            if ($questionType === 'ordering') {
                $structured = $this->buildOrderingQuestionData($question, $test, $user, $nextAttempt);
                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                if ($this->isSequenceAnswerCorrect($userAns, $structured['correctOrder'] ?? [])) {
                    $score += $points;
                    $correctAnswersCount++;
                }
                continue;
            }

            if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                $order = $this->answerOrderService->resolveChoiceOrderForAttempt(
                    $test,
                    $question,
                    (int) $user->id,
                    $nextAttempt
                );
                $displaySelected = $this->answerOrderService->selectedDisplayIndices($userAns, $order['display_answers']);
                $originalSelected = $this->answerOrderService->displayIndicesToOriginal(
                    $displaySelected,
                    $order['display_to_original']
                );
                if ($this->answerOrderService->gradeChoiceInOriginalSpace(
                    $questionType,
                    $originalSelected,
                    $order['correct_original_indices']
                )) {
                    $score += $points;
                    $correctAnswersCount++;
                }
            }
        }

            $answers = $this->answerOrderService->normalizeSubmittedAnswers(
                $test,
                $questions,
                (int) $user->id,
                $nextAttempt,
                $answers
            );
            
            $percentage = $totalPoints > 0 ? (int) round(($score / $totalPoints) * 100) : 0;

            $courseTestQuery = \App\Models\CourseTest::where('test_id', $test->id);
            if ($courseId) {
                $courseTestQuery->where('course_id', $courseId);
            }
            $courseTest = $courseTestQuery->first();
            $livePassingScore = $courseTest
                ? ($courseTest->passing_score ?? (int) ($test->passing_score ?? 70))
                : (int) ($test->passing_score ?? 70);
            $passingScore = ($openAttempt && $openAttempt->passing_score_applied !== null)
                ? (int) $openAttempt->passing_score_applied
                : $livePassingScore;
            $passed = !$needsManualReview && $percentage >= $passingScore;
            
            $testResult = null;
            if ($trackLearning) {
                $payload = [
                    'test_id' => $test->id,
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'attempt_number' => $nextAttempt,
                    'score' => $score,
                    'max_score' => $totalPoints,
                    'correct_answers_count' => $correctAnswersCount,
                    'total_questions' => $totalQuestions,
                    'percentage' => $percentage,
                    'passed' => $passed,
                    'answers' => $answers,
                    'started_at' => $startedAt,
                    'expires_at' => $openAttempt?->expires_at,
                    'time_taken_minutes' => $startedAt ? max(0, (int) floor($startedAt->diffInSeconds(now()) / 60)) : null,
                    'completed_at' => now(),
                    'status' => $needsManualReview ? 'pending_review' : 'completed',
                    'needs_manual_review' => $needsManualReview,
                    'question_snapshot' => $openAttempt?->question_snapshot ?: $this->attemptService->snapshotQuestions($questions),
                    'passing_score_applied' => (int) $passingScore,
                    'attempt_token' => $openAttempt?->attempt_token ?: (string) \Illuminate\Support\Str::uuid(),
                    'attempt_scope' => null,
                ];
                if ($openAttempt) {
                    $openAttempt->update($payload);
                    $testResult = $openAttempt->fresh();
                } else {
                    $testResult = TestResult::create($payload);
                }
            }

            // Get course from CourseTest relationship
            $courseForLog = null;
            if ($courseTest && $trackLearning) {
                try {
                    $course = \App\Models\Course::find($courseTest->course_id);
                    $courseForLog = $course instanceof Course ? $course : null;
                    $module = ($courseTest->scope === 'module') ? \App\Models\Module::find($courseTest->scope_id) : null;
                    
                    // If test is required and passed, recalculate progress
                    if (($courseTest->required ?? false) && $passed) {
                        if ($module) {
                            try {
                                // Recalculate module progress
                                $this->progressService->calculateModuleProgress($user, $module);
                                
                                // Check if module is now complete
                                if ($this->progressService->isModuleComplete($user, $module)) {
                                    // Recalculate course progress
                                    if ($course) {
                                        $this->progressService->calculateCourseProgress($user, $course);
                                        
                                        // Check if course is now complete
                                        if ($this->progressService->canFinalizeCourse($user, $course)) {
                                            $this->markCourseCompletedWithActivity($user, $course, $request);
                                        }
                                    }
                                }
                            } catch (\Exception $e) {
                                \Log::warning('Error recalculating module progress', [
                                    'module_id' => $module->id ?? null,
                                    'error' => $e->getMessage(),
                                ]);
                            }
                        } elseif ($course) {
                            try {
                                // Course-level test, recalculate course progress
                                $this->progressService->calculateCourseProgress($user, $course);
                                
                                // Check if course is now complete
                                if ($this->progressService->canFinalizeCourse($user, $course)) {
                                    $this->markCourseCompletedWithActivity($user, $course, $request);
                                }
                            } catch (\Exception $e) {
                                \Log::warning('Error recalculating course progress', [
                                    'course_id' => $course->id ?? null,
                                    'error' => $e->getMessage(),
                                ]);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    \Log::warning('Error processing course/module for test result', [
                        'course_test_id' => $courseTest->id ?? null,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            if ($trackLearning) {
                $this->logExamSubmission(
                    $user,
                    (string) $test->title,
                    (int) $test->id,
                    'Test',
                    $courseForLog,
                    (float) $score,
                    (float) $totalPoints,
                    (float) $percentage,
                    (bool) $passed,
                    (int) $nextAttempt,
                    $request
                );
            }

            $reviewQuestions = $questions
                ->map(fn ($question) => $this->buildReviewQuestionWire($test, $question, $user, $nextAttempt, $answers))
                ->filter()
                ->values()
                ->map(function (array $q) use ($test) {
                    return $this->shouldRevealExamSolutions($test)
                        ? $q
                        : $this->stripWireQuestionSolutionKeys($q);
                })
                ->all();

            return response()->json([
                'message' => 'Test trimis cu succes',
                'result' => [
                    'id' => $testResult?->id,
                    'score' => $score,
                    'total_points' => $totalPoints,
                    'max_score' => $totalPoints,
                    'correct_answers_count' => $correctAnswersCount,
                    'total_questions' => $totalQuestions,
                    'percentage' => $percentage,
                    'passed' => $passed,
                    'passing_score' => $passingScore,
                    'attempt_number' => $nextAttempt,
                    'remaining_attempts' => $this->attemptService->remainingAttemptsFor(
                        $test,
                        (int) $user->id,
                        $nextAttempt
                    ),
                    'extra_attempts' => $this->attemptService->extraAttemptsFor((int) $user->id, (int) $test->id),
                    'allowed_attempts' => $this->attemptService->allowedAttemptCount($test, (int) $user->id),
                    'needs_manual_review' => $needsManualReview,
                    'status' => $testResult?->status ?? ($needsManualReview ? 'pending_review' : 'completed'),
                    'completed_at' => $testResult?->completed_at,
                    'answers' => $testResult && is_array($testResult->answers) ? $testResult->answers : (is_array($answers) ? $answers : []),
                    'review_questions' => $reviewQuestions,
                ],
            ]);
            });
        } catch (\Exception $e) {
            \Log::error('Error submitting test', [
                'test_id' => $test->id ?? null,
                'user_id' => $user->id ?? null,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'error' => 'Eroare la trimiterea testului',
                'message' => (config('app.debug') ? $e->getMessage() : null),
            ], 500);
        }
    }
    
    /**
     * Submit legacy Exam
     */
    protected function submitExam(Request $request, Exam $exam, $user)
    {
        if ($blocked = $this->gateUnpublishedExam($exam, $user)) {
            return $blocked;
        }

        $trackLearning = ! $user->isLearningActivityExempt();

        // Check access
        $accessCheck = $this->progressService->isExamUnlocked(
            $user,
            $exam,
            $exam->module,
            $exam->lesson
        );

        if (!$accessCheck) {
            return response()->json([
                'message' => empty($exam->course_id)
                    ? 'Nu ai acces la acest examen.'
                    : 'Testul nu este disponibil.',
            ], 403);
        }

        // Check attempt limits
        $userAttempts = $trackLearning
            ? ExamResult::where('exam_id', $exam->id)
                ->where('user_id', $user->id)
                ->get()
            : collect();

        $currentAttempt = $trackLearning ? $userAttempts->count() : 0;
        $nextAttempt = $currentAttempt + 1;

        if ($trackLearning && $exam->max_attempts && $nextAttempt > $exam->max_attempts) {
            return response()->json([
                'message' => "Ai atins limita de {$exam->max_attempts} încercări pentru acest test.",
                'max_attempts_reached' => true,
            ], 403);
        }

        $answers = $request->input('answers', []);
        $settings = is_array($exam->settings) ? $exam->settings : [];
        $manualReviewEnabled = array_key_exists('manual_review', $settings)
            ? (bool) $settings['manual_review']
            : true;
        $manualReviewMode = (string) ($settings['manual_review_mode'] ?? 'after_complete');

        $openSession = $this->examAttemptSessionService->find($exam, $user, $nextAttempt);
        if (! $user->isAdmin() && ! $user->isInstructor() && ! $exam->isVisibleToLearner($user)) {
            return response()->json([
                'message' => 'Nu ai acces la acest examen.',
                'allowed' => false,
            ], 403);
        }
        if (! $openSession && ($blocked = $this->gateExamAvailability($exam, $user))) {
            return $blocked;
        }

        $autoGradableTypes = ['multiple_choice', 'single_choice', 'true_false', 'yes_no', 'matching', 'ordering'];
        $session = $openSession ?: $this->examAttemptSessionService->ensure($exam, $user, $nextAttempt);
        $attemptQuestions = $this->examAttemptSessionService->questions($session);
        $hasManualQuestions = $attemptQuestions->contains(function ($q) use ($autoGradableTypes) {
            return ! in_array((string) ($q->question_type ?? 'multiple_choice'), $autoGradableTypes, true);
        });

        // Calculate score
        $score = 0;
        $totalPoints = 0;
        $correctAnswersCount = 0;
        $needsManualReview = false;
        $gradableTypes = ['multiple_choice', 'single_choice', 'true_false', 'yes_no', 'matching', 'ordering'];

        foreach ($attemptQuestions as $question) {
            $totalPoints += $question->points ?? 1;

            $questionType = $question->question_type ?? 'multiple_choice';

            if ($questionType === 'matching') {
                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                $structured = $this->buildMatchingQuestionData($question, null, $user, $nextAttempt);
                if ($this->isSequenceAnswerCorrect($userAns, $structured['correctMap'] ?? [])) {
                    $score += $question->points ?? 1;
                    $correctAnswersCount++;
                }
                continue;
            }

            if ($questionType === 'ordering') {
                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                $structured = $this->buildOrderingQuestionData($question, null, $user, $nextAttempt);
                if ($this->isSequenceAnswerCorrect($userAns, $structured['correctOrder'] ?? [])) {
                    $score += $question->points ?? 1;
                    $correctAnswersCount++;
                }
                continue;
            }

            if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
                $questionAnswers = $question->answers->values()->all();
                $correctIndices = [];
                foreach ($questionAnswers as $idx => $answer) {
                    if ($answer->is_correct) {
                        $correctIndices[] = (int) $idx;
                    }
                }
                if ($questionType === 'single_choice' || $questionType === 'true_false' || $questionType === 'yes_no') {
                    $correctIndices = $correctIndices !== [] ? [$correctIndices[0]] : [];
                } else {
                    $correctIndices = array_values(array_unique($correctIndices));
                }

                $userAns = $this->answerValueForQuestion($answers, (int) $question->id);
                if ($this->gradeChoiceQuestion($questionType, $correctIndices, $userAns, $questionAnswers)) {
                    $score += $question->points ?? 1;
                    $correctAnswersCount++;
                }
            }
        }

        $needsManualReview = $manualReviewEnabled && $hasManualQuestions;

        $percentage = $totalPoints > 0 ? (int) round(($score / $totalPoints) * 100) : 0;
        $passingScore = $exam->passing_score ?? 70;
        $passed = !$needsManualReview && $percentage >= $passingScore;

        $examResult = null;
        if ($trackLearning) {
            $examResult = ExamResult::create([
                'exam_id' => $exam->id,
                'user_id' => $user->id,
                'attempt_number' => $nextAttempt,
                'score' => $score,
                'total_points' => $totalPoints,
                'correct_answers_count' => $correctAnswersCount,
                'total_questions' => $attemptQuestions->count(),
                'percentage' => $percentage,
                'passed' => $passed,
                'answers' => $answers,
                'completed_at' => now(),
                'needs_manual_review' => $needsManualReview,
            ]);

            $this->logExamSubmission(
                $user,
                (string) $exam->title,
                (int) $exam->id,
                'Exam',
                $exam->course instanceof Course ? $exam->course : null,
                (float) $score,
                (float) $totalPoints,
                (float) $percentage,
                (bool) $passed,
                (int) $nextAttempt,
                $request
            );

            if ($exam->is_required && $passed) {
                if ($exam->module) {
                    $this->progressService->calculateModuleProgress($user, $exam->module);
                    
                    if ($this->progressService->isModuleComplete($user, $exam->module)) {
                        if ($exam->course) {
                            $this->progressService->calculateCourseProgress($user, $exam->course);
                            
                            if ($this->progressService->canFinalizeCourse($user, $exam->course)) {
                                $this->markCourseCompletedWithActivity($user, $exam->course, $request);
                            }
                        }
                    }
                } elseif ($exam->course) {
                    $this->progressService->calculateCourseProgress($user, $exam->course);
                    
                    if ($this->progressService->canFinalizeCourse($user, $exam->course)) {
                        $this->markCourseCompletedWithActivity($user, $exam->course, $request);
                    }
                }
            }
        }

        $reviewQuestions = $this->transformLegacyExamQuestionsWire($exam, $user, $nextAttempt)
            ->values()
            ->map(function (array $q) use ($exam) {
                return $this->shouldRevealExamSolutions($exam)
                    ? $q
                    : $this->stripWireQuestionSolutionKeys($q);
            })
            ->all();

        return response()->json([
            'message' => 'Test trimis cu succes',
            'result' => [
                'id' => $examResult?->id,
                'score' => $score,
                'total_points' => $totalPoints,
                'percentage' => $percentage,
                'passed' => $passed,
                'passing_score' => $passingScore,
                'attempt_number' => $nextAttempt,
                'remaining_attempts' => $exam->max_attempts 
                    ? max(0, $exam->max_attempts - $nextAttempt)
                    : null,
                'needs_manual_review' => $needsManualReview,
                'manual_review_mode' => $manualReviewMode,
                'manual_review_enabled' => $manualReviewEnabled,
                'has_manual_questions' => $hasManualQuestions,
                'completed_at' => $examResult?->completed_at,
                'status' => $needsManualReview ? 'pending_review' : 'completed',
                'answers' => is_array($answers) ? $answers : [],
                'review_questions' => $reviewQuestions,
            ],
        ]);
    }

    /**
     * Payload JSON folosește adesea chei string pentru id-uri întrebări.
     */
    protected function answerValueForQuestion(array $answers, int $questionId): mixed
    {
        if (array_key_exists($questionId, $answers)) {
            return $answers[$questionId];
        }
        $key = (string) $questionId;
        if (array_key_exists($key, $answers)) {
            return $answers[$key];
        }

        return null;
    }

    protected function logExamSubmission(
        $user,
        string $title,
        int $modelId,
        string $modelType,
        ?Course $course,
        float|int $score,
        float|int $totalPoints,
        float|int $percentage,
        bool $passed,
        int $attemptNumber,
        Request $request
    ): void {
        try {
            \App\Support\StudentActivityLogger::logCompletedExamIfFirstPass(
                $user,
                $modelType,
                $modelId,
                "{$user->name} a finalizat testul \"{$title}\" și a obținut {$percentage}%",
                [
                    'exam_id' => $modelId,
                    'exam_title' => $title,
                    'course_id' => $course?->id,
                    'course_title' => $course?->title,
                    'score' => $score,
                    'total_points' => $totalPoints,
                    'percentage' => $percentage,
                    'passed' => $passed,
                    'attempt_number' => $attemptNumber,
                ]
            );
        } catch (\Throwable $e) {
            \Log::warning('Failed to log completed_exam activity', [
                'user_id' => $user->id ?? null,
                'model_id' => $modelId,
                'model_type' => $modelType,
                'error' => $e->getMessage(),
            ]);
        }
    }

    protected function markCourseCompletedWithActivity($user, Course $course, Request $request): void
    {
        if ($user->isLearningActivityExempt()) {
            return;
        }

        $existing = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first();

        $wasCompleted = $existing && !empty($existing->completed_at);

        DB::table('course_user')->updateOrInsert(
            [
                'user_id' => $user->id,
                'course_id' => $course->id,
            ],
            [
                'enrolled' => true,
                'enrolled_at' => $existing->enrolled_at ?? now(),
                'progress_percentage' => 100,
                'completed_at' => $existing->completed_at ?? now(),
                'updated_at' => now(),
                'created_at' => $existing->created_at ?? now(),
            ]
        );

        if (! $wasCompleted) {
            try {
                if (\App\Support\StudentActivityLogger::logCompletedCourseIfFirst($user, $course)) {
                    app(\App\Services\NotificationService::class)->notifyCourseCompleted($user, $course);
                }
            } catch (\Throwable $e) {
                \Log::warning('Failed to log completed_course activity', [
                    'user_id' => $user->id ?? null,
                    'course_id' => $course->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
