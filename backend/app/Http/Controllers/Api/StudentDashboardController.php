<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Exam;
use App\Models\CourseTest;
use App\Services\CourseProgressService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class StudentDashboardController extends Controller
{
    protected $progressService;

    public function __construct(CourseProgressService $progressService)
    {
        $this->progressService = $progressService;
    }

    /**
     * Get comprehensive student dashboard data
     */
    public function index()
    {
        $user = Auth::user();

        // Get enrolled courses
        $enrolledCourses = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('enrolled', true)
            ->pluck('course_id');

        $courses = Course::with(['teacher', 'modules' => function($q) {
            $q->where('status', 'published')->orderBy('order');
        }])
        ->whereIn('id', $enrolledCourses)
        ->where('status', 'published')
        ->get();

        // Calculate global progress
        $globalProgress = $this->calculateGlobalProgress($user, $courses);

        // Get active courses (in progress, not completed)
        $activeCourses = $this->getActiveCourses($user, $courses);

        // Get next recommended lesson
        $nextLesson = $this->getNextRecommendedLesson($user, $courses);

        // Calculate test completion percentage (average score on tests)
        $testCompletionPercentage = $this->calculateTestCompletionPercentage($user);

        // Get incomplete lessons
        $incompleteLessons = $this->getIncompleteLessons($user, $courses);

        // Get pending exams
        $pendingExams = $this->getPendingExams($user, $courses);

        // Notifications: stored (e.g. course_published) + computed (exam reminders, next lesson)
        $stored = \App\Models\Notification::where('user_id', $user->id)
            ->whereNull('read_at')
            ->orderByDesc('created_at')
            ->take(10)
            ->get()
            ->map(fn ($n) => [
                'id' => 'stored_' . $n->id,
                'title' => $n->title,
                'message' => $n->description,
                'severity' => $n->severity ?? 'info',
                'type' => $n->type,
                'created_at' => $n->created_at?->toIso8601String(),
                'link' => $n->action_url,
            ])
            ->all();
        $computed = $this->getStudentNotifications($user, $nextLesson, $pendingExams, $incompleteLessons);
        $notifications = array_merge($stored, $computed);
        usort($notifications, fn ($a, $b) => strtotime($b['created_at'] ?? 0) - strtotime($a['created_at'] ?? 0));

        return response()->json([
            'global_progress' => $globalProgress,
            'active_courses' => $activeCourses,
            'next_lesson' => $nextLesson,
            'test_completion_percentage' => $testCompletionPercentage,
            'incomplete_lessons' => $incompleteLessons,
            'pending_exams' => $pendingExams,
            'notifications' => $notifications,
            'stats' => [
                'total_courses' => $courses->count(),
                'active_courses_count' => count($activeCourses),
                'completed_courses_count' => $courses->filter(function($course) use ($user) {
                    $progress = $this->progressService->calculateCourseProgress($user, $course);
                    return $progress >= 100;
                })->count(),
                'total_lessons_completed' => DB::table('lesson_progress')
                    ->where('user_id', $user->id)
                    ->where('completed', true)
                    ->count(),
                'total_exams_passed' => $this->getTotalExamsPassed($user),
            ],
        ]);
    }

    /**
     * Calculate global progress across all courses
     */
    private function calculateGlobalProgress($user, $courses)
    {
        if ($courses->isEmpty()) {
            return [
                'percentage' => 0,
                'completed_courses' => 0,
                'total_courses' => 0,
                'completed_lessons' => 0,
                'total_lessons' => 0,
            ];
        }

        $totalLessons = 0;
        $completedLessons = 0;
        $completedCourses = 0;

        foreach ($courses as $course) {
            $courseProgress = $this->progressService->calculateCourseProgress($user, $course);
            
            // Count lessons
            $modules = $course->modules;
            foreach ($modules as $module) {
                $moduleLessons = $module->lessons()->where('status', 'published')->get();
                $totalLessons += $moduleLessons->count();

                foreach ($moduleLessons as $lesson) {
                    $isCompleted = Schema::hasTable('lesson_progress')
                        ? DB::table('lesson_progress')
                            ->where('user_id', $user->id)
                            ->where('lesson_id', $lesson->id)
                            ->where('completed', true)
                            ->exists()
                        : false;

                    if ($isCompleted) {
                        $completedLessons++;
                    }
                }
            }

            if ($courseProgress >= 100) {
                $completedCourses++;
            }
        }

        $percentage = $totalLessons > 0 
            ? round(($completedLessons / $totalLessons) * 100, 1)
            : 0;

        return [
            'percentage' => $percentage,
            'completed_courses' => $completedCourses,
            'total_courses' => $courses->count(),
            'completed_lessons' => $completedLessons,
            'total_lessons' => $totalLessons,
        ];
    }

    /**
     * Get active courses (in progress, not completed)
     */
    private function getActiveCourses($user, $courses)
    {
        $activeCourses = [];

        foreach ($courses as $course) {
            $progress = $this->progressService->calculateCourseProgress($user, $course);
            
            if ($progress > 0 && $progress < 100) {
                $accessStatus = $this->progressService->getUserAccessStatus($user, $course);
                
                // Find next module to complete
                $nextModule = null;
                foreach ($accessStatus['modules'] as $module) {
                    if (!$module['unlocked'] || $module['progress'] < 100) {
                        $nextModule = $module;
                        break;
                    }
                }

                $moduleModel = $nextModule ? Module::find($nextModule['id']) : null;
                
                $activeCourses[] = [
                    'id' => $course->id,
                    'title' => $course->title,
                    'thumbnail' => $course->image_url ?? null,
                    'teacher' => $course->teacher ? $course->teacher->name : null,
                    'progress' => $progress,
                    'next_module' => $moduleModel ? [
                        'id' => $moduleModel->id,
                        'title' => $moduleModel->title,
                    ] : null,
                    'last_accessed_at' => DB::table('course_user')
                        ->where('user_id', $user->id)
                        ->where('course_id', $course->id)
                        ->value('updated_at'),
                ];
            }
        }

        // Sort by last accessed (most recent first)
        usort($activeCourses, function($a, $b) {
            $timeA = $a['last_accessed_at'] ? strtotime($a['last_accessed_at']) : 0;
            $timeB = $b['last_accessed_at'] ? strtotime($b['last_accessed_at']) : 0;
            return $timeB - $timeA;
        });

        return array_slice($activeCourses, 0, 6); // Return top 6
    }

    /**
     * Get next recommended lesson (resume functionality)
     */
    private function getNextRecommendedLesson($user, $courses)
    {
        // Use progress service to get next incomplete lesson
        foreach ($courses as $course) {
            $nextLesson = $this->progressService->getNextIncompleteLesson($user, $course);
            
            if ($nextLesson) {
                return [
                    'id' => $nextLesson->id,
                    'title' => $nextLesson->title,
                    'course_id' => $course->id,
                    'course_title' => $course->title,
                    'module_id' => $nextLesson->module_id,
                    'module_title' => $nextLesson->module ? $nextLesson->module->title : null,
                    'type' => $nextLesson->type,
                    'duration_minutes' => $nextLesson->duration_minutes,
                    'is_preview' => $nextLesson->is_preview ?? false,
                ];
            }
        }

        return null;
    }

    /**
     * Calculate test completion percentage (average score on tests for this student)
     */
    private function calculateTestCompletionPercentage($user)
    {
        $percentages = $this->getUnifiedResultRows($user->id)
            ->pluck('percentage')
            ->filter(fn ($percentage) => $percentage !== null);
        if ($percentages->isEmpty()) {
            return [
                'value' => 0,
                'formatted' => '0%',
            ];
        }

        $value = round((float) $percentages->avg(), 1);

        return [
            'value' => $value,
            'formatted' => $value . '%',
        ];
    }

    /**
     * Get incomplete lessons
     */
    private function getIncompleteLessons($user, $courses)
    {
        $incompleteLessons = [];

        foreach ($courses as $course) {
            $accessStatus = $this->progressService->getUserAccessStatus($user, $course);
            
            foreach ($accessStatus['modules'] as $module) {
                if (!$module['unlocked']) {
                    continue;
                }

                foreach ($module['lessons'] as $lesson) {
                    if ($lesson['unlocked'] && !$lesson['completed']) {
                        $lessonModel = Lesson::find($lesson['id']);
                        if ($lessonModel) {
                            $incompleteLessons[] = [
                                'id' => $lessonModel->id,
                                'title' => $lessonModel->title,
                                'course_id' => $course->id,
                                'course_title' => $course->title,
                                'module_id' => $module['id'],
                                'module_title' => Module::find($module['id'])->title ?? null,
                                'type' => $lessonModel->type,
                                'duration_minutes' => $lessonModel->duration_minutes,
                            ];
                        }
                    }
                }
            }
        }

        return array_slice($incompleteLessons, 0, 10); // Return top 10
    }

    /**
     * Get pending exams
     */
    private function getPendingExams($user, $courses)
    {
        $pendingExams = [];

        foreach ($courses as $course) {
            $modules = $course->modules()->where('status', 'published')->get();
            
            foreach ($modules as $module) {
                // Get tests linked to this module via CourseTest
                $module->load(['courseTests' => function($q) {
                    $q->where('scope', 'module');
                }, 'courseTests.test' => function($q) {
                    $q->where('status', 'published');
                }]);
                
                // Also get course-level tests
                $courseTests = \App\Models\CourseTest::where('course_id', $course->id)
                    ->where('scope', 'course')
                    ->with(['test' => function($q) {
                        $q->where('status', 'published');
                    }])
                    ->get();
                
                // Process module-level tests
                foreach ($module->courseTests as $courseTest) {
                    if (!$courseTest->test || $courseTest->test->status !== 'published') {
                        continue;
                    }
                    
                    $test = $courseTest->test;
                    
                    // Check if test is unlocked
                    try {
                        $isUnlocked = $this->progressService->isTestUnlocked($user, $test, $course);
                    } catch (\Exception $e) {
                        Log::warning('Error checking if test is unlocked', [
                            'test_id' => $test->id,
                            'user_id' => $user->id,
                            'error' => $e->getMessage(),
                        ]);
                        // For now, assume unlocked if test exists
                        $isUnlocked = true;
                    }
                    
                    if ($isUnlocked) {
                        // Check if test has been passed
                        $hasPassed = $this->hasPassingTestResult($user->id, $test->id, (int) ($courseTest->passing_score ?? 70));

                        if (!$hasPassed) {
                            $pendingExams[] = [
                                'id' => $test->id,
                                'title' => $test->title,
                                'course_id' => $course->id,
                                'course_title' => $course->title,
                                'module_id' => $module->id,
                                'module_title' => $module->title,
                                'passing_score' => $courseTest->passing_score ?? 70,
                                'is_required' => $courseTest->required ?? false,
                            ];
                        }
                    }
                }
                
                // Process course-level tests
                foreach ($courseTests as $courseTest) {
                    if (!$courseTest->test || $courseTest->test->status !== 'published') {
                        continue;
                    }
                    
                    $test = $courseTest->test;
                    
                    // For course-level tests
                    try {
                        $isUnlocked = $this->progressService->isTestUnlocked($user, $test, $course);
                    } catch (\Exception $e) {
                        Log::warning('Error checking if course test is unlocked', [
                            'test_id' => $test->id,
                            'user_id' => $user->id,
                            'error' => $e->getMessage(),
                        ]);
                        $isUnlocked = true;
                    }
                    
                    if ($isUnlocked) {
                        // Check if test has been passed
                        $hasPassed = $this->hasPassingTestResult($user->id, $test->id, (int) ($courseTest->passing_score ?? 70));

                        if (!$hasPassed) {
                            $pendingExams[] = [
                                'id' => $test->id,
                                'title' => $test->title,
                                'course_id' => $course->id,
                                'course_title' => $course->title,
                                'module_id' => null,
                                'module_title' => null,
                                'passing_score' => $courseTest->passing_score ?? 70,
                                'is_required' => $courseTest->required ?? false,
                            ];
                        }
                    }
                }
            }
        }

        return array_slice($pendingExams, 0, 10); // Return top 10
    }


    /**
     * Get notifications for student (exam reminders, next lesson, etc.)
     */
    private function getStudentNotifications($user, $nextLesson, $pendingExams, $incompleteLessons)
    {
        $notifications = [];
        $now = Carbon::now();

        // Next lesson recommendation
        if ($nextLesson) {
            $notifications[] = [
                'id' => 'next-lesson-' . ($nextLesson['id'] ?? uniqid()),
                'title' => 'Lecție recomandată: ' . ($nextLesson['title'] ?? 'Continuă învățarea'),
                'message' => $nextLesson['course_title'] ?? null,
                'severity' => 'info',
                'type' => 'next_lesson',
                'created_at' => $now->toIso8601String(),
                'link' => '/courses/' . ($nextLesson['course_id'] ?? '') . '/lessons/' . ($nextLesson['id'] ?? ''),
            ];
        }

        // Pending exams (first 3)
        foreach (array_slice($pendingExams, 0, 3) as $i => $exam) {
            $notifications[] = [
                'id' => 'pending-exam-' . ($exam['id'] ?? $i),
                'title' => 'Test de dat: ' . ($exam['title'] ?? 'Test'),
                'message' => $exam['course_title'] ?? null,
                'severity' => 'warning',
                'type' => 'pending_exam',
                'created_at' => $now->toIso8601String(),
                'link' => '/courses/' . ($exam['course_id'] ?? ''),
            ];
        }

        return $notifications;
    }

    /**
     * Get total exams passed
     */
    private function getTotalExamsPassed($user)
    {
        return $this->getUnifiedResultRows($user->id)
            ->filter(function (array $row) {
                return (bool) ($row['passed'] ?? false);
            })
            ->count();
    }

    /**
     * Get unified test/exam result rows for a user from both tables.
     */
    private function getUnifiedResultRows(int $userId, ?int $testId = null)
    {
        $results = collect();

        foreach ($this->getResultTableDefinitions() as $definition) {
            $table = $definition['table'];
            $idColumn = $definition['id_column'];

            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'percentage') || !Schema::hasColumn($table, $idColumn)) {
                continue;
            }

            $query = DB::table($table)
                ->where($table . '.user_id', $userId)
                ->whereNotNull($table . '.percentage')
                ->select([
                    $table . '.id as result_id',
                    $table . '.user_id',
                    $table . '.' . $idColumn . ' as test_id',
                    $table . '.percentage',
                    $table . '.passed',
                    $table . '.score',
                    $table . '.completed_at',
                    $table . '.created_at',
                ]);

            if ($testId !== null) {
                $query->where($table . '.' . $idColumn, $testId);
            }

            if (Schema::hasColumn($table, 'attempt_number')) {
                $query->addSelect($table . '.attempt_number');
            } else {
                $query->addSelect(DB::raw('NULL as attempt_number'));
            }

            foreach ($query->get() as $row) {
                $completedAt = $row->completed_at ? Carbon::parse($row->completed_at)->toIso8601String() : null;
                $createdAt = $row->created_at ? Carbon::parse($row->created_at)->toIso8601String() : null;
                $dedupeKey = implode('|', [
                    $row->user_id,
                    $row->test_id,
                    $row->attempt_number ?? '',
                    (string) $row->percentage,
                    (string) ($row->passed ? 1 : 0),
                    (string) ($row->score ?? ''),
                    $completedAt ?? '',
                    $createdAt ?? '',
                ]);

                $results->push([
                    'result_id' => $row->result_id,
                    'user_id' => (int) $row->user_id,
                    'test_id' => (int) $row->test_id,
                    'percentage' => $row->percentage !== null ? (float) $row->percentage : null,
                    'passed' => (bool) $row->passed,
                    'score' => $row->score !== null ? (float) $row->score : null,
                    'completed_at' => $completedAt,
                    'created_at' => $createdAt,
                    'attempt_number' => $row->attempt_number !== null ? (int) $row->attempt_number : null,
                    'dedupe_key' => $dedupeKey,
                ]);
            }
        }

        return $results
            ->unique('dedupe_key')
            ->values();
    }

    /**
     * Check if the student has a passing result for a given test in either results table.
     */
    private function hasPassingTestResult(int $userId, int $testId, int $passingScore): bool
    {
        return $this->getUnifiedResultRows($userId, $testId)
            ->contains(function (array $row) use ($passingScore) {
                return (bool) ($row['passed'] ?? false) || ((float) ($row['percentage'] ?? 0) >= $passingScore);
            });
    }

    /**
     * Result table definitions used across dashboard metrics.
     */
    private function getResultTableDefinitions(): array
    {
        return [
            ['table' => 'test_results', 'id_column' => 'test_id'],
            ['table' => 'exam_results', 'id_column' => 'exam_id'],
        ];
    }
}
