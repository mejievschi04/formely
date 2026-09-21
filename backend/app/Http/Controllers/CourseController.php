<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\ActivityLog;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\User;
use App\Support\CourseCatalog;
use App\Support\CourseViews;
use App\Support\LearningVisibility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CourseController extends Controller
{
    public function index(Request $request)
    {
        try {
            $query = Course::with([
                'modules' => function($query) {
                    $query->select('id', 'course_id', 'title', 'order');
                },
                'teacher' => function($query) {
                    $query->select('id', 'name');
                }
            ]);

            // For non-admin users (students), only show published courses
            $user = $request->user();
            $isAdmin = LearningVisibility::isStaff($user);
            if (!$isAdmin && \Illuminate\Support\Facades\Schema::hasColumn('courses', 'status')) {
                $query->where('status', 'published');
            }

            $courses = $query->get()
                ->map(function($course) {
                    try {
                        return [
                            'id' => $course->id,
                            'title' => $course->title ?? '',
                            'description' => $course->description ?? null,
                            'image' => $course->image ?? null,
                            'image_url' => $course->image_url ?? null,
                            'reward_points' => $course->reward_points ?? 0,
                            'status' => $course->status ?? 'draft',
                            'modules_count' => $course->modules ? $course->modules->count() : 0,
                            'modules' => $course->modules ? $course->modules->map(function($module) {
                                return [
                                    'id' => $module->id ?? null,
                                    'title' => $module->title ?? '',
                                    'order' => $module->order ?? 0,
                                ];
                            })->toArray() : [],
                            'teacher' => $course->teacher ? [
                                'id' => $course->teacher->id ?? null,
                                'name' => $course->teacher->name ?? '',
                            ] : null,
                        ];
                    } catch (\Exception $e) {
                        \Log::error('Error mapping course in CourseController::index', [
                            'course_id' => $course->id ?? null,
                            'error' => $e->getMessage(),
                            'trace' => $e->getTraceAsString(),
                        ]);
                        // Return minimal course data if mapping fails
                        return [
                            'id' => $course->id ?? null,
                            'title' => $course->title ?? 'Unknown Course',
                            'description' => null,
                            'image' => null,
                            'image_url' => null,
                            'reward_points' => 0,
                            'status' => $course->status ?? 'draft',
                            'modules_count' => 0,
                            'modules' => [],
                            'teacher' => null,
                        ];
                    }
                });
            
            return response()->json($courses);
        } catch (\Exception $e) {
            \Log::error('Error in CourseController::index', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'error' => 'Nu s-au putut încărca cursurile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(Request $request, $id)
    {
        try {
            $isStaff = LearningVisibility::isStaffRequest($request);
            $courseQuery = Course::query();
            LearningVisibility::applyPublishedCourseFilter($courseQuery, $isStaff);

            // For single course, include full content with modules, lessons, and tests
            // Note: exams relationship doesn't exist on Module, use courseTests instead
            $course = $courseQuery->with([
                'lessons' => function ($q) use ($isStaff) {
                    $q->whereNull('module_id');
                    LearningVisibility::publishedLessonScope($q, $isStaff);
                },
                'modules' => function ($q) use ($isStaff) {
                    LearningVisibility::publishedModuleScope($q, $isStaff);
                },
                'modules.lessons' => function ($q) use ($isStaff) {
                    LearningVisibility::publishedLessonScope($q, $isStaff);
                },
                'modules.courseTests' => function ($q) use ($id) {
                    $q->where('course_id', $id)->orderBy('order');
                },
                'modules.courseTests.test' => function($q) {
                    $q->select('id', 'title', 'description', 'type', 'status');
                },
                'teacher' => function($q) {
                    $q->select('id', 'name');
                }
            ])->findOrFail($id);

            CourseViews::recordView($course, $isStaff);

            $user = $request->user();
            // Draft tests only when staff explicitly asks (builder/admin tools), not on learner course pages.
            $showDraftLinkedTests = $isStaff && $request->boolean('include_draft_tests');

            // Teste la nivel de lecție (course_test scope=lesson) — structura studentului
            $lessonScopeRows = CourseTest::where('course_id', $course->id)
                ->where('scope', 'lesson')
                ->with(['test' => function ($q) {
                    $q->select('id', 'title', 'description', 'type', 'status');
                }])
                ->orderBy('order')
                ->get()
                ->groupBy('scope_id');

            foreach ($course->modules as $module) {
                foreach ($module->lessons as $lesson) {
                    $rows = $lessonScopeRows->get($lesson->id, collect());
                    $lesson->setAttribute('course_tests', $rows->map(function ($courseTest) use ($course, $showDraftLinkedTests) {
                        if (!$courseTest->test) {
                            return null;
                        }
                        if (!$showDraftLinkedTests && $courseTest->test->status !== 'published') {
                            return null;
                        }

                        return [
                            'id' => $courseTest->id,
                            'test_id' => $courseTest->test_id,
                            'required' => (bool) ($courseTest->required ?? false),
                            'passing_score' => $courseTest->passing_score ?? 70,
                            'order' => $courseTest->order ?? 0,
                            'test' => [
                                'id' => $courseTest->test->id,
                                'title' => $courseTest->test->title,
                                'description' => $courseTest->test->description,
                                'type' => $courseTest->test->type,
                                'status' => $courseTest->test->status,
                            ],
                        ];
                    })->filter()->values()->all());
                }
            }

            foreach ($course->lessons as $lesson) {
                $rows = $lessonScopeRows->get($lesson->id, collect());
                $lesson->setAttribute('course_tests', $rows->map(function ($courseTest) use ($course, $showDraftLinkedTests) {
                    if (!$courseTest->test) {
                        return null;
                    }
                    if (!$showDraftLinkedTests && $courseTest->test->status !== 'published') {
                        return null;
                    }

                    return [
                        'id' => $courseTest->id,
                        'test_id' => $courseTest->test_id,
                        'required' => (bool) ($courseTest->required ?? false),
                        'passing_score' => $courseTest->passing_score ?? 70,
                        'order' => $courseTest->order ?? 0,
                        'test' => [
                            'id' => $courseTest->test->id,
                            'title' => $courseTest->test->title,
                            'description' => $courseTest->test->description,
                            'type' => $courseTest->test->type,
                            'status' => $courseTest->test->status,
                        ],
                    ];
                })->filter()->values()->all());
            }
            
            // Transform courseTests to exams format for frontend compatibility (doar Test / course_test)
            foreach ($course->modules as $module) {
                $moduleExams = $module->courseTests->map(function ($courseTest) use ($course, $showDraftLinkedTests) {
                    if ($courseTest->test && ($showDraftLinkedTests || $courseTest->test->status === 'published')) {
                        return [
                            'id' => $courseTest->test->id,
                            'title' => $courseTest->test->title,
                            'description' => $courseTest->test->description,
                            'type' => $courseTest->test->type,
                            'status' => $courseTest->test->status,
                            'module_id' => $courseTest->scope_id,
                            'course_id' => $course->id,
                            'required' => $courseTest->required ?? false,
                            'passing_score' => $courseTest->passing_score ?? null,
                            'order' => $courseTest->order ?? 0,
                        ];
                    }

                    return null;
                })->filter()->values()->toArray();

                $module->exams = $moduleExams;
            }
            
            // Collect all exams from all modules for course.exams
            $allExams = [];
            foreach ($course->modules as $module) {
                if (isset($module->exams) && is_array($module->exams)) {
                    $allExams = array_merge($allExams, $module->exams);
                }
            }
            
            // Also get course-level tests
            try {
                $courseLevelTests = CourseTest::where('course_id', $course->id)
                    ->where('scope', 'course')
                    ->with('test')
                    ->get();
                
                foreach ($courseLevelTests as $courseTest) {
                    if ($courseTest->test && ($showDraftLinkedTests || $courseTest->test->status === 'published')) {
                        $allExams[] = [
                            'id' => $courseTest->test->id,
                            'title' => $courseTest->test->title,
                            'description' => $courseTest->test->description,
                            'type' => $courseTest->test->type,
                            'status' => $courseTest->test->status,
                            'module_id' => null,
                            'course_id' => $course->id,
                            'required' => $courseTest->required ?? false,
                            'passing_score' => $courseTest->passing_score ?? null,
                            'order' => $courseTest->order ?? 0,
                        ];
                    }
                }
            } catch (\Exception $e) {
                \Log::warning('Error loading course-level tests', [
                    'course_id' => $course->id,
                    'error' => $e->getMessage(),
                ]);
            }

            // Doar teste (course_test) în structura cursului — examenele (model Exam) sunt în tab-ul Examene, nu în curs.
            $course->exams = $allExams;

            $courseLevelCourseTests = CourseTest::where('course_id', $course->id)
                ->where('scope', 'course')
                ->with(['test' => function ($q) {
                    $q->select('id', 'title', 'description', 'type', 'status');
                }])
                ->orderBy('order')
                ->get()
                ->map(function ($courseTest) use ($showDraftLinkedTests) {
                    if (! $courseTest->test) {
                        return null;
                    }
                    if (! $showDraftLinkedTests && $courseTest->test->status !== 'published') {
                        return null;
                    }

                    return [
                        'id' => $courseTest->id,
                        'test_id' => $courseTest->test_id,
                        'required' => (bool) ($courseTest->required ?? false),
                        'passing_score' => $courseTest->passing_score ?? 70,
                        'order' => $courseTest->order ?? 0,
                        'test' => [
                            'id' => $courseTest->test->id,
                            'title' => $courseTest->test->title,
                            'description' => $courseTest->test->description,
                            'type' => $courseTest->test->type,
                            'status' => $courseTest->test->status,
                        ],
                    ];
                })
                ->filter()
                ->values()
                ->all();

            $course->setAttribute('course_tests', $courseLevelCourseTests);

            // Add user progress if user is authenticated
            if ($user) {
                try {
                    $courseUser = DB::table('course_user')
                        ->where('course_id', $course->id)
                        ->where('user_id', $user->id)
                        ->first();
                    
                    $course->progress_percentage = $courseUser ? ($courseUser->progress_percentage ?? 0) : 0;
                    $course->completed_at = $courseUser ? $courseUser->completed_at : null;
                    $course->started_at = $courseUser ? $courseUser->started_at : null;
                    $course->is_assigned = $courseUser !== null;
                } catch (\Exception $e) {
                    \Log::warning('Error loading user progress for course', [
                        'course_id' => $course->id,
                        'user_id' => $user->id,
                        'error' => $e->getMessage(),
                    ]);
                    // Set defaults if progress loading fails
                    $course->progress_percentage = 0;
                    $course->completed_at = null;
                    $course->started_at = null;
                    $course->is_assigned = false;
                }
            }
            
            return response()->json($course);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            throw $e;
        } catch (\Exception $e) {
            \Log::error('Error in CourseController::show', [
                'course_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Nu s-a putut încărca cursul',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Examene create în admin (model Exam) — elevii le văd în curs, nu doar Test/course_test.
     *
     * @param  array<int, array<string, mixed>>  $allExams
     */
    protected function appendLegacyExamsForLearners(
        Course $course,
        array &$allExams,
        bool $showDraftLinkedTests,
        ?User $user,
        bool $isStaff
    ): void {
        $legacyQuery = Exam::query()->where('course_id', $course->id);
        if (! $showDraftLinkedTests) {
            $legacyQuery->where('status', 'published');
        }

        $existingIds = array_map('intval', array_column($allExams, 'id'));

        foreach ($legacyQuery->orderBy('id')->get() as $legacyExam) {
            if ($user && ! $isStaff && ! $legacyExam->isVisibleToLearner($user)) {
                continue;
            }

            if (in_array((int) $legacyExam->id, $existingIds, true)) {
                continue;
            }

            $entry = [
                'id' => $legacyExam->id,
                'title' => $legacyExam->title,
                'description' => $legacyExam->description,
                'type' => 'final',
                'status' => $legacyExam->status ?? 'draft',
                'module_id' => $legacyExam->module_id,
                'course_id' => $course->id,
                'required' => (bool) ($legacyExam->is_required ?? false),
                'passing_score' => $legacyExam->passing_score,
                'order' => 1000 + (int) $legacyExam->id,
                'legacy_exam' => true,
            ];

            if ($legacyExam->module_id) {
                foreach ($course->modules as $module) {
                    if ((int) $module->id !== (int) $legacyExam->module_id) {
                        continue;
                    }
                    $moduleExams = is_array($module->exams ?? null) ? $module->exams : [];
                    $moduleExams[] = $entry;
                    $module->exams = $moduleExams;
                    break;
                }
            }

            $allExams[] = $entry;
            $existingIds[] = (int) $legacyExam->id;
        }
    }

    /**
     * Cursuri publicate vizibile în catalog fără mapă (opțiune la publicare).
     */
    public function learnerStandaloneCourses(Request $request)
    {
        try {
            $user = $request->user();
            $courses = CourseCatalog::standalonePublishedQuery()
                ->with([
                    'teacher:id,name',
                    'modules:id,course_id,estimated_duration_minutes',
                ])
                ->orderBy('title')
                ->get();

            $courseIds = $courses->pluck('id')->all();
            $progress = $this->progressByCourseIds($user, $courseIds);

            $payload = $courses->map(function ($course) use ($progress) {
                $p = $progress[$course->id] ?? ['progress_percentage' => 0, 'completed_at' => null];
                $durationMinutes = 0;
                foreach ($course->modules ?? [] as $module) {
                    $durationMinutes += (int) ($module->estimated_duration_minutes ?? 0);
                }

                return [
                    'id' => $course->id,
                    'title' => $course->title,
                    'short_description' => $course->short_description,
                    'description' => $course->description,
                    'image_url' => $course->image_url ?? $course->image,
                    'estimated_duration_minutes' => $durationMinutes,
                    'views_count' => CourseViews::countForCourse($course),
                    'progress_percentage' => $p['progress_percentage'],
                    'completed_at' => $p['completed_at'],
                    'teacher' => $course->teacher ? ['id' => $course->teacher->id, 'name' => $course->teacher->name] : null,
                ];
            })->values();

            return response()->json(['data' => $payload]);
        } catch (\Exception $e) {
            \Log::error('Error in CourseController::learnerStandaloneCourses', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Nu s-au putut încărca cursurile',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * @param  array<int>  $courseIds
     * @return array<int, array{progress_percentage: int, completed_at: mixed}>
     */
    private function progressByCourseIds($user, array $courseIds): array
    {
        $progress = [];
        if (! $user || $courseIds === []) {
            return $progress;
        }

        $rows = DB::table('course_user')
            ->where('user_id', $user->id)
            ->whereIn('course_id', $courseIds)
            ->select('course_id', 'progress_percentage', 'completed_at')
            ->get();

        foreach ($rows as $row) {
            $progress[$row->course_id] = [
                'progress_percentage' => (int) $row->progress_percentage,
                'completed_at' => $row->completed_at,
            ];
        }

        return $progress;
    }

    /**
     * @deprecated Use POST /api/courses/{courseId}/finish (auth required).
     */
    public function complete(Request $request, $courseId)
    {
        return app(\App\Http\Controllers\Api\CourseProgressController::class)
            ->finishCourse($courseId);
    }
}


