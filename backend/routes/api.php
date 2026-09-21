<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\LessonController;
use App\Http\Controllers\CourseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\TelemetryController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\Admin\CourseAdminController;
use App\Http\Controllers\Api\Admin\CourseBuilderController;
use App\Http\Controllers\Api\Admin\QuestionAdminController;
use App\Http\Controllers\Api\Admin\QuestionCatalogAdminController;
use App\Http\Controllers\Api\Admin\ExamAdminController;
use App\Http\Controllers\Api\Admin\EventAdminController;
use App\Http\Controllers\Api\Admin\DashboardAdminController;
use App\Http\Controllers\Api\Admin\DepartmentAdminController;
use App\Http\Controllers\Api\Admin\TeamAdminController;
use App\Http\Controllers\Api\Admin\UserAdminController;
use App\Http\Controllers\Api\Admin\UserInvitationAdminController;
use App\Http\Controllers\Api\Admin\ActivityLogAdminController;
use App\Http\Controllers\Api\Admin\MediaAdminController;
use App\Http\Controllers\Api\Admin\CourseMapAdminController;
use App\Http\Controllers\Api\Admin\StatisticsAdminController;
use App\Http\Controllers\Api\Admin\AIExportAdminController;
use App\Http\Controllers\Api\Admin\CompanyAdminController;
use App\Http\Controllers\Api\Admin\LeadAdminController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\LibraryController;

/*
| Fără StartSession / Sanctum stateful — util pe VPS dacă sesiunile DB lipsesc și tot API-ul dă 500.
| GET /api/health → dacă răspunde 200, PHP + rutele merg; dacă 500, verifică DB / .env în container.
*/
Route::get('/health', function () {
    $checks = [
        'database' => 'ok',
        'queue' => config('queue.default'),
        'cache' => config('cache.default'),
    ];
    $ok = true;

    try {
        DB::connection()->getPdo();
        DB::select('select 1');
    } catch (\Throwable $e) {
        $ok = false;
        $checks['database'] = 'error';
        $expose = config('app.debug') || filter_var(env('FORMELY_EXPOSE_API_ERRORS', false), FILTER_VALIDATE_BOOLEAN);
        return response()->json([
            'ok' => false,
            'checks' => $checks,
            'database' => 'error',
            'message' => $expose ? $e->getMessage() : 'Database connection failed.',
        ], 500);
    }

    try {
        if (config('queue.default') === 'database') {
            DB::table('jobs')->limit(1)->count();
            $checks['queue_table'] = 'ok';
        }
    } catch (\Throwable $e) {
        $checks['queue_table'] = 'missing';
    }

    return response()->json([
        'ok' => $ok,
        'checks' => $checks,
        'database' => 'connected',
        'session_driver' => config('session.driver'),
        'session_secure' => config('session.secure'),
        'session_same_site' => config('session.same_site'),
        'session_domain' => config('session.domain'),
        'app_url' => config('app.url'),
        'sanctum_stateful' => config('sanctum.stateful'),
        'cache_store' => config('cache.default'),
        'queue_connection' => config('queue.default'),
        'mail_mailer' => config('mail.default'),
    ]);
})->withoutMiddleware([
    \App\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
]);

// Public routes – throttle to prevent abuse (e.g. scraping, DoS)
// tenant.optional: never dump all tenants; guest → default company, auth → user company
Route::middleware(['throttle:120,1', 'tenant.optional'])->group(function () {
    Route::get('/courses', [CourseController::class, 'index']);
    Route::get('/courses/standalone', [CourseController::class, 'learnerStandaloneCourses']);
    Route::get('/courses/{id}', [CourseController::class, 'show']);
    Route::get('/lessons/{id}', [\App\Http\Controllers\Api\LessonController::class, 'show']);
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/{id}', [EventController::class, 'show']);
    Route::get('/builder-media/{courseId}/{mediaId}', [CourseBuilderController::class, 'serveMediaFilePublic']);
});

// CSRF cookie pentru SPA: Sanctum (EnsureFrontendRequestsAreStateful) aplică deja EncryptCookies,
// StartSession și VerifyCsrfToken pentru Origin/Referer din config('sanctum.stateful').
// Nu folosi middleware('web') aici — se suprapune peste stack-ul API și poate produce 500 (sesiune dublă).
Route::get('/csrf-cookie', function () {
    return response()->json(['message' => 'CSRF cookie set']);
});

