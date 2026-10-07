<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\CourseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\RegistrationInvitationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\TelemetryController;
use App\Http\Controllers\Api\Admin\CourseAdminController;
use App\Http\Controllers\Api\Admin\CourseBuilderController;
use App\Http\Controllers\Api\Admin\QuestionAdminController;
use App\Http\Controllers\Api\Admin\QuestionCatalogAdminController;
use App\Http\Controllers\Api\Admin\ExamAdminController;
use App\Http\Controllers\Api\Admin\EventAdminController;
use App\Http\Controllers\Api\Admin\DashboardAdminController;
use App\Http\Controllers\Api\Admin\TeamAdminController;
use App\Http\Controllers\Api\Admin\UserAdminController;
use App\Http\Controllers\Api\Admin\RegistrationInvitationAdminController;
use App\Http\Controllers\Api\Admin\ActivityLogAdminController;
use App\Http\Controllers\Api\Admin\MediaAdminController;
use App\Http\Controllers\Api\Admin\CourseMapAdminController;
use App\Http\Controllers\Api\Admin\StatisticsAdminController;
use App\Http\Controllers\Api\LibraryController;
use App\Http\Controllers\Api\Admin\CompanyAdminController;
use App\Http\Controllers\Api\Admin\LeadAdminController;
use App\Http\Controllers\Api\Admin\SiteStatsController;
use App\Http\Controllers\Api\CompanyBrandingController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\SiteEventController;

/*
| Fără StartSession / Sanctum stateful — util pe VPS dacă sesiunile DB lipsesc și tot API-ul dă 500.
| GET /api/health → dacă răspunde 200, PHP + rutele merg; dacă 500, verifică DB / .env în container.
*/
Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
    } catch (\Throwable $e) {
        $expose = config('app.debug') || config('app.expose_api_errors');
        return response()->json([
            'ok' => false,
            'database' => 'error',
            'message' => $expose ? $e->getMessage() : 'Database connection failed.',
        ], 500);
    }

    return response()->json([
        'ok' => true,
        'database' => 'connected',
        'session_driver' => config('session.driver'),
        'session_secure' => config('session.secure'),
        'session_same_site' => config('session.same_site'),
        'session_domain' => config('session.domain'),
        'app_url' => config('app.url'),
        'sanctum_stateful' => config('sanctum.stateful'),
        'cache_store' => config('cache.default'),
    ]);
})->withoutMiddleware([
    \App\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
]);

// Public routes – throttle to prevent abuse (e.g. scraping, DoS)
// tenant.optional: vizitatorul vede doar compania implicită, utilizatorul autentificat doar academia lui.
Route::middleware(['throttle:120,1', 'tenant.optional'])->group(function () {
    Route::get('/courses', [CourseController::class, 'index']);
    Route::get('/courses/{id}', [CourseController::class, 'show'])->whereNumber('id');
    Route::get('/lessons/{id}', [\App\Http\Controllers\Api\LessonController::class, 'show']);
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/{id}', [EventController::class, 'show'])->whereNumber('id');
    Route::get('/builder-media/{courseId}/{mediaId}', [CourseBuilderController::class, 'serveMediaFilePublic']);
});

