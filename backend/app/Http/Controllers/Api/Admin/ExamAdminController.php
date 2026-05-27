<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamAnswer;
use App\Models\ExamResult;
use App\Services\ExamBankQuestionSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\QueryException;

class ExamAdminController extends Controller
{
    public function __construct(
        protected ExamBankQuestionSyncService $examBankQuestionSyncService
    ) {
    }

    /**
     * Instructor: cursuri proprii sau examene independente create de el.
     */
    protected function assertExamAccessibleByInstructor(Exam $exam): void
    {
        $user = auth()->user();
        if (! $user->isInstructor()) {
            return;
        }
        if ($exam->course_id) {
            $course = $exam->relationLoaded('course') ? $exam->course : $exam->course()->first();
            if ($course && (int) $course->teacher_id === (int) $user->id) {
                return;
            }
            abort(403, 'Acces interzis.');
        }
        if (Schema::hasColumn('exams', 'created_by') && (int) ($exam->created_by ?? 0) === (int) $user->id) {
            return;
        }
        abort(403, 'Acces interzis.');
    }

    public function index(Request $request)
    {
        $query = Exam::with(['course'])->withCount('questions');
        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            $query->where(function ($q) use ($uid) {
                $q->whereHas('course', fn ($c) => $c->where('teacher_id', $uid));
                if (Schema::hasColumn('exams', 'created_by')) {
                    $q->orWhere(function ($q2) use ($uid) {
                        $q2->whereNull('course_id')->where('created_by', $uid);
                    });
                }
            });
        }
        if ($request->has('course_id')) {
            $query->where('course_id', $request->course_id);
            if (auth()->user()->isInstructor()) {
                $c = Course::find($request->course_id);
                if (!$c || (int) $c->teacher_id !== (int) auth()->id()) {
                    abort(403, 'Acces interzis.');
                }
            }
        }

        $exams = $query->get()->map(function($exam) {
            return [
                'id' => $exam->id,
                'course_id' => $exam->course_id,
                'title' => $exam->title,
                'description' => $exam->description,
                'status' => $exam->status,
                'max_score' => $exam->max_score,
                'max_attempts' => $exam->max_attempts,
                'time_limit_minutes' => $exam->time_limit_minutes,
                'passing_score' => $exam->passing_score,
                'settings' => $exam->settings,
                'course_title' => $exam->course ? $exam->course->title : null,
                'questions_count' => (int) ($exam->questions_count ?? 0),
                'created_at' => $exam->created_at,
                'updated_at' => $exam->updated_at,
            ];
        });

