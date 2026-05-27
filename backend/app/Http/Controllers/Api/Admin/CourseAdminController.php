<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\User;
use App\Models\Team;
use App\Models\Module;
use App\Models\CourseMap;
use App\Support\CourseMapBuckets;
use App\Models\CourseTest;
use App\Models\ActivityLog;
use App\Services\CourseProgressService;
use App\Services\CourseBuilderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

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
            // Check if courses table exists
            if (!Schema::hasTable('courses')) {
                return response()->json(['data' => [], 'total' => 0]);
            }
            
            $query = Course::with(['teacher:id,name,email'])
                ->withCount('modules');
        
        // Add enrollments count if course_user table exists
        if (Schema::hasTable('course_user')) {
            try {
                $query->withCount(['assignedUsers as enrollments_count' => function($q) {
                    if (Schema::hasColumn('course_user', 'enrolled')) {
                        $q->where('enrolled', true);
                    }
                }]);
            } catch (\Exception $e) {
                // If relationship fails, add default count
                $query->addSelect(DB::raw('0 as enrollments_count'));
            }
        } else {
            // If table doesn't exist, add a default count
            $query->addSelect(DB::raw('0 as enrollments_count'));
        }

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
            // If status column exists in database
            if (Schema::hasColumn('courses', 'status')) {
                $query->where('status', $request->status);
            } else {
                // Fallback: treat all as published for now
                // You can add status migration later
            }
        }


        // Instructor: doar cursurile proprii
        if (auth()->user()->isInstructor()) {
            $query->where('teacher_id', auth()->id());
        } elseif ($request->has('instructor') && $request->instructor) {
            $query->where('teacher_id', $request->instructor);
        }

        // Filter by course map (cursuri din această mapă)
        if ($request->has('course_map_id') && Schema::hasTable('course_map_course')) {
            $mapId = (int) $request->course_map_id;
            if ($mapId > 0) {
                $query->whereHas('courseMaps', fn ($q) => $q->where('course_maps.id', $mapId));
            }
        }

        // Level filter (if level column exists)
        if ($request->has('level') && $request->level !== 'all') {
            if (Schema::hasColumn('courses', 'level')) {
                $query->where('level', $request->level);
            }
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
                if (Schema::hasColumn('courses', 'list_order')) {
                    $query->orderBy('list_order', strtolower($sortDirection) === 'desc' ? 'desc' : 'asc')
                        ->orderBy('id', 'asc');
                } else {
                    $query->orderBy('updated_at', 'desc');
                }
                break;
            default:
                $query->orderBy($sortBy, $sortDirection);
                break;
        }

            $perPage = $request->get('per_page', 50);
            $courses = $query->paginate($perPage);

            // Add metrics to each course
            $courses->getCollection()->transform(function($course) {
                return $this->addCourseMetrics($course);
            });

            return response()->json($courses);
        } catch (\Exception $e) {
            \Log::error('Error fetching courses', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch courses',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Salvează ordinea cursurilor în lista admin (drag & drop).
     * Body: { "course_ids": [3, 1, 5, ...] } — ordinea din array = list_order 0, 1, 2, …
     */
    public function reorderList(Request $request)
    {
        if (!Schema::hasColumn('courses', 'list_order')) {
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

    private function addCourseMetrics($course)
    {
        try {
            // Get enrollments count
            $enrollmentsCount = 0;
            if (Schema::hasTable('course_user')) {
                $enrollmentsCount = DB::table('course_user')
                    ->where('course_id', $course->id)
                    ->where(function($q) {
                        if (Schema::hasColumn('course_user', 'enrolled')) {
                            $q->where('enrolled', true);
                        } else {
                            // If enrolled column doesn't exist, count all records
                            $q->whereNotNull('course_id');
                        }
                    })
                    ->count();
            }

            // Get completed count
            $completedCount = 0;
            if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'completed_at')) {
                $completedCount = DB::table('course_user')
                    ->where('course_id', $course->id)
                    ->whereNotNull('completed_at')
                    ->count();
            }

            // Calculate completion rate
            $completionRate = $enrollmentsCount > 0 
                ? round(($completedCount / $enrollmentsCount) * 100, 1)
                : 0;

            // Revenue - use from course if available, otherwise 0
            $revenue = 0;
            if (Schema::hasColumn('courses', 'total_revenue')) {
                $revenue = $course->total_revenue ?? 0;
            }

            // Rating - use from course if available
            $rating = null;
            $ratingCount = 0;
            if (Schema::hasColumn('courses', 'average_rating')) {
                $rating = $course->average_rating;
                $ratingCount = $course->rating_count ?? 0;
            }

            // Check for alerts
            $hasAlerts = false;
            if ($completionRate < 30 && $enrollmentsCount > 5) {
                $hasAlerts = true;
            }

            // Status (default to published if no status column)
            $status = 'published';
            if (Schema::hasColumn('courses', 'status')) {
                $status = $course->status ?? 'draft';
            }

            // Add metrics to course
            $course->enrollments_count = $enrollmentsCount;
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
                'assignedUsers' => function ($query) {
                    $query->select('users.id', 'users.name', 'users.email', 'users.role');
                    if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled')) {
                        $query->wherePivot('enrolled', true);
                    }
                },
                'courseTests.test' => function($query) {
                    $query->with('questions');
                }
            ])->findOrFail($id);

            // Add counts
            $course->modules_count = $course->modules->count();
            $course->lessons_count = $course->modules->sum(function($module) {
                return $module->lessons->count();
            });
            
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
        } catch (\Exception $e) {
            \Log::error('Error fetching course', [
                'course_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch course',
                'message' => $e->getMessage()
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
            'status' => $validated['status'] ?? 'draft',
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

        if (Schema::hasColumn('courses', 'list_order')) {
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
        $course = $this->courseBuilderService->updateCourse($course, $data);

        if ($course->status === 'published' && $previousStatus !== 'published') {
            $this->courseBuilderService->publishDraftLinkedAssessmentsForCourse((int) $course->id);
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

    public function getTeachers()
    {
        try {
            if (!Schema::hasTable('users')) {
                return response()->json([]);
            }
            if (auth()->user()->isInstructor()) {
                $teachers = User::where('id', auth()->id())->get(['id', 'name', 'email']);
                return response()->json($teachers);
            }
            $teachers = User::whereIn('role', ['admin', 'instructor'])
                ->orderBy('name')
                ->get(['id', 'name', 'email']);

            return response()->json($teachers);
        } catch (\Exception $e) {
            \Log::error('Error fetching teachers', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to fetch teachers',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function attachTeams(Request $request, $id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'team_ids' => 'required|array',
            'team_ids.*' => 'exists:teams,id',
        ]);

        $course->teams()->sync($validated['team_ids']);

        return response()->json([
            'message' => 'Echipe atașate cu succes',
            'course' => $course->load(['modules', 'teacher', 'teams', 'assignedUsers' => function ($q) {
                $q->select('users.id', 'users.name', 'users.email', 'users.role');
                if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled')) {
                    $q->wherePivot('enrolled', true);
                }
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

        if ($isMandatory) {
            $hasRequiredTest = CourseTest::where('course_id', $course->id)
                ->where('required', true)
                ->exists();
            if (! $hasRequiredTest) {
                return response()->json([
                    'error' => 'Cursurile obligatorii trebuie să aibă cel puțin un test obligatoriu',
                    'message' => 'Acest curs nu are teste obligatorii. Bifează „opțional” sau adaugă un test obligatoriu.',
                ], 422);
            }
        }

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

        foreach ($userIds as $userId) {
            $user = User::findOrFail($userId);
            $user->assignedCourses()->syncWithoutDetaching([$course->id => $pivot]);
            Cache::forget("dashboard_user_{$user->id}_stats");
            Cache::forget("profile_user_{$user->id}");
        }

        $course->load(['assignedUsers' => function ($q) {
            $q->select('users.id', 'users.name', 'users.email', 'users.role');
            if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled')) {
                $q->wherePivot('enrolled', true);
            }
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

        $user->assignedCourses()->detach($course->id);
        Cache::forget("dashboard_user_{$user->id}_stats");
        Cache::forget("profile_user_{$user->id}");

        $course->load(['assignedUsers' => function ($q) {
            $q->select('users.id', 'users.name', 'users.email', 'users.role');
            if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled')) {
                $q->wherePivot('enrolled', true);
            }
        }]);

        return response()->json([
            'message' => 'Atribuirea a fost eliminată',
            'assigned_users' => $course->assignedUsers,
        ]);
    }

    // Quick Actions
    public function quickAction(Request $request, $id, $action)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        switch ($action) {
            case 'publish':
                if (Schema::hasColumn('courses', 'status')) {
                    $previousStatus = $course->status;
                    $course->update(['status' => 'published']);
                    $this->courseBuilderService->publishDraftLinkedAssessmentsForCourse((int) $course->id);
                    $this->notifyStudentsCoursePublished($course->fresh(), $previousStatus);
                }
                break;
            case 'unpublish':
                if (Schema::hasColumn('courses', 'status')) {
                    $course->update(['status' => 'draft']);
                }
                break;
            case 'duplicate':
                $newCourse = $course->replicate();
                $newCourse->title = $course->title . ' (Copy)';
                $newCourse->status = 'draft';
                $newCourse->save();
                // Duplicate modules if needed
                break;
            default:
                return response()->json(['message' => 'Acțiune invalidă'], 400);
        }

        return response()->json([
            'message' => 'Acțiune efectuată cu succes',
            'course' => $this->addCourseMetrics($course->fresh()),
        ]);
    }

    // Bulk Actions
    public function bulkAction(Request $request)
    {
        try {
            $validated = $request->validate([
                'course_ids' => 'required|array|min:1',
                'course_ids.*' => 'exists:courses,id',
                'action' => 'required|in:publish,delete,unpublish',
            ]);

            $query = Course::whereIn('id', $validated['course_ids']);
            if (auth()->user()->isInstructor()) {
                $query->where('teacher_id', auth()->id());
            }
            $courses = $query->get();

            if ($courses->isEmpty()) {
                return response()->json([
                    'message' => 'Nu s-au găsit cursuri',
                ], 404);
            }

            $updated = 0;
            $deleted = 0;
            $errors = [];

            foreach ($courses as $course) {
                try {
                    switch ($validated['action']) {
                        case 'publish':
                            if (Schema::hasColumn('courses', 'status')) {
                                $previousStatus = $course->status;
                                $course->update(['status' => 'published']);
                                $this->courseBuilderService->publishDraftLinkedAssessmentsForCourse((int) $course->id);
                                $this->notifyStudentsCoursePublished($course->fresh(), $previousStatus);
                                $updated++;
                            }
                            break;
                        case 'unpublish':
                            if (Schema::hasColumn('courses', 'status')) {
                                $course->update(['status' => 'draft']);
                                $updated++;
                            }
                            break;
                        case 'delete':
                            if ($course->image) {
                                try {
                                    Storage::disk('public')->delete($course->image);
                                } catch (\Exception $e) {
                                    // Continue even if image deletion fails
                                }
                            }
                            $course->delete();
                            $deleted++;
                            break;
                    }
                } catch (\Exception $e) {
                    $errors[] = "Eroare la cursul {$course->id}: " . $e->getMessage();
                    \Log::error("Bulk action error for course {$course->id}: " . $e->getMessage());
                }
            }

            $message = $validated['action'] === 'delete' 
                ? "Șters {$deleted} cursuri"
                : "Actualizat {$updated} cursuri";

            $response = [
                'message' => $message,
                'updated' => $updated,
                'deleted' => $deleted,
            ];

            if (!empty($errors)) {
                $response['errors'] = $errors;
            }

            return response()->json($response);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'Date invalide',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            \Log::error("Bulk action error: " . $e->getMessage());
            return response()->json([
                'message' => 'Eroare la procesarea acțiunii: ' . $e->getMessage(),
            ], 500);
        }
    }

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

        // Recalculate course progress after structure change
        $progressService = app(CourseProgressService::class);
        $progressService->recalculateCourseProgress($course);

        return response()->json([
            'message' => 'Module reordonate cu succes',
            'modules' => Module::where('course_id', $id)->orderBy('order')->get(),
        ]);
    }

    // Preview course (for admin / instructor)
    public function preview($id)
    {
        $course = Course::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $course = Course::with([
            'modules' => function($query) {
                $query->orderBy('order')->with(['lessons' => function($q) {
                    $q->orderBy('order');
                }]);
            },
            'tests' => function($query) {
                $query->withPivot('scope', 'scope_id', 'required', 'passing_score', 'order');
            },
            'teacher'
        ])->findOrFail($id);
        
        // Return course data for preview
        return response()->json([
            'course' => $course,
            'preview_mode' => true,
        ]);
    }

    // Insights
    public function insights()
    {
        try {
            $insights = [];
            $thresholdCompletion = 30; // 30% completion threshold
            $thresholdDaysOutdated = 90; // 90 days outdated threshold

            $courses = Course::with('teacher')->get();

            foreach ($courses as $course) {
                $enrollments = 0;
                if (Schema::hasTable('course_user')) {
                    $enrollments = DB::table('course_user')
                        ->where('course_id', $course->id)
                        ->where(function($q) {
                            if (Schema::hasColumn('course_user', 'enrolled')) {
                                $q->where('enrolled', true);
                            } else {
                                $q->whereNotNull('course_id');
                            }
                        })
                        ->count();
                }

                if ($enrollments === 0) continue;

                $completed = 0;
                if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'completed_at')) {
                    $completed = DB::table('course_user')
                        ->where('course_id', $course->id)
                        ->whereNotNull('completed_at')
                        ->count();
                }

                $completionRate = $enrollments > 0 ? ($completed / $enrollments) * 100 : 0;

                // Low completion
                if ($completionRate < $thresholdCompletion && $enrollments > 5) {
                    $insights[] = [
                        'id' => 'low_completion_' . $course->id,
                        'type' => 'low_completion',
                        'course_id' => $course->id,
                        'course_title' => $course->title,
                        'message' => "Rată de finalizare " . round($completionRate, 1) . "% (sub {$thresholdCompletion}%)",
                        'severity' => 'warning',
                    ];
                }

                // Outdated course
                if ($course->updated_at) {
                    $daysSinceUpdate = Carbon::parse($course->updated_at)->diffInDays(Carbon::now());
                    if ($daysSinceUpdate > $thresholdDaysOutdated) {
                        $insights[] = [
                            'id' => 'outdated_' . $course->id,
                            'type' => 'outdated',
                            'course_id' => $course->id,
                            'course_title' => $course->title,
                            'message' => "Neactualizat de {$daysSinceUpdate} zile",
                            'severity' => 'info',
                        ];
                    }
                }
            }

            return response()->json($insights);
        } catch (\Exception $e) {
            \Log::error("Error fetching insights: " . $e->getMessage());
            return response()->json([
                'error' => 'Error fetching insights: ' . $e->getMessage()
            ], 500);
        }
    }

    private function notifyStudentsCoursePublished(Course $course, ?string $previousStatus): void
    {
        if (($previousStatus ?? '') === 'published' || ($course->status ?? '') !== 'published') {
            return;
        }

        try {
            app(\App\Services\NotificationService::class)->notifyCoursePublished($course, [], false);
        } catch (\Throwable $e) {
            \Log::warning('CourseAdminController: notifyCoursePublished failed', [
                'course_id' => $course->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