// CSRF cookie pentru SPA: Sanctum (EnsureFrontendRequestsAreStateful) aplică deja EncryptCookies,
// StartSession și VerifyCsrfToken pentru Origin/Referer din config('sanctum.stateful').
// Nu folosi middleware('web') aici — se suprapune peste stack-ul API și poate produce 500 (sesiune dublă).
Route::get('/csrf-cookie', function (Request $request) {
    return response()->json([
        'message' => 'CSRF cookie set',
        'token' => $request->hasSession() ? $request->session()->token() : null,
    ]);
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
Route::get('/auth/invitations/{token}', [RegistrationInvitationController::class, 'show'])->middleware('throttle:60,1');
Route::post('/auth/invitations/{token}/accept', [RegistrationInvitationController::class, 'accept'])->middleware('throttle:15,1');
Route::post('/auth/login', [\App\Http\Controllers\Api\AuthController::class, 'login'])->middleware('throttle:15,1'); // 15 attempts per minute

// Formely SaaS — publice (site de marketing, branding la login)
Route::get('/branding/{slug}', [CompanyBrandingController::class, 'showBySlug'])->middleware('throttle:60,1');
Route::post('/leads', [LeadController::class, 'store'])->middleware('throttle:10,1');
Route::post('/track', [SiteEventController::class, 'store'])->middleware('throttle:60,1');
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
// Fără account.active: un cont suspendat / în așteptare trebuie să-și poată închide sesiunea.
Route::post('/auth/logout', [\App\Http\Controllers\Api\AuthController::class, 'logout'])->middleware(['auth:sanctum', 'tenant']);
Route::get('/auth/me', [\App\Http\Controllers\Api\AuthController::class, 'me'])->middleware(['auth:sanctum', 'account.active', 'tenant']);
Route::post('/auth/change-password', [\App\Http\Controllers\Api\AuthController::class, 'changePassword'])->middleware(['auth:sanctum', 'account.active', 'tenant', 'throttle:60,1']);


// Protected routes (require authentication) with rate limiting
Route::middleware(['auth:sanctum', 'account.active', 'tenant', 'throttle:api-app'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/profile', [ProfileController::class, 'index']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'removeAvatar']);
    // Lesson completion removed - we use modules now, course completion is through quiz passing
    
    // Student Dashboard
    Route::get('/student/dashboard', [\App\Http\Controllers\Api\StudentDashboardController::class, 'index']);
    Route::get('/student/activity', [\App\Http\Controllers\Api\StudentActivityController::class, 'index']);

    // In-app notifications (persisted)
    Route::get('/notifications/unread-count', [\App\Http\Controllers\Api\NotificationController::class, 'unreadCount']);
    Route::post('/notifications/mark-all-read', [\App\Http\Controllers\Api\NotificationController::class, 'markAllRead']);
    Route::get('/notifications', [\App\Http\Controllers\Api\NotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read', [\App\Http\Controllers\Api\NotificationController::class, 'markRead']);
    
    // Course Progress
    Route::get('/courses/standalone', [CourseController::class, 'learnerStandaloneCourses']);
    Route::get('/courses/{courseId}/progress', [\App\Http\Controllers\Api\CourseProgressController::class, 'getCourseProgress']);
    Route::post('/courses/{courseId}/finish', [\App\Http\Controllers\Api\CourseProgressController::class, 'finishCourse']);
    Route::post('/lessons/{lessonId}/complete', [\App\Http\Controllers\Api\CourseProgressController::class, 'completeLesson']);
    Route::put('/lessons/{lessonId}/progress', [\App\Http\Controllers\Api\CourseProgressController::class, 'updateLessonProgress']);
    Route::post('/lessons/{lessonId}/study-tools', [\App\Http\Controllers\AIController::class, 'generateLessonStudyTool'])->middleware(['volt', 'company_feature:ai_tutor']);

    // Course maps (student: list and show map with published courses)
    Route::get('/course-maps', [\App\Http\Controllers\Api\CourseMapController::class, 'index']);
    Route::get('/course-maps/{id}', [\App\Http\Controllers\Api\CourseMapController::class, 'show']);
    
    // Exam endpoints (lista fără curs înainte de {examId})
    Route::get('/exams', [\App\Http\Controllers\Api\ExamController::class, 'learnerStandaloneExams']);
    Route::get('/exams/{examId}', [\App\Http\Controllers\Api\ExamController::class, 'show']);
    Route::post('/exams/{examId}/progress', [\App\Http\Controllers\Api\ExamController::class, 'saveProgress']);
    Route::post('/exams/{examId}/submit', [\App\Http\Controllers\Api\ExamController::class, 'submit']);
    
    // Exam Results
    Route::get('/exam-results', [\App\Http\Controllers\Api\ExamResultController::class, 'index']);
    Route::get('/exam-results/{id}', [\App\Http\Controllers\Api\ExamResultController::class, 'show']);

    // Bibliotecă materiale (cărți, PDF-uri etc.) — listare & descărcare toți utilizatorii autentificați
    Route::middleware('company_feature:library')->group(function () {
        Route::get('/library/items', [LibraryController::class, 'index']);
        Route::get('/library/items/{id}', [LibraryController::class, 'show']);
        Route::post('/library/items', [LibraryController::class, 'store']);
        Route::post('/library/images', [LibraryController::class, 'uploadImage']);
        Route::put('/library/items/{id}', [LibraryController::class, 'update']);
        Route::post('/library/items/{id}', [LibraryController::class, 'update']);
        Route::delete('/library/items/{id}', [LibraryController::class, 'destroy']);
        Route::get('/library/items/{id}/download', [LibraryController::class, 'download']);
    });

    // Ghiduri — linkuri utile (listare toți utilizatorii autentificați)
    Route::get('/guides/items', [\App\Http\Controllers\Api\GuideController::class, 'index']);
    Route::post('/guides/items', [\App\Http\Controllers\Api\GuideController::class, 'store']);
    Route::post('/guides/items/{id}', [\App\Http\Controllers\Api\GuideController::class, 'update']);
    Route::delete('/guides/items/{id}', [\App\Http\Controllers\Api\GuideController::class, 'destroy']);

    Route::post('/telemetry/events', [TelemetryController::class, 'store']);
    
    // Achievements
    Route::get('/achievements', [\App\Http\Controllers\Api\AchievementController::class, 'index']);
    
    // User Events
    Route::middleware('company_feature:events')->group(function () {
        Route::post('/events/{id}/register', [EventController::class, 'register'])->whereNumber('id');
        Route::post('/events/{id}/cancel-registration', [EventController::class, 'cancelRegistration'])->whereNumber('id');
    });

    // Admin AI Assistant
    Route::post('/ai/extract-document', [\App\Http\Controllers\AIController::class, 'extractDocumentContext'])->middleware(['volt', 'company_feature:ai_creator']);
});

// Backoffice Formely — operatori platformă (clienți, lead-uri)
Route::middleware([
    'auth:sanctum',
    'account.active',
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
    Route::get('/site-stats', [SiteStatsController::class, 'index']);
});

// Admin routes (require admin role) with rate limiting
Route::middleware([
    'auth:sanctum',
    'account.active',
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
    Route::post('/courses/{id}/modules/reorder', [CourseAdminController::class, 'reorderModules']);

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

        Route::post('/upload', [CourseBuilderController::class, 'uploadContentFile']);
        Route::get('/media/{mediaId}/file', [CourseBuilderController::class, 'serveMediaFile']);

        Route::post('/validate', [CourseBuilderController::class, 'validateCourse']);
        Route::post('/quality-audit', [CourseBuilderController::class, 'qualityAudit']);
        Route::post('/publish', [CourseBuilderController::class, 'publish']);
        Route::post('/clone', [CourseBuilderController::class, 'clone']);


        Route::get('/tests', [CourseBuilderController::class, 'tests']);
        Route::post('/tests/attach', [CourseBuilderController::class, 'attachTest']);
        Route::post('/tests/{testId}/detach', [CourseBuilderController::class, 'detachTest']);
    });
    
    // Modules Management
    Route::get('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'show']);
    Route::post('/modules', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'store']);
    Route::put('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'update']);
    Route::delete('/modules/{id}', [\App\Http\Controllers\Api\Admin\ModuleAdminController::class, 'destroy']);
    
    // Lessons Management
    Route::get('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'show']);
    Route::post('/lessons', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'store']);
    Route::put('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'update']);
    Route::delete('/lessons/{id}', [\App\Http\Controllers\Api\Admin\LessonAdminController::class, 'destroy']);
    
    // Exams Management (rute fixe înainte de {id})
    Route::get('/exams', [ExamAdminController::class, 'index']);
    Route::get('/exams/pending-reviews', [ExamAdminController::class, 'getPendingReviews']);
    Route::get('/exams/pending-reviews/count', [ExamAdminController::class, 'pendingReviewsCount']);
    Route::post('/exams/pending-reviews/clear', [ExamAdminController::class, 'clearPendingReviews']);
    Route::get('/exams/{id}', [ExamAdminController::class, 'show']);
    Route::get('/exams/{id}/preview', [ExamAdminController::class, 'preview']);
    Route::get('/exams/{id}/results', [ExamAdminController::class, 'results']);
    Route::get('/exams/{id}/question-analytics', [ExamAdminController::class, 'questionAnalytics']);
    Route::post('/exams', [ExamAdminController::class, 'store']);
    Route::patch('/exams/{id}/status', [ExamAdminController::class, 'patchStatus']);
    Route::put('/exams/{id}', [ExamAdminController::class, 'update']);
    Route::post('/exams/{id}/duplicate', [ExamAdminController::class, 'duplicate']);
    Route::delete('/exams/{id}', [ExamAdminController::class, 'destroy']);
    
    // Tests Management (Standalone Test Builder)
    Route::get('/tests', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'index']);
    Route::get('/tests/pending-reviews', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'getPendingReviews']);
    Route::get('/tests/pending-reviews/count', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'pendingReviewsCount']);
    Route::post('/tests/pending-reviews/clear', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'clearPendingReviews']);
    Route::get('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'show']);
    Route::post('/tests', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'store']);
    Route::put('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'update']);
    Route::delete('/tests/{id}', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'destroy']);
    Route::get('/tests/{id}/results', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'results']);
    Route::get('/tests/{id}/statistics', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'statisticsSummary']);
    Route::get('/tests/{id}/question-analytics', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'questionAnalytics']);
    Route::post('/tests/{id}/publish', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'publish']);
    Route::get('/tests/{id}/questions', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'getQuestions']);
    Route::post('/tests/{id}/questions', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'addQuestion']);
    Route::get('/questions', [QuestionAdminController::class, 'index']);
    Route::get('/question-catalog/maps', [QuestionCatalogAdminController::class, 'maps']);
    Route::get('/question-catalog/maps/{mapId}/tests', [QuestionCatalogAdminController::class, 'tests']);
    Route::post('/questions/bulk-move', [QuestionAdminController::class, 'bulkMove']);
    Route::post('/questions/{id}/toggle-star', [QuestionAdminController::class, 'toggleStar']);
    Route::put('/questions/{id}', [QuestionAdminController::class, 'update']);
    Route::delete('/questions/{id}', [QuestionAdminController::class, 'destroy']);
    Route::post('/tests/{id}/link-to-course', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'linkToCourse']);
    
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
    Route::middleware(['volt', 'company_feature:ai_test_generation'])->post('/question-banks/{id}/ai/preview', [\App\Http\Controllers\Api\Admin\QuestionBankAdminController::class, 'previewAiQuestions']);
    
    // Events Management
    Route::middleware('company_feature:events')->group(function () {
        Route::get('/events', [EventAdminController::class, 'index']);
        Route::get('/events/{id}', [EventAdminController::class, 'show']);
        Route::post('/events', [EventAdminController::class, 'store']);
        Route::put('/events/{id}', [EventAdminController::class, 'update']);
        Route::delete('/events/{id}', [EventAdminController::class, 'destroy']);
        Route::put('/events/{id}/participants/{userId}/attendance', [EventAdminController::class, 'updateParticipantAttendance']);
    });
    
    // Teams Management
    Route::get('/teams', [TeamAdminController::class, 'index']);
    Route::post('/teams/reorder', [TeamAdminController::class, 'reorderTeams']);
    Route::post('/teams', [TeamAdminController::class, 'store']);
    Route::put('/teams/{id}', [TeamAdminController::class, 'update']);
    Route::delete('/teams/{id}', [TeamAdminController::class, 'destroy']);
    Route::post('/teams/{id}/users', [TeamAdminController::class, 'attachUsers']);
    Route::post('/teams/{id}/users/{userId}/courses/attach', [TeamAdminController::class, 'attachMemberCourses']);
    Route::post('/teams/{id}/courses', [TeamAdminController::class, 'attachCourses']);
    
    // Users Management
    Route::get('/users', [UserAdminController::class, 'index']);
    Route::get('/users/invitations', [RegistrationInvitationAdminController::class, 'index']);
    Route::post('/users/invitations', [RegistrationInvitationAdminController::class, 'store']);
    Route::post('/users/invitations/{id}/resend', [RegistrationInvitationAdminController::class, 'resend']);
    Route::post('/users/invitations/{id}/copy-link', [RegistrationInvitationAdminController::class, 'copyLink']);
    Route::delete('/users/invitations/{id}', [RegistrationInvitationAdminController::class, 'destroy']);
    Route::get('/users/{id}', [UserAdminController::class, 'show']);
    Route::post('/users', [UserAdminController::class, 'store']);
    Route::put('/users/{id}', [UserAdminController::class, 'update']);
    Route::delete('/users/{id}', [UserAdminController::class, 'destroy']);
    Route::post('/users/{id}/restore', [UserAdminController::class, 'restore']);
    Route::delete('/users/{id}/force', [UserAdminController::class, 'forceDestroy']);
    Route::post('/users/{id}/send-invitation', [UserAdminController::class, 'sendInvitation'])->middleware('throttle:6,1');
    Route::post('/users/{id}/approve', [UserAdminController::class, 'approve']);
    Route::post('/users/{id}/reject', [UserAdminController::class, 'reject']);
    Route::post('/users/{id}/courses/{courseId}/complete', [UserAdminController::class, 'markCourseCompleted']);
    Route::post('/users/{id}/tests/{testId}/extra-attempt', [UserAdminController::class, 'grantTestExtraAttempt']);
    Route::delete('/users/{id}/courses/{courseId}', [UserAdminController::class, 'removeCourse']);
    
    // Suspendare, reactivare și resetare acces (orice utilizator; doar admin)
    Route::post('/users/{id}/activate', [UserAdminController::class, 'activate']);
    Route::post('/users/{id}/suspend', [UserAdminController::class, 'suspend']);
    Route::post('/users/{id}/reset-access', [UserAdminController::class, 'resetAccess']);
    
    
    // Statistici (doar admin)
    Route::get('/statistics/course-test-detail', [StatisticsAdminController::class, 'courseTestDetail']);
    Route::post('/statistics/ai-export', [\App\Http\Controllers\Api\Admin\AIExportAdminController::class, 'generate'])->middleware(['volt', 'company_feature:ai_stats']);

    // Activity Logs
    Route::get('/activity-logs', [ActivityLogAdminController::class, 'index']);
    
    // Exam Manual Review (legacy Exam model)
    Route::post('/exam-results/{id}/manual-review', [ExamAdminController::class, 'submitManualReview']);
    Route::patch('/exam-results/{id}/score', [ExamAdminController::class, 'updateResultScore']);

    // Test Manual Review (Test model - standalone tests)
    Route::post('/test-results/{id}/feedback-with-volt', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'suggestManualReviewFeedback'])->middleware(['volt', 'company_feature:ai_test_generation']);
    Route::post('/test-results/{id}/manual-review', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'submitManualReview']);
    Route::patch('/test-results/{id}/score', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'updateResultScore']);
    Route::get('/test-results/{id}/breakdown', [\App\Http\Controllers\Api\Admin\TestAdminController::class, 'resultBreakdown']);
    
    // Admin Settings
    Route::get('/settings', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'index']);
    Route::put('/settings', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'update']);
    
    // Admin System
    Route::get('/export', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'export']);
    Route::post('/system/clear-cache', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'clearCache'])->middleware('platform.only');
    Route::post('/import', [\App\Http\Controllers\Api\Admin\SettingsController::class, 'importBackup'])->middleware('platform.only');

    // Formely: branding și planul academiei
    Route::get('/company/branding', [CompanyBrandingController::class, 'showMine']);
    Route::put('/company/branding', [CompanyBrandingController::class, 'update']);
    Route::post('/company/branding/logo', [CompanyBrandingController::class, 'uploadLogo']);
    Route::delete('/company/branding/logo', [CompanyBrandingController::class, 'deleteLogo']);
    Route::get('/company/entitlements', function (\Illuminate\Http\Request $request) {
        $company = $request->user()?->company_id
            ? \App\Models\Company::query()->find($request->user()->company_id)
            : null;

        return response()->json([
            'entitlements' => $company
                ? app(\App\Services\PlanEntitlementService::class)->entitlementsPayload($company)
                : null,
        ]);
    });
    
    // AI Generation routes (Hugging Face)
    Route::post('/ai/generate-course', [\App\Http\Controllers\AIController::class, 'generateCourse'])->middleware('volt');
    Route::post('/ai/generate-test', [\App\Http\Controllers\AIController::class, 'generateTest'])->middleware(['volt', 'company_feature:ai_test_generation']);
});