        return response()->json($exams);
    }

    public function show($id)
    {
        $exam = Exam::with(['course', 'questions.answers'])->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        return response()->json($exam);
    }

    public function preview($id)
    {
        $exam = Exam::with(['course:id,title,teacher_id', 'questions.answers'])->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        $settings = is_array($exam->settings) ? $exam->settings : [];
        $questions = $exam->questions->sortBy('order')->values()->map(function ($question) {
            $answers = $question->answers->sortBy('order')->values();
            $questionType = $question->question_type ?? 'multiple_choice';
            $correctAnswerIndex = null;
            foreach ($answers as $idx => $answer) {
                if ($answer->is_correct) {
                    $correctAnswerIndex = $idx;
                    break;
                }
            }

            return [
                'id' => $question->id,
                'text' => $question->question_text,
                'type' => $questionType,
                'options' => in_array($questionType, ['multiple_choice', 'single_choice', 'true_false'], true)
                    ? $answers->pluck('answer_text')->toArray()
                    : [],
                'answerIndex' => $correctAnswerIndex,
                'points' => $question->points ?? 1,
                'explanation' => $question->explanation ?? null,
                'matching' => $questionType === 'matching' ? $this->buildPreviewMatchingData($question) : null,
                'ordering' => $questionType === 'ordering' ? $this->buildPreviewOrderingData($question) : null,
            ];
        });

        return response()->json([
            'id' => $exam->id,
            'title' => $exam->title,
            'description' => $exam->description,
            'instructions' => $settings['instructions'] ?? null,
            'show_feedback_instant' => (bool) ($settings['show_feedback_instant'] ?? false),
            'show_correct_answers' => (bool) ($settings['show_correct_answers'] ?? false),
            'passing_score' => $exam->passing_score ?? 70,
            'time_limit_minutes' => $exam->time_limit_minutes,
            'max_attempts' => $exam->max_attempts,
            'is_required' => (bool) $exam->is_required,
            'questions' => $questions,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'nullable|integer|exists:courses,id',
            'module_id' => 'nullable|integer|exists:modules,id',
            'title' => 'required|string|max:255',
            'max_score' => 'nullable|integer|min:1',
            'max_attempts' => 'nullable|integer|min:1',
            'time_limit_minutes' => 'nullable|integer|min:0',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'is_required' => 'nullable|boolean',
            'status' => 'nullable|string|in:draft,published,archived',
            'description' => 'nullable|string',
            'settings' => 'nullable|array',
            'questions' => 'nullable|array',
            'questions.*.question_text' => 'required|string',
            'questions.*.question_type' => 'nullable|string|in:single_choice,multiple_choice,true_false,matching,ordering',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.payload' => 'nullable|array',
            'questions.*.answers' => 'nullable|array',
            'questions.*.answers.*.answer_text' => 'required|string',
            'questions.*.answers.*.is_correct' => 'nullable|boolean',
            'questions.*.answers.*.order' => 'nullable|integer|min:0',
        ]);

        // Get course_id - either from validated data or from module_id
        $courseId = null;
        if (isset($validated['course_id']) && $validated['course_id'] !== null && $validated['course_id'] !== '') {
            $courseId = (int)$validated['course_id'];
        } elseif (isset($validated['module_id']) && $validated['module_id'] !== null && $validated['module_id'] !== '') {
            // If module_id is provided but course_id is not, get course_id from module
            $module = \App\Models\Module::find($validated['module_id']);
            if ($module) {
                if ($module->course_id) {
                    $courseId = (int)$module->course_id;
                } else {
                    \Log::error('Module found but has no course_id', [
                        'module_id' => $validated['module_id'],
                        'module' => $module->toArray()
                    ]);
                }
            } else {
                \Log::error('Module not found', [
                    'module_id' => $validated['module_id']
                ]);
            }
        }

        if (auth()->user()->isInstructor()) {
            if ($courseId) {
                $course = Course::findOrFail($courseId);
                if ((int) $course->teacher_id !== (int) auth()->id()) {
                    abort(403, 'Acces interzis. Poți crea examene doar pentru cursurile tale.');
                }
            } elseif (! Schema::hasColumn('exams', 'created_by')) {
                abort(403, 'Acces interzis. Instructorii trebuie să aleagă un curs.');
            }
        }
        
        \Log::info('Creating exam with associations', [
            'course_id' => $courseId,
            'module_id' => $validated['module_id'] ?? null,
        ]);

        $validated['max_score'] = $validated['max_score'] ?? 100;

        $examData = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'draft',
            'max_score' => $validated['max_score'],
            'max_attempts' => $validated['max_attempts'] ?? null,
        ];
        if ($courseId) {
            $examData['course_id'] = $courseId;
        }
        
        // If module_id is provided, also set it (for linking exams to modules)
        if (isset($validated['module_id']) && $validated['module_id']) {
            $examData['module_id'] = (int)$validated['module_id'];
        }
        
        // Add optional fields if provided
        if (isset($validated['passing_score'])) {
            $examData['passing_score'] = (int)$validated['passing_score'];
        }
        if (isset($validated['time_limit_minutes'])) {
            $examData['time_limit_minutes'] = (int)$validated['time_limit_minutes'];
        }
        if (isset($validated['is_required'])) {
            $examData['is_required'] = (bool)$validated['is_required'];
        }
        if (array_key_exists('settings', $validated)) {
            $examData['settings'] = $validated['settings'];
        }
        if (Schema::hasColumn('exams', 'created_by')) {
            $examData['created_by'] = (int) auth()->id();
        }

        \Log::info('Creating exam with examData', [
            'examData' => $examData,
            'has_course_id' => isset($examData['course_id']),
            'has_module_id' => isset($examData['module_id']),
        ]);
        
        $exam = Exam::create($examData);
        
        // Refresh to get the actual saved values
        $exam->refresh();
        
        \Log::info('Exam created successfully', [
            'exam_id' => $exam->id,
            'course_id' => $exam->course_id,
            'module_id' => $exam->module_id,
        ]);

        // Create questions and answers if provided
        if (isset($validated['questions'])) {
            foreach ($validated['questions'] as $questionData) {
                $payload = $this->validateQuestionPayload(
                    $questionData['question_type'] ?? 'multiple_choice',
                    $questionData['payload'] ?? null
                );
                $question = ExamQuestion::create([
                    'exam_id' => $exam->id,
                    'question_text' => $questionData['question_text'],
                    'question_type' => $questionData['question_type'] ?? 'multiple_choice',
                    'points' => $questionData['points'] ?? 1,
                    'order' => $questionData['order'] ?? 0,
                    'payload' => $payload,
                ]);

                if (isset($questionData['answers'])) {
                    foreach ($questionData['answers'] as $answerData) {
                        ExamAnswer::create([
                            'exam_question_id' => $question->id,
                            'answer_text' => $answerData['answer_text'],
                            'is_correct' => $answerData['is_correct'] ?? false,
                            'order' => $answerData['order'] ?? 0,
                        ]);
                    }
                }
            }
        } elseif ($this->examBankQuestionSyncService->shouldSync(is_array($exam->settings) ? $exam->settings : [])) {
            $this->examBankQuestionSyncService->syncFromSettings(
                $exam,
                is_array($exam->settings) ? $exam->settings : [],
                auth()->user()
            );
        }

        // Reload exam with relationships to ensure we have the latest data
        $exam->refresh();
        $exam->load(['course', 'module', 'questions.answers']);
        $exam->loadCount('questions');

        \Log::info('Returning exam response', [
            'exam_id' => $exam->id,
            'course_id' => $exam->course_id,
            'module_id' => $exam->module_id,
            'has_course' => $exam->course !== null,
            'has_module' => $exam->module !== null,
        ]);

        return response()->json([
            'message' => 'Test creat cu succes',
            'exam' => $exam,
        ], 201);
    }

    /**
     * Actualizare rapidă doar status (listă admin) — fără reîncărcare întrebări.
     */
    public function patchStatus(Request $request, $id)
    {
        $exam = Exam::with('course')->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        $validated = $request->validate([
            'status' => 'required|string|in:draft,published,archived',
        ]);

        try {
            $exam->update(['status' => $validated['status']]);
        } catch (QueryException $e) {
            \Log::error('Exam patchStatus failed', [
                'exam_id' => $exam->id,
                'status' => $validated['status'],
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Statusul examenului nu a putut fi salvat. Verifică migrările bazei de date (status archived).',
            ], 422);
        }

        return response()->json([
            'message' => 'Status actualizat',
            'exam' => [
                'id' => $exam->id,
                'title' => $exam->title,
                'status' => $exam->status,
                'course_id' => $exam->course_id,
                'course_title' => $exam->course?->title,
            ],
        ]);
    }

    public function update(Request $request, $id)
    {
        $exam = Exam::with('course')->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        $validated = $request->validate([
            'course_id' => 'nullable|integer|exists:courses,id',
            'module_id' => 'nullable|integer|exists:modules,id',
            'title' => 'sometimes|required|string|max:255',
            'max_score' => 'nullable|integer|min:1',
            'max_attempts' => 'nullable|integer|min:1',
            'time_limit_minutes' => 'nullable|integer|min:0',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'is_required' => 'nullable|boolean',
            'status' => 'nullable|string|in:draft,published,archived',
            'description' => 'nullable|string',
            'settings' => 'nullable|array',
            'questions' => 'nullable|array',
            'questions.*.id' => 'nullable|exists:exam_questions,id',
            'questions.*.question_text' => 'required|string',
            'questions.*.question_type' => 'nullable|string|in:single_choice,multiple_choice,true_false,matching,ordering',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.payload' => 'nullable|array',
            'questions.*.answers' => 'nullable|array',
            'questions.*.answers.*.id' => 'nullable|exists:exam_answers,id',
            'questions.*.answers.*.answer_text' => 'required|string',
            'questions.*.answers.*.is_correct' => 'nullable|boolean',
            'questions.*.answers.*.order' => 'nullable|integer|min:0',
        ]);

        // Get course_id - either from validated data, from module_id, or keep existing
        $newCourseId = null;
        if (isset($validated['course_id']) && $validated['course_id'] !== null && $validated['course_id'] !== '') {
            $newCourseId = (int)$validated['course_id'];
        } elseif (isset($validated['module_id']) && $validated['module_id'] !== null && $validated['module_id'] !== '') {
            // If module_id is provided but course_id is not, get course_id from module
            $module = \App\Models\Module::find($validated['module_id']);
            if ($module && $module->course_id) {
                $newCourseId = (int)$module->course_id;
            }
        } else {
            // Keep existing course_id
            $newCourseId = $exam->course_id;
        }
        
        // Update exam basic info
        $updateData = [
            'title' => $validated['title'] ?? $exam->title,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $exam->description,
            'status' => $validated['status'] ?? $exam->status,
            'max_score' => $validated['max_score'] ?? $exam->max_score,
            'max_attempts' => $validated['max_attempts'] ?? $exam->max_attempts,
        ];
        if ($newCourseId) {
            $updateData['course_id'] = $newCourseId;
        } elseif (array_key_exists('course_id', $validated) && $validated['course_id'] === null) {
            $updateData['course_id'] = null;
        }
        
        // If module_id is provided, also update it
        if (isset($validated['module_id']) && $validated['module_id']) {
            $updateData['module_id'] = (int)$validated['module_id'];
        }
        
        // Add optional fields if provided
        if (array_key_exists('passing_score', $validated)) {
            $updateData['passing_score'] = (int)$validated['passing_score'];
        }
        if (array_key_exists('time_limit_minutes', $validated)) {
            $updateData['time_limit_minutes'] = $validated['time_limit_minutes'] !== null ? (int)$validated['time_limit_minutes'] : null;
        }
        if (isset($validated['is_required'])) {
            $updateData['is_required'] = (bool)$validated['is_required'];
        }
        if (array_key_exists('settings', $validated)) {
            $updateData['settings'] = $validated['settings'];
        }
        
        try {
            $exam->update($updateData);
        } catch (QueryException $e) {
            \Log::error('Exam update failed', [
                'exam_id' => $exam->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Examenul nu a putut fi actualizat: ' . $e->getMessage(),
            ], 422);
        }

        // Update questions and answers if provided
        if (isset($validated['questions'])) {
            $existingQuestionIds = [];
            
            foreach ($validated['questions'] as $questionData) {
                $payload = $this->validateQuestionPayload(
                    $questionData['question_type'] ?? 'multiple_choice',
                    $questionData['payload'] ?? null
                );
                if (isset($questionData['id'])) {
                    // Update existing question
                    $question = ExamQuestion::findOrFail($questionData['id']);
                    $question->update([
                        'question_text' => $questionData['question_text'],
                        'question_type' => $questionData['question_type'] ?? $question->question_type ?? 'multiple_choice',
                        'points' => $questionData['points'] ?? $question->points,
                        'order' => $questionData['order'] ?? $question->order,
                        'payload' => $payload,
                    ]);
                    $existingQuestionIds[] = $question->id;
                } else {
                    // Create new question
                    $question = ExamQuestion::create([
                        'exam_id' => $exam->id,
                        'question_text' => $questionData['question_text'],
                        'question_type' => $questionData['question_type'] ?? 'multiple_choice',
                        'points' => $questionData['points'] ?? 1,
                        'order' => $questionData['order'] ?? 0,
                        'payload' => $payload,
                    ]);
                    $existingQuestionIds[] = $question->id;
                }

                // Handle answers
                if (isset($questionData['answers'])) {
                    $existingAnswerIds = [];
                    
                    foreach ($questionData['answers'] as $answerData) {
                        if (isset($answerData['id'])) {
                            // Update existing answer
                            $answer = ExamAnswer::findOrFail($answerData['id']);
                            $answer->update([
                                'answer_text' => $answerData['answer_text'],
                                'is_correct' => $answerData['is_correct'] ?? false,
                                'order' => $answerData['order'] ?? $answer->order,
                            ]);
                            $existingAnswerIds[] = $answer->id;
                        } else {
                            // Create new answer
                            $answer = ExamAnswer::create([
                                'exam_question_id' => $question->id,
                                'answer_text' => $answerData['answer_text'],
                                'is_correct' => $answerData['is_correct'] ?? false,
                                'order' => $answerData['order'] ?? 0,
                            ]);
                            $existingAnswerIds[] = $answer->id;
                        }
                    }
                    
                    // Delete answers that were removed
                    ExamAnswer::where('exam_question_id', $question->id)
                        ->whereNotIn('id', $existingAnswerIds)
                        ->delete();
                }
            }
            
            // Delete questions that were removed
            ExamQuestion::where('exam_id', $exam->id)
                ->whereNotIn('id', $existingQuestionIds)
                ->delete();
        } elseif (array_key_exists('settings', $validated)
            && $this->examBankQuestionSyncService->shouldSync(is_array($exam->settings) ? $exam->settings : [])) {
            $this->examBankQuestionSyncService->syncFromSettings(
                $exam,
                is_array($exam->settings) ? $exam->settings : [],
                auth()->user()
            );
        }

        $exam->refresh();
        $exam->load(['course', 'questions.answers']);
        $exam->loadCount('questions');

        return response()->json([
            'message' => 'Test actualizat cu succes',
            'exam' => $exam,
        ]);
    }

    public function destroy($id)
    {
        $exam = Exam::with('course')->find($id);
        if (!$exam) {
            return response()->json(['error' => 'Examen negăsit'], 404);
        }
        $this->assertExamAccessibleByInstructor($exam);

        DB::transaction(function () use ($exam) {
            $exam->delete();
        });

        return response()->json([
            'message' => 'Examen șters cu succes',
        ]);
    }

    public function duplicate(Request $request, $id)
    {
        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
        ]);

        $source = Exam::with(['course', 'questions.answers'])->findOrFail($id);

        if (auth()->user()->isInstructor()) {
            $this->assertExamAccessibleByInstructor($source);
        }

        $copySettings = is_array($source->settings)
            ? json_decode(json_encode($source->settings), true)
            : [];

        $baseTitle = isset($validated['title']) && trim((string) $validated['title']) !== ''
            ? trim($validated['title'])
            : ($source->title . ' (copie)');
        if (mb_strlen($baseTitle) > 255) {
            $baseTitle = mb_substr($baseTitle, 0, 252) . '...';
        }

        $questionTypes = $source->question_types;
        if (is_array($questionTypes)) {
            $questionTypes = json_decode(json_encode($questionTypes), true);
        }

        $newExam = DB::transaction(function () use ($source, $copySettings, $baseTitle, $questionTypes) {
            $create = [
                'course_id' => $source->course_id,
                'module_id' => $source->module_id,
                'lesson_id' => $source->lesson_id,
                'title' => $baseTitle,
                'description' => $source->description,
                'status' => 'draft',
                'max_score' => $source->max_score ?? 100,
                'passing_score' => $source->passing_score,
                'time_limit_minutes' => $source->time_limit_minutes,
                'max_attempts' => $source->max_attempts,
                'is_required' => false,
                'unlock_after_completion' => (bool) $source->unlock_after_completion,
                'unlock_target_id' => $source->unlock_target_id,
                'unlock_target_type' => $source->unlock_target_type,
                'question_types' => $questionTypes,
                'settings' => $copySettings,
                'attempts_count' => 0,
                'passes_count' => 0,
                'average_score' => null,
            ];
            if (Schema::hasColumn('exams', 'created_by')) {
                $create['created_by'] = (int) auth()->id();
            }
            $new = Exam::create($create);

            foreach ($source->questions->sortBy('order') as $q) {
                $payload = $q->payload;
                if (is_array($payload)) {
                    $payload = json_decode(json_encode($payload), true);
                }
                $nq = ExamQuestion::create([
                    'exam_id' => $new->id,
                    'question_text' => $q->question_text,
                    'question_type' => $q->question_type,
                    'order' => $q->order,
                    'points' => $q->points,
                    'payload' => $payload,
                ]);
                foreach ($q->answers->sortBy('order') as $a) {
                    ExamAnswer::create([
                        'exam_question_id' => $nq->id,
                        'answer_text' => $a->answer_text,
                        'is_correct' => (bool) $a->is_correct,
                        'order' => $a->order,
                    ]);
                }
            }

            return $new;
        });

        $newExam->load(['course']);
        $newExam->loadCount('questions');

        return response()->json([
            'message' => 'Examen duplicat.',
            'exam' => [
                'id' => $newExam->id,
                'course_id' => $newExam->course_id,
                'title' => $newExam->title,
                'description' => $newExam->description,
                'status' => $newExam->status,
                'max_score' => $newExam->max_score,
                'max_attempts' => $newExam->max_attempts,
                'time_limit_minutes' => $newExam->time_limit_minutes,
                'passing_score' => $newExam->passing_score,
                'settings' => $newExam->settings,
                'course_title' => $newExam->course ? $newExam->course->title : null,
                'questions_count' => $newExam->questions_count,
                'created_at' => $newExam->created_at,
                'updated_at' => $newExam->updated_at,
            ],
        ], 201);
    }

    public function uploadCover(Request $request, $id)
    {
        $exam = Exam::with('course')->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        $validated = $request->validate([
            'file' => 'required|image|max:5120',
        ]);

        $file = $validated['file'];
        $path = $file->store('exam-covers', 'public');
        $url = '/storage/' . ltrim($path, '/');

        $settings = is_array($exam->settings) ? $exam->settings : [];
        $settings['cover_url'] = $url;
        $settings['cover_name'] = $file->getClientOriginalName();
        $exam->update(['settings' => $settings]);

        return response()->json([
            'url' => $url,
            'filename' => $file->getClientOriginalName(),
        ], 201);
    }

    public function results(Request $request, $id)
    {
        $exam = Exam::with('course')->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        if (!Schema::hasTable('exam_results')) {
            return response()->json([]);
        }

        $rows = ExamResult::with(['user:id,name,email'])
            ->where('exam_id', $exam->id)
            ->orderByDesc('completed_at')
            ->get()
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'attempt_number' => $row->attempt_number,
                    'score' => $row->score,
                    'total_points' => $row->total_points,
                    'percentage' => $row->percentage,
                    'passed' => $row->passed,
                    'completed_at' => $row->completed_at,
                    'needs_manual_review' => $row->needs_manual_review,
                    'reviewed_at' => $row->reviewed_at,
                    'status' => $row->reviewed_at ? 'approved' : ($row->needs_manual_review ? 'pending' : 'completed'),
                    'user' => [
                        'id' => $row->user?->id,
                        'name' => $row->user?->name,
                        'email' => $row->user?->email,
                    ],
                ];
            });

        return response()->json($rows->values());
    }

    public function questionAnalytics(Request $request, $id)
    {
        $exam = Exam::with(['course', 'questions.answers'])->findOrFail($id);
        $this->assertExamAccessibleByInstructor($exam);

        if (!Schema::hasTable('exam_results')) {
            return response()->json([]);
        }

        $results = ExamResult::where('exam_id', $exam->id)
            ->orderByDesc('completed_at')
            ->get(['answers', 'manual_review_scores']);

        $attemptsCount = $results->count();
        $rows = $exam->questions
            ->sortBy('order')
            ->values()
            ->map(function ($question) use ($results, $attemptsCount) {
                $questionIdKey = (string) $question->id;
                $questionType = (string) ($question->question_type ?? 'multiple_choice');
                $isChoiceType = in_array($questionType, ['multiple_choice', 'single_choice', 'true_false'], true);

                $answers = $question->answers->sortBy('order')->values();
                $correctIndex = null;
                $optionStats = [];
                foreach ($answers as $idx => $answer) {
                    if ($answer->is_correct && $correctIndex === null) {
                        $correctIndex = $idx;
                    }
                    $optionStats[$idx] = [
                        'index' => $idx,
                        'text' => (string) $answer->answer_text,
                        'count' => 0,
                        'percentage' => 0,
                        'is_correct' => (bool) $answer->is_correct,
                    ];
                }

                $answeredCount = 0;
                $skippedCount = 0;
                $correctCount = 0;
                $manualScores = [];

                foreach ($results as $result) {
                    $resultAnswers = is_array($result->answers) ? $result->answers : [];
                    $rawValue = $resultAnswers[$questionIdKey] ?? $resultAnswers[(int) $question->id] ?? null;

                    $hasAnswer = !($rawValue === null || $rawValue === '');
                    if (!$hasAnswer) {
                        $skippedCount++;
                    } else {
                        $answeredCount++;
                    }

                    if ($isChoiceType && $hasAnswer) {
                        $selectedIndex = is_numeric($rawValue) ? (int) $rawValue : null;
                        if ($selectedIndex !== null && array_key_exists($selectedIndex, $optionStats)) {
                            $optionStats[$selectedIndex]['count']++;
                        }
                        if ($selectedIndex !== null && $correctIndex !== null && $selectedIndex === (int) $correctIndex) {
                            $correctCount++;
                        }
                    }

                    if (!$isChoiceType) {
                        $manualMap = is_array($result->manual_review_scores) ? $result->manual_review_scores : [];
                        $manualScore = $manualMap[$questionIdKey] ?? $manualMap[(int) $question->id] ?? null;
                        if ($manualScore !== null && is_numeric($manualScore)) {
                            $manualScores[] = (float) $manualScore;
                        }
                    }
                }

                $attemptBase = max(1, $attemptsCount);
                foreach ($optionStats as &$stat) {
                    $stat['percentage'] = round(($stat['count'] / $attemptBase) * 100, 2);
                }
                unset($stat);

                return [
                    'question_id' => $question->id,
                    'question_text' => $question->question_text,
                    'question_type' => $questionType,
                    'points' => (int) ($question->points ?? 1),
                    'attempts' => $attemptsCount,
                    'answered_count' => $answeredCount,
                    'skipped_count' => $skippedCount,
                    'correct_count' => $isChoiceType ? $correctCount : null,
                    'correct_rate' => $isChoiceType
                        ? round(($correctCount / $attemptBase) * 100, 2)
                        : null,
                    'correct_option_index' => $correctIndex,
                    'option_stats' => array_values($optionStats),
                    'manual_avg_score' => count($manualScores) > 0 ? round(array_sum($manualScores) / count($manualScores), 2) : null,
                    'manual_reviews_count' => count($manualScores),
                ];
            });

        return response()->json($rows->values());
    }

    /**
     * Validate and normalize question payload for matching/ordering types.
     */
    protected function validateQuestionPayload(?string $questionType, $payload): ?array
    {
        if (!is_array($payload)) {
            return $questionType === 'matching' ? ['pairs' => []] : ($questionType === 'ordering' ? ['items' => []] : null);
        }
        if ($questionType === 'matching') {
            $pairs = $payload['pairs'] ?? [];
            if (!is_array($pairs)) {
                return ['pairs' => []];
            }
            return [
                'pairs' => array_values(array_map(function ($p) {
                    return [
                        'left' => is_array($p) ? ($p['left'] ?? '') : '',
                        'right' => is_array($p) ? ($p['right'] ?? '') : '',
                    ];
                }, $pairs)),
            ];
        }
        if ($questionType === 'ordering') {
            $items = $payload['items'] ?? [];
            return ['items' => is_array($items) ? array_values($items) : []];
        }
        return $payload;
    }

    protected function buildPreviewMatchingData(ExamQuestion $question): array
    {
        $payload = is_array($question->payload) ? $question->payload : [];
        $pairs = is_array($payload['pairs'] ?? null) ? array_values($payload['pairs']) : [];
        $leftItems = [];
        $rightItems = [];

        foreach ($pairs as $index => $pair) {
            if (! is_array($pair)) {
                continue;
            }

            $left = trim((string) ($pair['left'] ?? $pair['text'] ?? $pair['question'] ?? ''));
            $right = trim((string) ($pair['right'] ?? $pair['answer_text'] ?? $pair['answer'] ?? $pair['content'] ?? ''));
            if ($left === '' || $right === '') {
                continue;
            }

            $leftItems[] = ['id' => (string) $index, 'text' => $left];
            $rightItems[] = ['id' => (string) $index, 'text' => $right];
        }

        return [
            'leftItems' => $leftItems,
            'rightItems' => $rightItems,
            'correctMap' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $rightItems)),
        ];
    }

    protected function buildPreviewOrderingData(ExamQuestion $question): array
    {
        $payload = is_array($question->payload) ? $question->payload : [];
        $items = is_array($payload['items'] ?? null) ? array_values($payload['items']) : [];
        $normalized = [];

        foreach ($items as $index => $item) {
            $text = is_array($item)
                ? trim((string) ($item['text'] ?? $item['label'] ?? $item['content'] ?? ''))
                : trim((string) $item);
            if ($text === '') {
                continue;
            }
            $normalized[] = ['id' => (string) $index, 'text' => $text];
        }

        return [
            'items' => $normalized,
            'correctOrder' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $normalized)),
        ];
    }

    public function getPendingReviews(Request $request)
    {
        $query = ExamResult::with([
                'exam.course',
                'exam.questions' => fn ($q) => $q->orderBy('order'),
                'exam.questions.answers' => fn ($q) => $q->orderBy('order'),
                'user:id,name,email',
            ])
            ->where('needs_manual_review', true)
            ->whereNull('reviewed_at');
        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            $query->whereHas('exam', function ($q) use ($uid) {
                $q->where(function ($q2) use ($uid) {
                    $q2->whereHas('course', fn ($c) => $c->where('teacher_id', $uid));
                    if (Schema::hasColumn('exams', 'created_by')) {
                        $q2->orWhere(function ($q3) use ($uid) {
                            $q3->whereNull('course_id')->where('created_by', $uid);
                        });
                    }
                });
            });
        }
        $results = $query->orderBy('completed_at', 'desc')->get();

        return response()->json($results);
    }

    /**
     * Clear stale/invalid pending manual reviews.
     */
    public function clearPendingReviews(Request $request)
    {
        $validated = $request->validate([
            'older_than_days' => 'nullable|integer|min:0|max:3650',
        ]);

        $olderThanDays = (int) ($validated['older_than_days'] ?? 30);
        $cutoff = now()->subDays($olderThanDays);
        $manualTypes = [];

        $query = ExamResult::with([
            'exam.questions',
        ])
            ->where('needs_manual_review', true)
            ->whereNull('reviewed_at');

        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            $query->whereHas('exam', function ($q) use ($uid) {
                $q->where(function ($q2) use ($uid) {
                    $q2->whereHas('course', fn ($c) => $c->where('teacher_id', $uid));
                    if (Schema::hasColumn('exams', 'created_by')) {
                        $q2->orWhere(function ($q3) use ($uid) {
                            $q3->whereNull('course_id')->where('created_by', $uid);
                        });
                    }
                });
            });
        }

        $rows = $query->get();
        $toClearIds = [];

        foreach ($rows as $row) {
            $isExpired = $row->completed_at && $row->completed_at->lt($cutoff);
            $questions = $row->exam?->questions ?? collect();
            $hasManualQuestions = $questions->contains(function ($q) use ($manualTypes) {
                return in_array((string) ($q->question_type ?? ''), $manualTypes, true);
            });
            $hasErrorLikeState = !$row->exam || !$hasManualQuestions;

            if ($isExpired || $hasErrorLikeState) {
                $toClearIds[] = $row->id;
            }
        }

        if (empty($toClearIds)) {
            return response()->json([
                'message' => 'Nu au fost găsite lucrări expirate/eronate pentru golire.',
                'cleared_count' => 0,
            ]);
        }

        $meta = [
            '_meta' => [
                'cleanup' => true,
                'reason' => 'auto_clear_pending_reviews',
                'cleaned_at' => now()->toIso8601String(),
                'cleaned_by' => Auth::id(),
            ],
        ];

        ExamResult::whereIn('id', $toClearIds)->update([
            'needs_manual_review' => false,
            'reviewed_at' => now(),
            'reviewed_by' => Auth::id(),
            'manual_review_scores' => $meta,
        ]);

        return response()->json([
            'message' => 'Coada de verificări a fost curățată.',
            'cleared_count' => count($toClearIds),
        ]);
    }

    public function submitManualReview(Request $request, $resultId)
    {
        $validated = $request->validate([
            'manual_review_scores' => 'required|array',
            'manual_review_scores.*.question_id' => 'required|exists:exam_questions,id',
            'manual_review_scores.*.score' => 'required|numeric|min:0',
            'manual_review_scores.*.feedback' => 'nullable|string|max:2000',
            'overall_feedback' => 'nullable|string|max:4000',
        ]);

        $result = ExamResult::with('exam.course', 'exam.questions')->findOrFail($resultId);
        $this->assertExamAccessibleByInstructor($result->exam);
        if ($result->reviewed_at) {
            return response()->json([
                'error' => 'Acest rezultat a fost deja verificat.',
            ], 422);
        }

        // Calculate new total score
        $autoScore = (float) $result->score; // Score from multiple choice questions
        $manualScore = 0;
        $manualScores = [];

        foreach ($validated['manual_review_scores'] as $reviewScore) {
            $question = $result->exam->questions->find($reviewScore['question_id']);
            if ($question && $question->requiresManualGrading()) {
                $maxPoints = (float) ($question->points ?? 1);
                $givenScore = min(max(0, (float) $reviewScore['score']), $maxPoints); // Don't exceed max points
                $manualScore += $givenScore;
                $manualScores[$reviewScore['question_id']] = [
                    'score' => $givenScore,
                    'feedback' => $reviewScore['feedback'] ?? null,
                ];
            }
        }

        if (!empty($validated['overall_feedback'])) {
            $manualScores['_meta'] = [
                'overall_feedback' => $validated['overall_feedback'],
            ];
        }

        $newTotalScore = $autoScore + $manualScore;
        $newPercentage = $result->total_points > 0 ? round(($newTotalScore / $result->total_points) * 100, 2) : 0;
        $passingScore = (int) ($result->exam->passing_score ?? 70);
        $newPassed = $newPercentage >= $passingScore;

        $result->update([
            'score' => $newTotalScore,
            'percentage' => $newPercentage,
            'passed' => $newPassed,
            'needs_manual_review' => false,
            'manual_review_scores' => $manualScores,
            'reviewed_at' => now(),
            'reviewed_by' => Auth::id(),
        ]);

        // Invalidate cache for user profile and dashboard
        $userId = $result->user_id;
        \Illuminate\Support\Facades\Cache::forget("profile_user_{$userId}");
        \Illuminate\Support\Facades\Cache::forget("dashboard_user_{$userId}_stats");

        return response()->json([
            'message' => 'Verificare manuală salvată cu succes',
            'result' => $result->load(['exam.course', 'user:id,name,email']),
        ]);
    }
}
