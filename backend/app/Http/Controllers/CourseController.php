<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseTest;
use App\Support\CourseCatalog;
use App\Support\CourseViews;
use App\Support\LearningVisibility;
use App\Services\PublishedCourseView;
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

            // For non-admin users (students), only show published courses.
            // Cursanții văd doar cursurile atribuite lor.
            $user = $request->user();
            $isAdmin = LearningVisibility::isStaff($user);
            if (!$isAdmin && \App\Support\SchemaCache::hasColumn('courses', 'status')) {
                $query->where('status', 'published');
            }
            $assignedIds = LearningVisibility::assignedCourseIdsForLearner($user);
            if ($assignedIds !== null) {
                $query->whereIn('id', $assignedIds);
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
                'message' => (config('app.debug') ? $e->getMessage() : null),
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
                'modules.courseTests' => function($q) {
                    $q->orderBy('order');
                },
                'modules.courseTests.test' => function($q) {
                    $q->select('id', 'title', 'description', 'type', 'status');
                },
                'teacher' => function($q) {
                    $q->select('id', 'name');
                }
            ])->findOrFail($id);

            $user = $request->user();
            if (
                $user
                && ($user->role ?? '') === 'student'
                && ! LearningVisibility::isEnrolledInCourse($user, (int) $course->id)
            ) {
                return response()->json([
                    'error' => 'Cursul nu îți este atribuit.',
                ], 403);
            }

            $publishedView = app(PublishedCourseView::class);
            $liveSnapshot = $publishedView->shouldServeSnapshot($course, $request)
                ? $publishedView->latestPublishedSnapshot((int) $course->id)
                : null;
            if ($liveSnapshot) {
                $publishedView->filterCourseLessons($course, $liveSnapshot);
            }
            $liveTestIds = $publishedView->liveTestIds($course, $request);

            CourseViews::recordView($course, $isStaff);

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
                    $lesson->setAttribute('course_tests', $rows->map(function ($courseTest) use ($course, $showDraftLinkedTests, $liveTestIds) {
                        if (!$courseTest->test) {
                            return null;
                        }
                        if ($liveTestIds !== null && ! in_array((int) $courseTest->test_id, $liveTestIds, true)) {
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
                $lesson->setAttribute('course_tests', $rows->map(function ($courseTest) use ($course, $showDraftLinkedTests, $liveTestIds) {
                    if (!$courseTest->test) {
                        return null;
                    }
                    if ($liveTestIds !== null && ! in_array((int) $courseTest->test_id, $liveTestIds, true)) {
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
                $moduleExams = $module->courseTests->map(function ($courseTest) use ($course, $showDraftLinkedTests, $liveTestIds) {
                    if ($liveTestIds !== null && ! in_array((int) $courseTest->test_id, $liveTestIds, true)) {
                        return null;
                    }
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
                    if ($liveTestIds !== null && ! in_array((int) $courseTest->test_id, $liveTestIds, true)) {
                        continue;
                    }
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
            
            // Set course.exams array
            $course->exams = $allExams;

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
            
            $this->redactRestrictedLessonBodies($course, $user);

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
                'message' => (config('app.debug') ? $e->getMessage() : null),
            ], 500);
        }
    }

    /**
     * Cursuri publicate vizibile în catalog fără mapă (opțiune la publicare).
     */
    public function learnerStandaloneCourses(Request $request)
    {
        try {
            $user = $request->user();
            $coursesQuery = CourseCatalog::standalonePublishedQuery();
            $assignedIds = LearningVisibility::assignedCourseIdsForLearner($user);
            if ($assignedIds !== null) {
                $coursesQuery->whereIn('id', $assignedIds);
            }
            $courses = $coursesQuery
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
                'message' => (config('app.debug') ? $e->getMessage() : null),
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

    private function redactRestrictedLessonBodies(Course $course, $user): void
    {
        // Înscrierea e aceeași pentru toate lecțiile cursului: o verificăm o singură dată, nu per lecție.
        $enrolled = LearningVisibility::isEnrolledInCourse($user, (int) $course->id);
        $redact = function ($lesson) use ($user, $course, $enrolled) {
            if (! $lesson || LearningVisibility::learnerMaySeeLessonBody($user, $lesson, $course, $enrolled)) {
                return;
            }
            $lesson->content = null;
            $lesson->video_url = null;
            $lesson->setRelation('contentBlocks', collect());
            $lesson->setAttribute('content_restricted', true);
        };

        if ($course->relationLoaded('lessons')) {
            foreach ($course->lessons as $lesson) {
                $redact($lesson);
            }
        }
        if ($course->relationLoaded('modules')) {
            foreach ($course->modules as $module) {
                if (! $module->relationLoaded('lessons')) {
                    continue;
                }
                foreach ($module->lessons as $lesson) {
                    $redact($lesson);
                }
            }
        }
    }

}