// Debug-only: check cookies/session (disabled in production)
if (config('app.debug')) {
    Route::get('/test-session', function (Request $request) {
        $sessionId = $request->session()->getId();
        $request->session()->put('test', 'value');
        return response()->json([
            'session_id' => $sessionId,
            'has_session' => $request->hasSession(),
            'cookies_received' => array_keys($request->cookies->all()),
        ]);
    });
}

// Auth routes with rate limiting (prevent brute force attacks)
Route::post('/auth/register', [\App\Http\Controllers\Api\AuthController::class, 'register'])->middleware('throttle:15,1'); // 15 attempts per minute
Route::post('/auth/login', [\App\Http\Controllers\Api\AuthController::class, 'login'])->middleware('throttle:15,1'); // 15 attempts per minute
Route::post('/auth/forgot-password', [\App\Http\Controllers\Api\AuthController::class, 'forgotPassword'])->middleware('throttle:10,1');
Route::post('/auth/reset-password', [\App\Http\Controllers\Api\AuthController::class, 'resetPassword'])->middleware('throttle:15,1');
Route::get('/auth/invitations/validate', [\App\Http\Controllers\Api\InvitationAuthController::class, 'validateToken'])->middleware('throttle:30,1');
Route::post('/auth/invitations/accept', [\App\Http\Controllers\Api\InvitationAuthController::class, 'accept'])->middleware('throttle:15,1');
Route::get('/branding/{slug}', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'showBySlug'])->middleware('throttle:60,1');
Route::post('/leads', [LeadController::class, 'store'])->middleware('throttle:10,1');
Route::get('/plans', function () {
    return response()->json([
        'public_register_enabled' => (bool) config('formely.public_register_enabled', false),
        'plans' => collect(config('plans', []))->map(function (array $plan, string $key) {
            return [
                'id' => $key,
                'label' => $plan['label'] ?? $key,
                'max_active_learners' => $plan['max_active_learners'] ?? null,
                'max_staff' => $plan['max_staff'] ?? null,
                'features' => $plan['features'] ?? [],
            ];
        })->values(),
    ]);
})->middleware('throttle:60,1');

Route::post('/auth/logout', [\App\Http\Controllers\Api\AuthController::class, 'logout'])->middleware(['auth:sanctum', 'tenant']);
Route::get('/auth/me', [\App\Http\Controllers\Api\AuthController::class, 'me'])->middleware(['auth:sanctum', 'tenant']);
Route::post('/auth/change-password', [\App\Http\Controllers\Api\AuthController::class, 'changePassword'])->middleware(['auth:sanctum', 'tenant', 'throttle:60,1']);

