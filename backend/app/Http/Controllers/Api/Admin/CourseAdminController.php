<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\RecalculateCourseProgressJob;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Models\Team;
use App\Models\Module;
use App\Support\CourseMapBuckets;
use App\Models\ActivityLog;
use App\Services\CourseBuilderService;
use App\Services\UserAssignedCoursesService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;
use Illuminate\Support\Facades\Cache;

class CourseAdminController extends Controller
{
    protected CourseBuilderService $courseBuilderService;

    public function __construct(CourseBuilderService $courseBuilderService)
    {
        $this->courseBuilderService = $courseBuilderService;
    }
    public function index(Request $request)
    {
        try {
            $query = Course::with(['teacher:id,name,email'])
                ->withCount('modules')
                ->withCount(['assignedUsers as enrollments_count' => fn ($q) => $q->where('enrolled', true)]);

        // Search
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhereHas('teacher', function($q) use ($search) {
                      $q->where('name', 'like', "%{$search}%");
                  });
            });
        }

        // Status filter (default to 'published' if status column exists, otherwise show all)
        if ($request->has('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }


        // Instructor: doar cursurile proprii
        if (auth()->user()->isInstructor()) {
            $query->where('teacher_id', auth()->id());
        } elseif ($request->has('instructor') && $request->instructor) {
            $query->where('teacher_id', $request->instructor);
        }

        // Filter by course map (cursuri din această mapă)
        if ($request->has('course_map_id')) {
            $mapId = (int) $request->course_map_id;
            if ($mapId > 0) {
                $query->whereHas('courseMaps', fn ($q) => $q->where('course_maps.id', $mapId));
            }
        }

        // Level filter (if level column exists)
        if ($request->has('level') && $request->level !== 'all') {
            $query->where('level', $request->level);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'updated_at');
        $sortDirection = $request->get('sort_direction', 'desc');

        switch ($sortBy) {
            case 'enrollments':
                $query->orderBy('enrollments_count', $sortDirection);
                break;
            case 'revenue':
                // Fără coloană venituri: sortare stabilă până la modul plăți
                $query->orderBy('updated_at', $sortDirection);
                break;
            case 'completion_rate':
                // Fără agregat progres în listă: sortare stabilă (filtru per curs rămâne în UI)
                $query->orderBy('updated_at', $sortDirection);
                break;
            case 'rating':
                // Fără recenzii în DB: sortare stabilă
                $query->orderBy('updated_at', $sortDirection);
                break;
            case 'list_order':
                $query->orderBy('list_order', strtolower($sortDirection) === 'desc' ? 'desc' : 'asc')
                    ->orderBy('id', 'asc');
                break;
            default:
                $query->orderBy($sortBy, $sortDirection);
                break;
        }

            $perPage = $request->get('per_page', 50);
            $courses = $query->paginate($perPage);

            // Metrici pentru toată pagina dintr-un singur query, nu câte unul per curs.
            $enrollmentCounts = $this->enrollmentCountsFor($courses->getCollection()->pluck('id')->all());
            $courses->getCollection()->transform(function($course) use ($enrollmentCounts) {
                return $this->addCourseMetrics($course, $enrollmentCounts);
            });

            return response()->json($courses);
        } catch (\Exception $e) {
            \Log::error('Error fetching courses', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch courses',
                'message' => (config('app.debug') ? $e->getMessage() : null)
            ], 500);
        }
    }

    /**
     * Salvează ordinea cursurilor în lista admin (drag & drop).
     * Body: { "course_ids": [3, 1, 5, ...] } — ordinea din array = list_order 0, 1, 2, …
     */
    public function reorderList(Request $request)
    {
        if (!SchemaCache::hasColumn('courses', 'list_order')) {
            return response()->json(['message' => 'Coloana list_order lipsește. Rulează migrările.'], 422);
        }

        $validated = $request->validate([
            'course_ids' => 'required|array',
            'course_ids.*' => 'integer|exists:courses,id',
        ]);

        $ids = array_values(array_unique($validated['course_ids']));
        $user = $request->user();

        DB::transaction(function () use ($ids, $user) {
            foreach ($ids as $index => $courseId) {
                $course = Course::query()->find($courseId);
                if (!$course) {
                    continue;
                }
                if ($user->isInstructor() && (int) $course->teacher_id !== (int) $user->id) {
                    abort(403, 'Acces interzis.');
                }
                $course->update(['list_order' => $index]);
            }
        });

        return response()->json(['message' => 'Ordinea cursurilor a fost salvată']);
    }

    /**
     * Normalize marketing_tags from request (array or JSON string from FormData).
     */
    private function normalizeMarketingTags($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }

    /**
     * Înscrieri active și finalizări (course_user) pentru cursurile date.
     *
     * @param  array<int, int>  $courseIds
     * @return array<int, array{enrolled: int, completed: int}>
     */
    private function enrollmentCountsFor(array $courseIds): array
    {
        if ($courseIds === []) {
            return [];
        }

        return DB::table('course_user')
            ->whereIn('course_id', $courseIds)
            ->groupBy('course_id')
            ->selectRaw(
                'course_id,
                SUM(CASE WHEN enrolled = ? THEN 1 ELSE 0 END) AS enrolled,
                SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed',
                [true]
            )
            ->get()
            ->mapWithKeys(fn ($row) => [(int) $row->course_id => [
                'enrolled' => (int) $row->enrolled,
                'completed' => (int) $row->completed,
            ]])
            ->all();
    }

    /**
     * @param  array<int, array{enrolled: int, completed: int}>|null  $enrollmentCounts  preîncărcate (listă) sau null (un singur curs)
     */
    private function addCourseMetrics($course, ?array $enrollmentCounts = null)
    {
        try {
            $enrollmentCounts ??= $this->enrollmentCountsFor([(int) $course->id]);
            $counts = $enrollmentCounts[(int) $course->id] ?? ['enrolled' => 0, 'completed' => 0];
            $enrollmentsCount = $counts['enrolled'];
            $completedCount = $counts['completed'];

            // Calculate completion rate
            $completionRate = $enrollmentsCount > 0 
                ? round(($completedCount / $enrollmentsCount) * 100, 1)
                : 0;

            // Revenue - use from course if available, otherwise 0
            $revenue = $course->total_revenue ?? 0;

            // Rating - use from course if available
            $rating = $course->average_rating;
            $ratingCount = $course->rating_count ?? 0;

            // Check for alerts
            $hasAlerts = false;
            if ($completionRate < 30 && $enrollmentsCount > 5) {
                $hasAlerts = true;
            }

            // Status (default to published if no status column)
            $status = $course->status ?? 'draft';

            // Add metrics to course
            $course->enrollments_count = $enrollmentsCount;
            $course->total_enrollments = $enrollmentsCount;
            $course->completion_rate = $completionRate;
            $course->revenue = $revenue;
            $course->rating = $rating;
            $course->rating_count = $ratingCount;
            $course->status = $status;
            $course->has_alerts = $hasAlerts;

            return $course;
        } catch (\Exception $e) {
            \Log::error("Error adding course metrics for course {$course->id}: " . $e->getMessage());
            // Return course with default metrics on error
            $course->enrollments_count = 0;
            $course->total_enrollments = 0;
            $course->completion_rate = 0;
            $course->revenue = 0;
            $course->rating = null;
            $course->rating_count = 0;
            $course->status = $course->status ?? 'published';
            $course->has_alerts = false;
            return $course;
        }
    }

    private function attachCourseToDefaultMap(Course $course, int $ownerUserId): void
    {
        CourseMapBuckets::attachCourseToDefaultMap($course, $ownerUserId);
    }

    public function show($id)
    {
        try {
            $course = Course::findOrFail($id);
            if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
                abort(403, 'Acces interzis. Poți accesa doar cursurile tale.');
            }
            // Load course with all relationships
            $course = Course::with([
                'modules' => function($query) {
                    $query->orderBy('order')->with([
                        'lessons' => function($q) {
                            $q->orderBy('order');
                        },
                        'courseTests.test'
                    ]);
                },
                'teacher',
                'teams',
                'assignedUsers' => function ($query) use ($course) {
                    $query->select('users.id', 'users.name', 'users.email', 'users.role');
                    app(UserAssignedCoursesService::class)->constrainToDirectAssignedUsers($query, $course);
                },
                'courseTests.test' => function($query) {
                    $query->with('questions');
                }
            ])->findOrFail($id);

            // Add counts. Lecțiile pot sta direct pe curs, nu doar în module.
            $course->modules_count = $course->modules->count();
            $moduleIds = $course->modules->pluck('id');
            $course->lessons_count = Lesson::query()
                ->where(function ($query) use ($course, $moduleIds) {
                    $query->where('course_id', $course->id);
                    if ($moduleIds->isNotEmpty()) {
                        $query->orWhereIn('module_id', $moduleIds);
                    }
                })
                ->count();
            
            // Load all course-test links for this course
            $courseTests = \App\Models\CourseTest::where('course_id', $course->id)
                ->with('test')
                ->orderBy('order')
                ->get();
            
            // Add course-level tests
            $courseLevelTests = $courseTests->where('scope', 'course')->values();
            $course->tests = $courseLevelTests->map(function($ct) {
                $test = $ct->test;
                if ($test) {
                    $test->pivot = [
                        'scope' => $ct->scope,
                        'scope_id' => $ct->scope_id,
                        'required' => $ct->required,
                        'passing_score' => $ct->passing_score,
                        'order' => $ct->order,
                        'unlock_after_previous' => $ct->unlock_after_previous,
                        'unlock_after_test_id' => $ct->unlock_after_test_id,
                    ];
                }
                return $test;
            })->filter();
            
            // Add tests to modules
            foreach ($course->modules as $module) {
                // Get tests for this module from course_test
                $moduleCourseTests = $courseTests->where('scope', 'module')
                    ->where('scope_id', $module->id);
                
                $module->tests = $moduleCourseTests->map(function($ct) {
                    $test = $ct->test;
                    if ($test) {
                        $test->pivot = [
                            'scope' => $ct->scope,
                            'scope_id' => $ct->scope_id,
                            'required' => $ct->required,
                            'passing_score' => $ct->passing_score,
                            'order' => $ct->order,
                        ];
                    }
                    return $test;
                })->filter();
                $module->tests_count = $module->tests->count();
            }
            
            // Add tests to lessons
            foreach ($course->modules as $module) {
                foreach ($module->lessons as $lesson) {
                    // Get tests for this lesson from course_test
                    $lessonCourseTests = $courseTests->where('scope', 'lesson')
                        ->where('scope_id', $lesson->id);
                    
                    $lesson->tests = $lessonCourseTests->map(function($ct) {
                        $test = $ct->test;
                        if ($test) {
                            $test->pivot = [
                                'scope' => $ct->scope,
                                'scope_id' => $ct->scope_id,
                                'required' => $ct->required,
                                'passing_score' => $ct->passing_score,
                                'order' => $ct->order,
                            ];
                        }
                        return $test;
                    })->filter();
                    $lesson->tests_count = $lesson->tests->count();
                }
            }
            
            // Set counts
            $course->exams_count = $courseTests->count();
            $course->tests_count = $courseTests->count();
            
            $course = $this->addCourseMetrics($course);
            
            return response()->json($course);
        } catch (ModelNotFoundException|HttpExceptionInterface $e) {
            // Curs inexistent sau al altui instructor: 404/403, nu eroare de server.
            throw $e;
        } catch (\Exception $e) {
            \Log::error('Error fetching course', [
                'course_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch course',
                'message' => (config('app.debug') ? $e->getMessage() : null)
            ], 500);
        }
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'short_description' => 'nullable|string|max:200',
            'category' => 'nullable|string|max:100',
            'teacher_id' => 'nullable|exists:users,id',
            'reward_points' => 'nullable|integer|min:0',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'card_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'status' => 'nullable|in:draft,published',
            'access_type' => 'nullable|in:free',
            'enrollment_type' => 'nullable|string|in:open,by_invite,paid',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'level' => 'nullable|in:beginner,intermediate,advanced',
            'objectives' => 'nullable|array',
            'requirements' => 'nullable|array',
            'estimated_duration_hours' => 'nullable|integer|min:1',
            'sequential_unlock' => 'nullable|boolean',
            'min_completion_percentage' => 'nullable|integer|min:0|max:100',
            // SEO & Marketing
            'meta_title' => 'nullable|string|max:60',
            'meta_description' => 'nullable|string|max:160',
            'meta_keywords' => 'nullable|array',
            'marketing_tags' => 'nullable', // array or JSON string (FormData)
            // Certificate
            'has_certificate' => 'nullable|boolean',
            'min_test_score' => 'nullable|integer|min:0|max:100',
            'min_exam_score' => 'nullable|integer|min:0|max:100', // Legacy support
            'allow_retake' => 'nullable|boolean',
            'max_retakes' => 'nullable|integer|min:1|max:10',
            // Advanced
            'drip_content' => 'nullable|boolean',
            'drip_schedule' => 'nullable|in:daily,weekly,custom',
            'comments_enabled' => 'nullable|boolean',
            'visibility' => 'nullable|in:public,private,hidden',
            'permissions' => 'nullable|array',
        ]);

        if (auth()->user()->isInstructor()) {
            $validated['teacher_id'] = auth()->id();
        }

        $data = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'short_description' => $validated['short_description'] ?? null,
            'category' => $validated['category'] ?? null,
            'card_color' => $validated['card_color'] ?? null,
            'teacher_id' => $validated['teacher_id'] ?? null,
            'reward_points' => $validated['reward_points'] ?? 50,
            'status' => 'draft',
            'access_type' => $validated['access_type'] ?? 'free',
            'enrollment_type' => $validated['enrollment_type'] ?? 'open',
            'price' => 0,
            'currency' => $validated['currency'] ?? 'RON',
            'level' => $validated['level'] ?? null,
            'objectives' => $validated['objectives'] ?? [],
            'requirements' => $validated['requirements'] ?? [],
            'estimated_duration_hours' => $validated['estimated_duration_hours'] ?? null,
            'sequential_unlock' => $validated['sequential_unlock'] ?? true,
            'min_completion_percentage' => $validated['min_completion_percentage'] ?? 0,
            // SEO & Marketing
            'meta_title' => $validated['meta_title'] ?? null,
            'meta_description' => $validated['meta_description'] ?? null,
            'meta_keywords' => $validated['meta_keywords'] ?? [],
            'marketing_tags' => $this->normalizeMarketingTags($validated['marketing_tags'] ?? null),
            // Certificate
            'has_certificate' => $validated['has_certificate'] ?? false,
            'min_test_score' => $validated['min_test_score'] ?? $validated['min_exam_score'] ?? 70, // Support both old and new field names
            'allow_retake' => $validated['allow_retake'] ?? true,
            'max_retakes' => $validated['max_retakes'] ?? 3,
            // Advanced
            'drip_content' => $validated['drip_content'] ?? false,
            'drip_schedule' => $validated['drip_schedule'] ?? null,
            'comments_enabled' => $validated['comments_enabled'] ?? true,
            'visibility' => $validated['visibility'] ?? 'public',
            'permissions' => $validated['permissions'] ?? null,
        ];

        // Use CourseBuilderService to create course
        $teacher = isset($validated['teacher_id']) ? User::find($validated['teacher_id']) : $request->user();
        
        // Handle image upload
        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image');
        }

        $course = $this->courseBuilderService->createCourse($data, $teacher);
        $this->attachCourseToDefaultMap($course, (int) $request->user()->id);

        if (SchemaCache::hasColumn('courses', 'list_order')) {
            $q = Course::query()->where('id', '!=', $course->id);
            if ($request->user()->isInstructor()) {
                $q->where('teacher_id', $request->user()->id);
            }
            $max = (int) $q->max('list_order');
            $course->update(['list_order' => $max + 1]);
        }

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'telemetry.admin_course_created',
            'model_type' => Course::class,
            'model_id' => $course->id,
            'description' => 'Telemetry event: admin_course_created',
            'new_values' => [
                'status' => $course->status ?? 'draft',
                'teacher_id' => $course->teacher_id,
                'created_at' => now()->toISOString(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Curs creat cu succes',
            'course' => $this->addCourseMetrics($course->load(['modules', 'teacher', 'teams'])),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți edita doar cursurile tale.');
        }

        $rules = [
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'short_description' => 'nullable|string|max:200',
            'category' => 'nullable|string|max:100',
            'card_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'teacher_id' => 'nullable|exists:users,id',
            'reward_points' => 'nullable|integer|min:0',
            'status' => 'nullable|in:draft,published',
            'access_type' => 'nullable|in:free',
            'enrollment_type' => 'nullable|string|in:open,by_invite,paid',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'level' => 'nullable|in:beginner,intermediate,advanced',
            'objectives' => 'nullable|array',
            'requirements' => 'nullable|array',
            'estimated_duration_hours' => 'nullable|integer|min:1',
            'sequential_unlock' => 'nullable|boolean',
            'min_completion_percentage' => 'nullable|integer|min:0|max:100',
            // SEO & Marketing
            'meta_title' => 'nullable|string|max:60',
            'meta_description' => 'nullable|string|max:160',
            'meta_keywords' => 'nullable|array',
            'marketing_tags' => 'nullable', // array or JSON string (FormData)
            // Certificate
            'has_certificate' => 'nullable|boolean',
            'min_test_score' => 'nullable|integer|min:0|max:100',
            'min_exam_score' => 'nullable|integer|min:0|max:100', // Legacy support
            'allow_retake' => 'nullable|boolean',
            'max_retakes' => 'nullable|integer|min:1|max:10',
            // Advanced
            'drip_content' => 'nullable|boolean',
            'drip_schedule' => 'nullable|in:daily,weekly,custom',
            'comments_enabled' => 'nullable|boolean',
            'visibility' => 'nullable|in:public,private,hidden',
            'permissions' => 'nullable|array',
        ];

        // For updates, image is optional. Validate only when a new file is uploaded.
        if ($request->hasFile('image')) {
            $rules['image'] = 'required|image|mimes:jpeg,png,jpg,gif,webp|max:2048';
        }

        $validated = $request->validate($rules);

        if (auth()->user()->isInstructor()) {
            $validated['teacher_id'] = auth()->id();
        }

        $data = [];
        $fields = [
            'title', 'description', 'short_description', 'card_color', 'teacher_id', 'reward_points',
            'status', 'access_type', 'enrollment_type', 'price', 'currency', 'level',
            'objectives', 'requirements', 'estimated_duration_hours',
            'sequential_unlock', 'min_completion_percentage',
            // SEO & Marketing
            'meta_title', 'meta_description', 'meta_keywords', 'marketing_tags',
            // Certificate
            'has_certificate', 'min_test_score', 'min_exam_score', 'allow_retake', 'max_retakes', // min_exam_score for legacy support
            // Advanced
            'drip_content', 'drip_schedule', 'comments_enabled', 'visibility', 'permissions'
        ];
        
        foreach ($fields as $field) {
            if (isset($validated[$field])) {
                $data[$field] = $field === 'marketing_tags'
                    ? $this->normalizeMarketingTags($validated[$field])
                    : $validated[$field];
            }
        }

        // Force access_type to 'free' and price to 0
        $data['access_type'] = 'free';
        $data['price'] = 0;
        
        // Handle min_test_score (new) or min_exam_score (legacy)
        if (isset($validated['min_test_score'])) {
            $data['min_test_score'] = $validated['min_test_score'];
        } elseif (isset($validated['min_exam_score'])) {
            // Legacy support: map min_exam_score to min_test_score
            $data['min_test_score'] = $validated['min_exam_score'];
        }

        // Use CourseBuilderService to update course
        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image');
        }

        $previousStatus = $course->status;
        $wantsPublish = (($data['status'] ?? null) === 'published') && $previousStatus !== 'published';
        if ($wantsPublish) {
            unset($data['status']);
        }
        $course = $this->courseBuilderService->updateCourse($course, $data);

        if ($wantsPublish) {
            $published = $this->courseBuilderService->publishLive($course, $request->user());
            if (! ($published['ok'] ?? false)) {
                return response()->json($published, 422);
            }
            $course = $published['course'] ?? $course->fresh();
            $this->notifyStudentsCoursePublished($course, $previousStatus);
        }

        return response()->json([
            'message' => 'Curs actualizat cu succes',
            'course' => $this->addCourseMetrics($course->load(['modules', 'teacher', 'teams'])),
        ]);
    }

    public function destroy($id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți șterge doar cursurile tale.');
        }
        $this->courseBuilderService->deleteCourse($course);

        return response()->json([
            'message' => 'Curs șters cu succes',
        ]);
    }

    public function attachTeams(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'team_ids' => 'present|array',
            'team_ids.*' => 'exists:teams,id',
        ]);

        app(UserAssignedCoursesService::class)->syncCourseTeams(
            $course,
            array_map('intval', $validated['team_ids'])
        );

        return response()->json([
            'message' => 'Echipe atașate cu succes',
            'course' => $course->load(['modules', 'teacher', 'teams', 'assignedUsers' => function ($q) use ($course) {
                $q->select('users.id', 'users.name', 'users.email', 'users.role');
                app(UserAssignedCoursesService::class)->constrainToDirectAssignedUsers($q, $course);
            }]),
        ]);
    }

    /**
     * Liste minimă de echipe pentru bifare pe curs (admin + instructor cu acces la curs).
     */
    public function assignableTeams($id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $teams = Team::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'accent_color']);

        return response()->json(['teams' => $teams]);
    }

    /**
     * Elevi disponibili pentru atribuire directă: toți studenții (admin) sau studenți din echipele deja legate de curs (instructor).
     */
    public function assignableLearners(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $q = User::query()->where('role', 'student');
        if (auth()->user()->isInstructor()) {
            $teamIds = $course->teams()->pluck('teams.id');
            if ($teamIds->isEmpty()) {
                return response()->json([
                    'learners' => [],
                    'hint' => 'Atașează mai întâi o echipă la acest curs pentru a putea atribui elevi din echipe.',
                ]);
            }
            $q->whereHas('teams', fn ($q2) => $q2->whereIn('teams.id', $teamIds));
        }

        if ($request->filled('search')) {
            $term = trim((string) $request->get('search'));
            $like = '%'.addcslashes($term, '%_\\').'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like);
            });
        }

        $learners = $q->orderBy('name')->limit(250)->get(['id', 'name', 'email']);

        return response()->json(['learners' => $learners]);
    }

    /**
     * Atribuie cursul la elevi fără a șterge celelalte cursuri ale utilizatorului (syncWithoutDetaching pe pivot).
     */
    public function attachLearners(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'exists:users,id',
            'is_mandatory' => 'nullable|boolean',
        ]);

        $userIds = array_values(array_unique(array_map('intval', $validated['user_ids'])));
        $isMandatory = $validated['is_mandatory'] ?? true;

        $teamIdsForInstructor = null;
        if (auth()->user()->isInstructor()) {
            $teamIdsForInstructor = $course->teams()->pluck('teams.id');
            if ($teamIdsForInstructor->isEmpty()) {
                return response()->json([
                    'message' => 'Atașează mai întâi o echipă la curs înainte de a atribui elevi.',
                ], 422);
            }
        }

        foreach ($userIds as $userId) {
            $user = User::find($userId);
            if (! $user || $user->role !== 'student') {
                return response()->json([
                    'message' => 'Poți atribui cursul doar utilizatorilor cu rolul de elev (student).',
                    'user_id' => $userId,
                ], 422);
            }
            if ($user->isLearningActivityExempt()) {
                return response()->json([
                    'message' => 'Nu atribuim cursuri pentru acest tip de utilizator.',
                    'user_id' => $userId,
                ], 422);
            }
            if ($teamIdsForInstructor !== null) {
                $inLinkedTeam = $user->teams()->whereIn('teams.id', $teamIdsForInstructor)->exists();
                if (! $inLinkedTeam) {
                    return response()->json([
                        'message' => 'Elevul trebuie să fie într-o echipă la care este deja atașat acest curs.',
                        'user_id' => $userId,
                    ], 422);
                }
            }
        }

        $pivot = [
            'is_mandatory' => $isMandatory,
            'assigned_at' => now(),
            'enrolled' => true,
            'enrolled_at' => now(),
        ];

        $assignment = app(UserAssignedCoursesService::class);
        foreach ($userIds as $userId) {
            $assignment->assignCourseDirectly(User::findOrFail($userId), $course, $pivot);
        }

        $course->load(['assignedUsers' => function ($q) use ($course) {
            $q->select('users.id', 'users.name', 'users.email', 'users.role');
            app(UserAssignedCoursesService::class)->constrainToDirectAssignedUsers($q, $course);
        }]);

        return response()->json([
            'message' => 'Curs atribuit elevilor cu succes',
            'assigned_users' => $course->assignedUsers,
        ]);
    }

    public function detachLearner($id, $userId)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $user = User::findOrFail($userId);
        if (! $course->assignedUsers()->where('users.id', $user->id)->exists()) {
            return response()->json([
                'message' => 'Acest elev nu are cursul atribuit.',
            ], 404);
        }

        app(UserAssignedCoursesService::class)->revokeDirectAssignment($user, $course);
        Cache::forget("dashboard_user_{$user->id}_stats");
        Cache::forget("profile_user_{$user->id}");

        $course->load(['assignedUsers' => function ($q) use ($course) {
            $q->select('users.id', 'users.name', 'users.email', 'users.role');
            app(UserAssignedCoursesService::class)->constrainToDirectAssignedUsers($q, $course);
        }]);

        return response()->json([
            'message' => 'Atribuirea a fost eliminată',
            'assigned_users' => $course->assignedUsers,
        ]);
    }

    // Quick Actions
    // Bulk Actions
    // Reorder Modules
    public function reorderModules(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'module_ids' => 'required|array',
            'module_ids.*' => 'exists:modules,id',
        ]);

        // Verify all modules belong to this course
        $modules = Module::whereIn('id', $validated['module_ids'])
            ->where('course_id', $id)
            ->get();

        if ($modules->count() !== count($validated['module_ids'])) {
            return response()->json([
                'message' => 'Unele module nu aparțin acestui curs',
            ], 400);
        }

        // Use CourseBuilderService to reorder modules
        $this->courseBuilderService->reorderModules($course, $validated['module_ids']);

        // Progresul cursanților se recalculează în coadă, o singură dată pentru toată reordonarea
        RecalculateCourseProgressJob::queueFor((int) $course->id);

        return response()->json([
            'message' => 'Module reordonate cu succes',
            'modules' => Module::where('course_id', $id)->orderBy('order')->get(),
        ]);
    }

    // Preview course (for admin / instructor)
    // Insights
    private function notifyStudentsCoursePublished(Course $course, ?string $previousStatus): void
    {
        if (($previousStatus ?? '') === 'published' || ($course->status ?? '') !== 'published') {
            return;
        }

        try {
            $teamIds = $course->teams()->pluck('teams.id')->map(fn ($id) => (int) $id)->all();
            app(\App\Services\NotificationService::class)->notifyCoursePublished(
                $course,
                $teamIds,
                broadcastAllStudentsIfNoTargets: count($teamIds) === 0
            );
        } catch (\Throwable $e) {
            \Log::warning('CourseAdminController: notifyCoursePublished failed', [
                'course_id' => $course->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
