<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class QuizController extends Controller
{
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

    protected function normalizeSequenceAnswer(mixed $value): ?array
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

    protected function isSequenceAnswerCorrect(mixed $userAnswer, array $correctSequence): bool
    {
        $normalized = $this->normalizeSequenceAnswer($userAnswer);
        if ($normalized === null) {
            return false;
        }

        return $normalized === array_values(array_map('strval', $correctSequence));
    }

    protected function shuffleBySeed(array $items, string $seedBase): array
    {
        $indexed = [];
        foreach ($items as $idx => $item) {
            $label = is_array($item)
                ? (string) ($item['text'] ?? $item['answer_text'] ?? $item['content'] ?? $item['label'] ?? '')
                : (string) $item;
            $indexed[] = [
                'key' => hash('sha1', $seedBase . ":{$idx}:" . $label),
                'item' => $item,
            ];
        }

        usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);

        return array_values(array_map(fn ($entry) => $entry['item'], $indexed));
    }

    protected function buildMatchingQuestionData($question): array
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

        $seedBase = "quiz:{$question->id}:matching";
        return [
            'leftItems' => $leftItems,
            'rightItems' => $this->shuffleBySeed($rightItems, $seedBase),
            'correctMap' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $rightItems)),
        ];
    }

    protected function buildOrderingQuestionData($question): array
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

        $seedBase = "quiz:{$question->id}:ordering";
        return [
            'items' => $this->shuffleBySeed($normalized, $seedBase),
            'correctOrder' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $normalized)),
        ];
    }

    /**
     * Wire format for course quiz (frontend). $withSolutions: include answerIndex / correctMap / correctOrder.
     */
    protected function examQuestionsToQuizWire(Exam $exam, bool $withSolutions): array
    {
        $settings = is_array($exam->settings) ? $exam->settings : [];
        $submittedOnly = (bool) ($settings['show_only_submitted_answers'] ?? false);
        $includeSolutions = $withSolutions && ! $submittedOnly;

        return $exam->questions->map(function ($question) {
            $answers = $question->answers;
            $correctAnswerIndex = null;
            $matching = null;
            $ordering = null;

            if ($question->question_type === 'multiple_choice' || $question->question_type === 'single_choice' || $question->question_type === 'true_false') {
                foreach ($answers as $idx => $answer) {
                    if ($answer->is_correct) {
                        $correctAnswerIndex = $idx;
                        break;
                    }
                }
            } elseif ($question->question_type === 'matching') {
                $matching = $this->buildMatchingQuestionData($question);
            } elseif ($question->question_type === 'ordering') {
                $ordering = $this->buildOrderingQuestionData($question);
            }

            return [
                'id' => $question->id,
                'text' => $question->question_text,
                'type' => $question->question_type ?? 'multiple_choice',
                'options' => in_array($question->question_type ?? '', ['multiple_choice', 'single_choice', 'true_false'], true)
                    ? $answers->pluck('answer_text')->toArray()
                    : [],
                'answerIndex' => $correctAnswerIndex,
                'points' => $question->points ?? 1,
                'matching' => $matching,
                'ordering' => $ordering,
            ];
        })->values()->map(function (array $row) use ($includeSolutions) {
            if ($includeSolutions) {
                return $row;
            }
            $row['answerIndex'] = null;
            if (is_array($row['matching'] ?? null)) {
                unset($row['matching']['correctMap']);
            }
            if (is_array($row['ordering'] ?? null)) {
                unset($row['ordering']['correctOrder']);
            }

            return $row;
        })->all();
    }

    public function show($courseId)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Autentificare necesară.'], 401);
        }

        $course = Course::findOrFail($courseId);

        // Load exam for this course
        $exam = Exam::with(['questions.answers' => function ($query) {
            $query->orderBy('order');
        }])->where('course_id', $courseId)->first();

        if (! $exam) {
            return response()->json([
                'error' => 'Nu există test disponibil pentru acest curs',
            ], 404);
        }

        $existingResults = ExamResult::where('exam_id', $exam->id)
            ->where('user_id', $user->id)
            ->orderedByAttempt()
            ->get();

        $currentAttempt = 0;
        $canRetake = true;
        $latestResult = null;

        if ($existingResults->count() > 0) {
            $latestResult = $existingResults->first();
            $currentAttempt = $latestResult->attempt_number;

            if ($exam->max_attempts !== null && $currentAttempt >= $exam->max_attempts) {
                $canRetake = false;
            }
        }

        $questionsWire = $this->examQuestionsToQuizWire($exam, $latestResult !== null);
        $settings = is_array($exam->settings) ? $exam->settings : [];

        return response()->json([
            'id' => $exam->id,
            'title' => $exam->title,
            'courseId' => $course->id,
            'maxScore' => $exam->max_score,
            'maxAttempts' => $exam->max_attempts,
            'show_only_submitted_answers' => (bool) ($settings['show_only_submitted_answers'] ?? false),
            'questions' => $questionsWire,
            'hasResult' => $latestResult !== null,
            'currentAttempt' => $currentAttempt,
            'canRetake' => $canRetake,
            'result' => $latestResult ? [
                'score' => $latestResult->score,
                'total' => $latestResult->total_points,
                'percentage' => $latestResult->percentage,
                'passed' => $latestResult->passed,
                'answers' => $latestResult->answers,
                'completed_at' => $latestResult->completed_at,
                'attempt_number' => $latestResult->attempt_number,
            ] : null,
        ]);
    }

    public function submit(Request $request, $courseId)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Autentificare necesară.'], 401);
        }

        $course = Course::with('modules')->findOrFail($courseId);
        $answers = $request->input('answers', []);

        // Load exam with questions and answers
        $exam = Exam::with(['questions.answers' => function ($query) {
            $query->orderBy('order');
        }])->where('course_id', $courseId)->first();

        if (! $exam) {
            return response()->json([
                'error' => 'Nu există test disponibil pentru acest curs',
            ], 404);
        }

        // Check if user can submit (check attempt limits)
        $trackLearning = ! $user->isLearningActivityExempt();
        if ($trackLearning) {
            $existingResults = ExamResult::where('exam_id', $exam->id)
                ->where('user_id', $user->id)
                ->get();

            $currentAttempt = $existingResults->count() > 0 ? $existingResults->max('attempt_number') : 0;
            $nextAttempt = $currentAttempt + 1;

            // Check if max attempts reached
            if ($exam->max_attempts !== null && $nextAttempt > $exam->max_attempts) {
                return response()->json([
                    'error' => "Ai atins limita de {$exam->max_attempts} încercări pentru acest test.",
                    'maxAttemptsReached' => true,
                ], 403);
            }
        }
        
        // Calculate score based on correct answers
        $score = 0;
        $totalPoints = 0;
        $needsManualReview = false;
        foreach ($exam->questions as $question) {
            $totalPoints += $question->points ?? 1;
            
            $questionType = $question->question_type ?? 'multiple_choice';

            if ($questionType === 'matching') {
                $userAnswer = $this->answerValueForQuestion($answers, (int) $question->id);
                $structured = $this->buildMatchingQuestionData($question);
                if ($this->isSequenceAnswerCorrect($userAnswer, $structured['correctMap'] ?? [])) {
                    $score += $question->points ?? 1;
                }
                continue;
            }

            if ($questionType === 'ordering') {
                $userAnswer = $this->answerValueForQuestion($answers, (int) $question->id);
                $structured = $this->buildOrderingQuestionData($question);
                if ($this->isSequenceAnswerCorrect($userAnswer, $structured['correctOrder'] ?? [])) {
                    $score += $question->points ?? 1;
                }
                continue;
            }

            if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false'], true)) {
                $questionAnswers = $question->answers->values(); // Reset keys to 0,1,2,3...
                
                // Find correct answer index
                $correctAnswerIndex = null;
                foreach ($questionAnswers as $idx => $answer) {
                    if ($answer->is_correct) {
                        $correctAnswerIndex = $idx;
                        break;
                    }
                }
                
                // Check if user's answer matches correct answer
                $userAnswer = $this->answerValueForQuestion($answers, (int) $question->id);
                if ($userAnswer !== null && $userAnswer !== '' && (int) $userAnswer === (int) $correctAnswerIndex) {
                    $score += $question->points ?? 1;
                }
            }
        }
        
        $percentage = $totalPoints > 0 ? round(($score / $totalPoints) * 100) : 0;
        $passed = $percentage >= 50;
        
        // Save quiz result to database
        if ($trackLearning) {
            $existingResults = ExamResult::where('exam_id', $exam->id)
                ->where('user_id', $user->id)
                ->get();
            
            $currentAttempt = $existingResults->count() > 0 ? $existingResults->max('attempt_number') : 0;
            $nextAttempt = $currentAttempt + 1;
            
            $examResult = ExamResult::create([
                'exam_id' => $exam->id,
                'user_id' => $user->id,
                'attempt_number' => $nextAttempt,
                'score' => $score,
                'total_points' => $totalPoints,
                'percentage' => $percentage,
                'passed' => $passed,
                'answers' => $answers,
                'completed_at' => now(),
                'needs_manual_review' => false,
            ]);
            
            \App\Support\StudentActivityLogger::logCompletedExamIfFirstPass(
                $user,
                'Exam',
                $exam->id,
                "{$user->name} a finalizat testul \"{$exam->title}\" pentru cursul \"{$course->title}\" cu scorul {$score}/{$totalPoints} ({$percentage}%)",
                [
                    'exam_id' => $exam->id,
                    'exam_title' => $exam->title,
                    'course_id' => $course->id,
                    'course_title' => $course->title,
                    'score' => $score,
                    'total_points' => $totalPoints,
                    'percentage' => $percentage,
                    'passed' => $passed,
                    'attempt_number' => $nextAttempt,
                ]
            );
            
            // Update course progress if exam is passed
            // Course is completed when exam is passed (modules don't need individual completion)
            if ($passed) {
                // Calculate progress percentage (always 100% when course is completed)
                $progressPercentage = 100;
                
                // Course is completed
                $isCompleted = true;
                
                // Update course_user entry
                $existingRecord = DB::table('course_user')
                    ->where('course_id', $course->id)
                    ->where('user_id', $user->id)
                    ->first();

                if ($existingRecord) {
                    // Update existing record
                    DB::table('course_user')
                        ->where('course_id', $course->id)
                        ->where('user_id', $user->id)
                        ->update([
                            'progress_percentage' => $progressPercentage,
                            'completed_at' => $isCompleted ? now() : null,
                            'started_at' => $existingRecord->started_at ?: now(),
                            'updated_at' => now(),
                        ]);
                } else {
                    // Insert new record
                    DB::table('course_user')
                        ->insert([
                            'course_id' => $course->id,
                            'user_id' => $user->id,
                            'progress_percentage' => $progressPercentage,
                            'completed_at' => $isCompleted ? now() : null,
                            'started_at' => now(),
                            'is_mandatory' => false,
                            'enrolled' => false,
                            'enrolled_at' => now(),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                }
                
                $wasAlreadyCompleted = \App\Support\StudentActivityLogger::courseWasAlreadyCompleted($user->id, $course->id);
                if (! $wasAlreadyCompleted && \App\Support\StudentActivityLogger::logCompletedCourseIfFirst($user, $course)) {
                    app(\App\Services\NotificationService::class)->notifyCourseCompleted($user, $course);
                }
                
                // Invalidate cache for dashboard and profile
                Cache::forget("dashboard_user_{$user->id}_stats");
                Cache::forget("profile_user_{$user->id}");
            }
        }
        
        $settings = is_array($exam->settings) ? $exam->settings : [];

        return response()->json([
            'score' => $score,
            'total' => $totalPoints,
            'maxScore' => $exam->max_score,
            'passed' => $passed,
            'percentage' => $percentage,
            'show_only_submitted_answers' => (bool) ($settings['show_only_submitted_answers'] ?? false),
            'review_questions' => $this->examQuestionsToQuizWire($exam, true),
        ]);
    }

    // Removed: showCategoryQuiz and submitCategoryQuiz - categories are no longer supported
}