// Protected routes (require authentication) with rate limiting
Route::middleware(['auth:sanctum', 'tenant', 'throttle:api-app'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/profile', [ProfileController::class, 'index']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'removeAvatar']);
    // Lesson completion removed - we use modules now, course completion is through quiz passing
    // Route::post('/lessons/{id}/complete', [LessonController::class, 'complete']);
    Route::get('/courses/{courseId}/progress/{userId}', [LessonController::class, 'getProgress']);
    
    // Student Dashboard
    Route::get('/student/dashboard', [\App\Http\Controllers\Api\StudentDashboardController::class, 'index']);
    Route::get('/student/activity', [\App\Http\Controllers\Api\StudentActivityController::class, 'index']);

    // In-app notifications (persisted)
    Route::get('/notifications/unread-count', [\App\Http\Controllers\Api\NotificationController::class, 'unreadCount']);
    Route::post('/notifications/mark-all-read', [\App\Http\Controllers\Api\NotificationController::class, 'markAllRead']);
    Route::get('/notifications', [\App\Http\Controllers\Api\NotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read', [\App\Http\Controllers\Api\NotificationController::class, 'markRead']);
    
    // Course Progress
    Route::get('/courses/{courseId}/progress', [\App\Http\Controllers\Api\CourseProgressController::class, 'getCourseProgress']);
    Route::post('/courses/{courseId}/enroll', [\App\Http\Controllers\Api\CourseProgressController::class, 'enrollCourse']);
    Route::post('/courses/{courseId}/finish', [\App\Http\Controllers\Api\CourseProgressController::class, 'finishCourse']);
    Route::post('/courses/{courseId}/complete', [CourseController::class, 'complete']);
    Route::post('/lessons/{lessonId}/complete', [\App\Http\Controllers\Api\CourseProgressController::class, 'completeLesson']);
    Route::put('/lessons/{lessonId}/progress', [\App\Http\Controllers\Api\CourseProgressController::class, 'updateLessonProgress']);
    Route::get('/modules/{moduleId}/access', [\App\Http\Controllers\Api\CourseProgressController::class, 'checkModuleAccess']);
    Route::get('/lessons/{lessonId}/access', [\App\Http\Controllers\Api\CourseProgressController::class, 'checkLessonAccess']);
    Route::get('/lessons/{lessonId}/notes', [\App\Http\Controllers\Api\LessonNoteController::class, 'show']);
    Route::put('/lessons/{lessonId}/notes', [\App\Http\Controllers\Api\LessonNoteController::class, 'update']);
    Route::get('/exams/{examId}/access', [\App\Http\Controllers\Api\CourseProgressController::class, 'checkExamAccess']);

    // Quiz curs (legacy Exam per course): autentificat — nu expune chei fără control în API public
    Route::get('/courses/{courseId}/quiz', [QuizController::class, 'show']);
    Route::post('/courses/{courseId}/quiz/submit', [QuizController::class, 'submit']);
    
    // Course maps (student: list and show map with published courses)
    Route::get('/course-maps', [\App\Http\Controllers\Api\CourseMapController::class, 'index']);
    Route::get('/course-maps/{id}', [\App\Http\Controllers\Api\CourseMapController::class, 'show']);

    // Exam endpoints (lista fără curs înainte de {examId})
    Route::get('/exams', [\App\Http\Controllers\Api\ExamController::class, 'learnerStandaloneExams']);
    Route::get('/exams/{examId}', [\App\Http\Controllers\Api\ExamController::class, 'show']);
    Route::post('/exams/{examId}/progress', [\App\Http\Controllers\Api\ExamController::class, 'saveProgress']);
    Route::post('/exams/{examId}/submit', [\App\Http\Controllers\Api\ExamController::class, 'submit']);
    
    // Exam Results (TestResult — tests in courses)
    Route::get('/exam-results', [\App\Http\Controllers\Api\ExamResultController::class, 'index']);
    Route::get('/exam-results/{id}', [\App\Http\Controllers\Api\ExamResultController::class, 'show']);

    // Catalog exam results (ExamResult — standalone exams only)
    Route::get('/catalog-exam-results', [\App\Http\Controllers\Api\CatalogExamResultController::class, 'index']);
    Route::get('/catalog-exam-results/{id}', [\App\Http\Controllers\Api\CatalogExamResultController::class, 'show']);

    // Bibliotecă materiale (cărți, PDF-uri etc.) — listare & descărcare toți utilizatorii autentificați
    Route::middleware('company_feature:library')->group(function () {
        Route::get('/library/items', [LibraryController::class, 'index']);
        Route::get('/library/items/{id}', [LibraryController::class, 'show']);
        Route::post('/library/items', [LibraryController::class, 'store']);
        Route::put('/library/items/{id}', [LibraryController::class, 'update']);
        Route::post('/library/items/{id}', [LibraryController::class, 'update']);
        Route::delete('/library/items/{id}', [LibraryController::class, 'destroy']);
        Route::get('/library/items/{id}/download', [LibraryController::class, 'download']);
    });

    Route::post('/telemetry/events', [TelemetryController::class, 'store']);
    
    // Achievements
    Route::get('/achievements', [\App\Http\Controllers\Api\AchievementController::class, 'index']);
    
    // User Events
    Route::middleware('company_feature:events')->group(function () {
        Route::get('/events/my', [EventController::class, 'myEvents']);
        Route::post('/events/{id}/register', [EventController::class, 'register']);
        Route::post('/events/{id}/cancel-registration', [EventController::class, 'cancelRegistration']);
        Route::post('/events/{id}/mark-attendance', [EventController::class, 'markAttendance']);
        Route::post('/events/{id}/mark-replay-watched', [EventController::class, 'markReplayWatched']);
    });

    // Admin AI Assistant
    Route::post('/ai/extract-document', [\App\Http\Controllers\AIController::class, 'extractDocumentContext']);
    Route::post('/lessons/{lessonId}/tutor', [\App\Http\Controllers\AIController::class, 'studentTutor']);
    Route::post('/lessons/{lessonId}/study-tools', [\App\Http\Controllers\AIController::class, 'generateLessonStudyTool']);
});

// Backoffice Formely — operatori platformă (clienți, lead-uri, facturi)
Route::middleware([
    'auth:sanctum',
    'tenant',
    'platform_admin',
    'throttle:120,1',
])->prefix('platform')->group(function () {
    Route::get('/overview', [CompanyAdminController::class, 'overview']);
    Route::get('/plans', [CompanyAdminController::class, 'plans']);
    Route::get('/activity-logs', [CompanyAdminController::class, 'activityLogs']);
    Route::get('/companies', [CompanyAdminController::class, 'index']);
    Route::post('/companies', [CompanyAdminController::class, 'store']);
    Route::get('/companies/{id}', [CompanyAdminController::class, 'show']);
    Route::put('/companies/{id}', [CompanyAdminController::class, 'update']);
    Route::delete('/companies/{id}', [CompanyAdminController::class, 'destroy']);
    Route::post('/companies/{id}/invite-owner', [CompanyAdminController::class, 'sendOwnerInvite']);
    Route::get('/leads', [LeadAdminController::class, 'index']);
    Route::put('/leads/{id}', [LeadAdminController::class, 'update']);
    Route::post('/leads/{id}/convert', [LeadAdminController::class, 'convert']);
});

// Admin routes (require admin role) with rate limiting
Route::middleware([
    'auth:sanctum',
    'tenant',
    \App\Http\Middleware\StaffAreaAccessMiddleware::class,
    \App\Http\Middleware\AnalystReadOnlyMiddleware::class,
    \App\Http\Middleware\InstructorContentScopeMiddleware::class,
    'throttle:120,1',
])->prefix('admin')->group(function () { // admin | analyst (citire) | instructor (doar conținut)
    // Admin Dashboard
    Route::get('/dashboard', [DashboardAdminController::class, 'index']);
    Route::post('/alerts/dismiss', [\App\Http\Controllers\Api\Admin\AdminAlertController::class, 'dismiss']);

    // Courses Management
    Route::get('/courses', [CourseAdminController::class, 'index']);
    // Specific routes must come before parameterized routes
    Route::get('/courses/insights', [CourseAdminController::class, 'insights']);
    Route::get('/courses/teachers/list', [CourseAdminController::class, 'getTeachers']);
    Route::post('/courses/bulk-actions', [CourseAdminController::class, 'bulkAction']);
    Route::post('/courses/reorder', [CourseAdminController::class, 'reorderList']);
    // Parameterized routes
    Route::get('/courses/{id}', [CourseAdminController::class, 'show']);
    Route::post('/courses', [CourseAdminController::class, 'store']);
    // POST + FormData pentru imagine: PHP/Laravel parsează fișierele corect; PUT multipart e adesea gol
    Route::match(['put', 'post'], '/courses/{id}', [CourseAdminController::class, 'update']);
    Route::delete('/courses/{id}', [CourseAdminController::class, 'destroy']);
    Route::post('/courses/{id}/teams', [CourseAdminController::class, 'attachTeams']);
    Route::get('/courses/{id}/assignable-teams', [CourseAdminController::class, 'assignableTeams']);
    Route::get('/courses/{id}/assignable-learners', [CourseAdminController::class, 'assignableLearners']);
    Route::post('/courses/{id}/learners', [CourseAdminController::class, 'attachLearners']);
    Route::delete('/courses/{id}/learners/{userId}', [CourseAdminController::class, 'detachLearner']);
    Route::post('/courses/{id}/actions/{action}', [CourseAdminController::class, 'quickAction']);
    Route::post('/courses/{id}/modules/reorder', [CourseAdminController::class, 'reorderModules']);
    Route::get('/courses/{id}/preview', [CourseAdminController::class, 'preview']);

    // Course maps (folders to group courses)
    Route::get('/course-maps', [CourseMapAdminController::class, 'index']);
    Route::post('/course-maps/reorder', [CourseMapAdminController::class, 'reorderMaps']);
    Route::get('/course-maps/{id}', [CourseMapAdminController::class, 'show']);
    Route::post('/course-maps', [CourseMapAdminController::class, 'store']);
    Route::put('/course-maps/{id}', [CourseMapAdminController::class, 'update']);
    Route::delete('/course-maps/{id}', [CourseMapAdminController::class, 'destroy']);
    Route::post('/course-maps/{id}/cover', [CourseMapAdminController::class, 'uploadCover']);
    Route::delete('/course-maps/{id}/cover', [CourseMapAdminController::class, 'deleteCover']);
    Route::post('/course-maps/{id}/courses', [CourseMapAdminController::class, 'attachCourses']);
    Route::delete('/course-maps/{id}/courses/{courseId}', [CourseMapAdminController::class, 'detachCourse']);
    Route::post('/course-maps/{id}/courses/reorder', [CourseMapAdminController::class, 'reorderCourses']);

    // Media Library (Admin)
    Route::get('/media', [MediaAdminController::class, 'index']);
    Route::delete('/media/{id}', [MediaAdminController::class, 'destroy']);

    // Course Builder (Admin) - orchestration endpoints for autosave & drag&drop
    Route::prefix('/courses/{courseId}/builder')->group(function () {
        Route::get('/structure', [CourseBuilderController::class, 'structure']);
        Route::patch('/structure', [CourseBuilderController::class, 'patchStructure']);

        Route::post('/modules', [CourseBuilderController::class, 'createModule']);
        Route::post('/lessons', [CourseBuilderController::class, 'createLesson']);
        Route::put('/lessons/{lessonId}', [CourseBuilderController::class, 'updateLesson']);

        Route::post('/lessons/{lessonId}/content-blocks', [CourseBuilderController::class, 'createContentBlock']);
        Route::patch('/lessons/{lessonId}/content-blocks/reorder', [CourseBuilderController::class, 'reorderContentBlocks']);
        Route::put('/content-blocks/{blockId}', [CourseBuilderController::class, 'updateContentBlock']);
        Route::delete('/content-blocks/{blockId}', [CourseBuilderController::class, 'deleteContentBlock']);
        Route::post('/upload', [CourseBuilderController::class, 'uploadContentFile']);
        Route::get('/media/{mediaId}/file', [CourseBuilderController::class, 'serveMediaFile']);

        Route::post('/validate', [CourseBuilderController::class, 'validateCourse']);
        Route::post('/quality-audit', [CourseBuilderController::class, 'qualityAudit']);
        Route::post('/submit-for-review', [CourseBuilderController::class, 'submitForReview']);
        Route::post('/publish', [CourseBuilderController::class, 'publish']);
        Route::post('/clone', [CourseBuilderController::class, 'clone']);

        Route::get('/versions', [CourseBuilderController::class, 'versions']);
        Route::post('/versions/{versionId}/restore', [CourseBuilderController::class, 'restoreVersion']);

        Route::get('/tests', [CourseBuilderController::class, 'tests']);
        Route::post('/tests/attach', [CourseBuilderController::class, 'attachTest']);
        Route::post('/tests/{testId}/detach', [CourseBuilderController::class, 'detachTest']);
    });
    
    // Modules Management
    Route::get('/modules', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'index']);
    Route::get('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'show']);
    Route::post('/modules', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'store']);
    Route::put('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'update']);
    Route::delete('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'destroy']);
    Route::post('/modules/{id}/toggle-lock', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'toggleLock']);
    
    // Lessons Management
    Route::get('/lessons', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'index']);
    Route::get('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'show']);
    Route::post('/lessons', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'store']);
    Route::put('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'update']);
    Route::delete('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'destroy']);
    Route::post('/modules/{moduleId}/lessons/reorder', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'reorder']);
    
    // Exams Management (rute fixe înainte de {id})
    Route::get('/exams', [ExamAdminController::class, 'index']);
    Route::get('/exams/pending-reviews', [ExamAdminController::class, 'getPendingReviews']);
    Route::post('/exams/pending-reviews/clear', [ExamAdminController::class, 'clearPendingReviews']);
    Route::get('/exams/{id}', [ExamAdminController::class, 'show']);
    Route::get('/exams/{id}/preview', [ExamAdminController::class, 'preview']);
    Route::get('/exams/{id}/results', [ExamAdminController::class, 'results']);
    Route::get('/exams/{id}/question-analytics', [ExamAdminController::class, 'questionAnalytics']);
    Route::post('/exams', [ExamAdminController::class, 'store']);
    Route::patch('/exams/{id}/status', [ExamAdminController::class, 'patchStatus']);
    Route::put('/exams/{id}', [ExamAdminController::class, 'update']);
    Route::post('/exams/{id}/cover', [ExamAdminController::class, 'uploadCover']);
    Route::post('/exams/{id}/duplicate', [ExamAdminController::class, 'duplicate']);
    Route::delete('/exams/{id}', [ExamAdminController::class, 'destroy']);
    
    // Tests Management (Standalone Test Builder)
    Route::get('/tests', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'index']);
    Route::get('/tests/pending-reviews', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'getPendingReviews']);
    Route::post('/tests/pending-reviews/clear', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'clearPendingReviews']);
    Route::get('/test-results/export', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'exportResultsCsv']);
    Route::get('/tests/{id}/results/export', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'exportTestResultsCsv']);
    Route::get('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'show']);
    Route::get('/tests/{id}/results', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'results']);
    Route::get('/tests/{id}/statistics', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'statisticsSummary']);
    Route::patch('/test-results/{id}/score', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'updateResultScore']);
    Route::get('/test-results/{id}/breakdown', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'resultBreakdown']);
    Route::get('/tests/{id}/question-analytics', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'questionAnalytics']);
    Route::post('/tests', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'store']);
    Route::put('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'update']);
    Route::delete('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'destroy']);
    Route::post('/tests/{id}/publish', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'publish']);
    Route::post('/tests/{id}/promote-to-exam', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'promoteToStandaloneExam']);
    Route::post('/tests/{id}/selection-preview', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'selectionPreview']);
    Route::get('/tests/{id}/questions', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'getQuestions']);
    Route::post('/tests/{id}/questions', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'addQuestion']);
    Route::post('/tests/{id}/questions/reorder', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'reorderQuestions']);
    Route::get('/questions', [QuestionAdminController::class, 'index']);
    Route::get('/question-catalog/maps', [QuestionCatalogAdminController::class, 'maps']);
    Route::get('/question-catalog/maps/{mapId}/tests', [QuestionCatalogAdminController::class, 'tests']);
    Route::get('/questions/tag-suggestions', [QuestionAdminController::class, 'tagSuggestions']);
    Route::post('/questions/bulk-move', [QuestionAdminController::class, 'bulkMove']);
    Route::post('/questions/{id}/toggle-star', [QuestionAdminController::class, 'toggleStar']);
    Route::put('/questions/{id}', [QuestionAdminController::class, 'update']);
    Route::delete('/questions/{id}', [QuestionAdminController::class, 'destroy']);
    Route::post('/questions/{id}/improve', [QuestionAdminController::class, 'improveWithAi']);
    Route::post('/questions/{id}/auto-tag', [QuestionAdminController::class, 'autoTagWithAi']);
    Route::post('/tests/{id}/link-to-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'linkToCourse']);
    Route::post('/tests/{id}/unlink-from-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'unlinkFromCourse']);
    Route::post('/tests/ai/suggest-blueprint-from-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'suggestBlueprintFromCourse']);
    Route::post('/tests/ai/preview-from-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'previewFromCourse']);
    Route::post('/tests/ai/regenerate-question-from-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'regenerateQuestionFromCourse']);
    Route::post('/tests/ai/create-from-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'createFromCourse']);
    Route::post('/test-results/{id}/feedback-with-ai', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'suggestManualReviewFeedback']);
    
    // Question Banks Management
    Route::get('/question-banks', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'index']);
    Route::get('/question-banks/{id}', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'show']);
    Route::post('/question-banks', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'store']);
    Route::put('/question-banks/{id}', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'update']);
    Route::delete('/question-banks/{id}', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'destroy']);
    Route::get('/question-banks/{id}/questions', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'getQuestions']);
    Route::post('/question-banks/{id}/questions', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'addQuestion']);
    Route::post('/question-banks/{id}/questions/bulk', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'addQuestions']);
    Route::put('/question-banks/{id}/questions/{questionId}', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'updateQuestion']);
    Route::delete('/question-banks/{id}/questions/{questionId}', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'removeQuestion']);
    Route::post('/question-banks/{id}/questions/reorder', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'reorderQuestions']);
    Route::post('/question-banks/{id}/ai/preview', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'previewAiQuestions']);
    Route::post('/question-banks/{id}/generate-from-course', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'generateFromCourse']);
    Route::post('/question-banks/{id}/generate-from-text', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'generateFromText']);
    
    // Events Management
    Route::middleware('company_feature:events')->group(function () {
        Route::get('/events', [EventAdminController::class, 'index']);
        Route::get('/events/insights', [EventAdminController::class, 'insights']);
        Route::get('/events/instructors/list', [EventAdminController::class, 'getInstructors']);
        Route::post('/events/bulk-actions', [EventAdminController::class, 'bulkAction']);
        Route::get('/events/{id}', [EventAdminController::class, 'show']);
        Route::post('/events', [EventAdminController::class, 'store']);
        Route::put('/events/{id}', [EventAdminController::class, 'update']);
        Route::delete('/events/{id}', [EventAdminController::class, 'destroy']);
        Route::post('/events/{id}/actions/{action}', [EventAdminController::class, 'quickAction']);
        Route::put('/events/{id}/participants/{userId}/attendance', [EventAdminController::class, 'updateParticipantAttendance']);
    });
    
    // Organization: departments + teams
    Route::get('/departments', [DepartmentAdminController::class, 'index']);
    Route::get('/organization', [DepartmentAdminController::class, 'tree']);
    Route::post('/departments', [DepartmentAdminController::class, 'store']);
    Route::put('/departments/{id}', [DepartmentAdminController::class, 'update']);
    Route::delete('/departments/{id}', [DepartmentAdminController::class, 'destroy']);
    Route::post('/departments/reorder', [DepartmentAdminController::class, 'reorder']);

    // Teams Management
    Route::get('/teams', [TeamAdminController::class, 'index']);
    Route::post('/teams/reorder', [TeamAdminController::class, 'reorderTeams']);
    Route::get('/teams/{id}', [TeamAdminController::class, 'show']);
    Route::post('/teams', [TeamAdminController::class, 'store']);
    Route::put('/teams/{id}', [TeamAdminController::class, 'update']);
    Route::delete('/teams/{id}', [TeamAdminController::class, 'destroy']);
    Route::post('/teams/{id}/users', [TeamAdminController::class, 'attachUsers']);
    Route::post('/teams/{id}/users/{userId}/courses/attach', [TeamAdminController::class, 'attachMemberCourses']);
    Route::post('/teams/{id}/courses', [TeamAdminController::class, 'attachCourses']);
    
    // Users Management
    Route::get('/users/invitations', [UserInvitationAdminController::class, 'index']);
    Route::post('/users/invitations', [UserInvitationAdminController::class, 'store']);
    Route::post('/users/invitations/{id}/resend', [UserInvitationAdminController::class, 'resend']);
    Route::post('/users/invitations/{id}/copy-link', [UserInvitationAdminController::class, 'copyLink']);
    Route::delete('/users/invitations/{id}', [UserInvitationAdminController::class, 'destroy']);
    Route::get('/users', [UserAdminController::class, 'index']);
    Route::get('/users/{id}', [UserAdminController::class, 'show']);
    Route::post('/users', [UserAdminController::class, 'store']);
    Route::put('/users/{id}', [UserAdminController::class, 'update']);
    Route::delete('/users/{id}/force', [UserAdminController::class, 'forceDestroy']);
    Route::delete('/users/{id}', [UserAdminController::class, 'destroy']);
    Route::post('/users/{id}/restore', [UserAdminController::class, 'restore']);
    Route::post('/users/{id}/approve', [UserAdminController::class, 'approve']);
    Route::post('/users/{id}/reject', [UserAdminController::class, 'reject']);
    Route::post('/users/{id}/activate', [UserAdminController::class, 'activate']);
    Route::post('/users/{id}/deactivate', [UserAdminController::class, 'deactivate']);
    Route::post('/users/{id}/courses', [UserAdminController::class, 'assignCourses']);
    Route::post('/users/{id}/courses/{courseId}/complete', [UserAdminController::class, 'markCourseCompleted']);
    Route::post('/users/{id}/tests/{testId}/extra-attempt', [UserAdminController::class, 'grantTestExtraAttempt']);
    Route::delete('/users/{id}/courses/{courseId}', [UserAdminController::class, 'removeCourse']);
    
    // Team Members Management
    Route::get('/team-members', [UserAdminController::class, 'getTeamMembers']);
    Route::put('/team-members/{id}/role-permissions', [UserAdminController::class, 'updateRoleAndPermissions']);
    Route::post('/team-members/{id}/activate', [UserAdminController::class, 'activate']);
    Route::post('/team-members/{id}/suspend', [UserAdminController::class, 'suspend']);
    Route::post('/team-members/{id}/reset-access', [UserAdminController::class, 'resetAccess']);
    Route::post('/team-members/{id}/remove-from-team', [UserAdminController::class, 'removeFromTeam']);
    
    
    // Statistici (doar admin)
    Route::get('/statistics/course-test-detail', [StatisticsAdminController::class, 'courseTestDetail']);
    Route::get('/statistics/ai-export/datasets', [AIExportAdminController::class, 'datasets']);
    Route::post('/statistics/ai-export', [AIExportAdminController::class, 'generate']);

    // Activity Logs
    Route::get('/activity-logs', [ActivityLogAdminController::class, 'index']);
    Route::get('/activity-logs/{id}', [ActivityLogAdminController::class, 'show']);
    
    // Exam Manual Review (legacy Exam model)
    Route::post('/exam-results/{id}/manual-review', [ExamAdminController::class, 'submitManualReview']);

    // Test Manual Review (Test model - standalone tests)
    Route::post('/test-results/{id}/manual-review', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'submitManualReview']);
    
    // Company branding (tenant)
    Route::get('/company/branding', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'showMine']);
    Route::put('/company/branding', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'update']);
    Route::post('/company/branding/logo', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'uploadLogo']);
    Route::delete('/company/branding/logo', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'deleteLogo']);
    Route::get('/company/entitlements', function (\Illuminate\Http\Request $request) {
        $user = $request->user();
        if (! $user?->company_id) {
            return response()->json(['entitlements' => null]);
        }
        $company = \App\Models\Company::withoutGlobalScopes()->find($user->company_id);
        if (! $company) {
            return response()->json(['entitlements' => null]);
        }

        return response()->json([
            'entitlements' => app(\App\Services\PlanEntitlementService::class)->entitlementsPayload($company),
        ]);
    });

    // Platform console (legacy path — backoffice folosește /api/platform)
    Route::middleware('super_admin')->prefix('platform')->group(function () {
        Route::get('/overview', [CompanyAdminController::class, 'overview']);
        Route::get('/plans', [CompanyAdminController::class, 'plans']);
        Route::get('/activity-logs', [CompanyAdminController::class, 'activityLogs']);
        Route::get('/companies', [CompanyAdminController::class, 'index']);
        Route::post('/companies', [CompanyAdminController::class, 'store']);
        Route::get('/companies/{id}', [CompanyAdminController::class, 'show']);
        Route::put('/companies/{id}', [CompanyAdminController::class, 'update']);
        Route::delete('/companies/{id}', [CompanyAdminController::class, 'destroy']);
        Route::post('/companies/{id}/invite-owner', [CompanyAdminController::class, 'sendOwnerInvite']);
        Route::get('/leads', [LeadAdminController::class, 'index']);
        Route::put('/leads/{id}', [LeadAdminController::class, 'update']);
        Route::post('/leads/{id}/convert', [LeadAdminController::class, 'convert']);
    });

    // Admin Settings
    Route::get('/settings', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'index']);
    Route::get('/settings/{key}', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'show']);
    Route::put('/settings', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'update']);
    
    // Admin System
    Route::get('/export', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'export']);
    Route::post('/system/clear-cache', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'clearCache']);
    Route::post('/import', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'importBackup']);
    
    // AI Generation routes (Hugging Face)
    Route::post('/ai/generate-course', [\App\Http\Controllers\AIController::class, 'generateCourse']);
    Route::post('/ai/generate-test', [\App\Http\Controllers\AIController::class, 'generateTest']);
});

