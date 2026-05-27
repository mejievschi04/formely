<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Exam;
use App\Models\Module;
use App\Models\User;
use App\Models\Event;
use App\Models\Lesson;
use App\Models\Team;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Support\StudentSessionLogger;
use App\Models\Question;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Http\Request;
use Carbon\Carbon;

class DashboardAdminController extends Controller
{
    public function index(Request $request)
    {
        try {
            $period = $request->get('period', 'month');
            $dateRange = $this->getDateRange($period);

            // KPIs
            $kpis = $this->calculateKPIs($dateRange);

            // Chart Data
            $chartData = $this->getChartData($dateRange);

            // Top Courses
            $topCourses = $this->getTopCourses($dateRange);

            // Problematic Courses
            $problematicCourses = $this->getProblematicCourses();

            // Learning Funnel (real data from course_user)
            $learningFunnel = $this->getLearningFunnel();

            // User Segments (real data)
            $userSegments = $this->getUserSegments($dateRange);

            // Recent Activities
            $recentActivities = $this->getRecentActivities();

            // Alerts
            $alerts = $this->getAlerts();
            if ($request->user()) {
                $alerts = \App\Http\Controllers\Api\Admin\AdminAlertController::filterDismissed(
                    $alerts,
                    (int) $request->user()->id
                );
            }

            // Stored notifications for current user (admin)
            $storedNotifications = [];
            if ($request->user()) {
                $storedNotifications = Notification::where('user_id', $request->user()->id)
                    ->whereNull('read_at')
                    ->orderByDesc('created_at')
                    ->take(20)
                    ->get()
                    ->map(fn ($n) => [
                        'id' => $n->id,
                        'type' => $n->type,
                        'title' => $n->title,
                        'description' => $n->description,
                        'action_url' => $n->action_url,
                        'severity' => $n->severity,
                        'created_at' => $n->created_at?->toISOString(),
                    ])
                    ->all();
            }

            // Notifications = stored + dashboard alerts (warning/info)
            $notifications = array_merge($storedNotifications, $alerts);
            usort($notifications, fn($a, $b) => strtotime($b['created_at'] ?? 0) - strtotime($a['created_at'] ?? 0));

            // Average test completion percentage across all students
            $avgTestCompletionPercentage = $this->getAvgTestCompletionPercentage();

            // Statistici cursuri și teste (admin: toate; instructor: doar ale lui)
            $userCacheScope = (int)($request->user()?->id ?? 0);
            $courseTestStats = Cache::remember(
                "dashboard:course_test_stats:{$userCacheScope}",
                180,
                fn () => $this->getCourseAndTestStats($request)
            );
            $telemetryKpis = Cache::remember(
                'dashboard:telemetry_kpis:' . $dateRange['start']->format('YmdHi') . ':' . $dateRange['end']->format('YmdHi'),
                300,
                fn () => $this->getTelemetryKpis($dateRange)
            );

            $hourlyActivity = Cache::remember(
                'dashboard:hourly_sessions:v5:' . $dateRange['start']->format('YmdHi') . ':' . $dateRange['end']->format('YmdHi'),
                300,
                fn () => $this->getHourlyActivity($dateRange)
            );

            return response()->json([
                'kpis' => $kpis,
                'chart_data' => $chartData,
                'hourly_activity' => $hourlyActivity,
                'engagement_metrics' => [
                    'avg_test_completion_percentage' => $avgTestCompletionPercentage,
                ],
                'telemetry_kpis' => $telemetryKpis,
                'course_test_stats' => $courseTestStats,
                'learning_funnel' => $learningFunnel,
                'user_segments' => $userSegments,
                'top_courses' => $topCourses,
                'problematic_courses' => $problematicCourses,
                'recent_activities' => $recentActivities,
                'alerts' => $alerts,
                'notifications' => array_values($notifications),
                'integrations' => $this->getIntegrationsMeta(),
            ]);
        } catch (\Exception $e) {
            \Log::error('Admin Dashboard Error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Error loading dashboard data',
                'message' => config('app.debug') ? $e->getMessage() : 'An error occurred',
            ], 500);
        }
    }

    private function getDateRange($period)
    {
        $now = Carbon::now();

        switch ($period) {
            case '7d':
            case '14d':
            case '30d':
            case '90d':
                $days = (int) str_replace('d', '', $period);

                return [
                    'start' => $now->copy()->subDays($days)->startOfDay(),
                    'end' => $now->copy()->endOfDay(),
                ];
            case 'today':
                return [
                    'start' => $now->copy()->startOfDay(),
                    'end' => $now->copy()->endOfDay(),
                ];
            case 'week':
                return [
                    'start' => $now->copy()->startOfWeek(),
                    'end' => $now->copy()->endOfWeek(),
                ];
            case 'month':
                return [
                    'start' => $now->copy()->startOfMonth(),
                    'end' => $now->copy()->endOfMonth(),
                ];
            case 'quarter':
                return [
                    'start' => $now->copy()->startOfQuarter(),
                    'end' => $now->copy()->endOfQuarter(),
                ];
            case 'year':
                return [
                    'start' => $now->copy()->startOfYear(),
                    'end' => $now->copy()->endOfYear(),
                ];
            case 'all':
            case 'full_time':
                return [
                    'start' => Carbon::parse('2020-01-01')->startOfDay(),
                    'end' => $now->copy()->endOfDay(),
                ];
            default:
                return [
                    'start' => Carbon::parse('2020-01-01')->startOfDay(),
                    'end' => $now->copy()->endOfDay(),
                ];
        }
    }

    /**
     * Rezultate test/examen fără reviewed_at care necesită verificare manuală.
     */
    private function countPendingManualReviews(): int
    {
        $n = 0;
        if (Schema::hasTable('test_results')) {
            $n += (int) DB::table('test_results')
                ->whereNull('reviewed_at')
                ->where(function ($w) {
                    $w->where('needs_manual_review', true);
                    if (Schema::hasColumn('test_results', 'status')) {
                        $w->orWhere('status', 'pending_review');
                    }
                })
                ->count();
        }
        if (Schema::hasTable('exam_results') && Schema::hasColumn('exam_results', 'needs_manual_review')) {
            $n += (int) DB::table('exam_results')
                ->whereNull('reviewed_at')
                ->where('needs_manual_review', true)
                ->count();
        }

        return $n;
    }

    /** Capabilități opționale (tabele lipsă = valori 0 până la integrare). */
    private function getIntegrationsMeta(): array
    {
        return [
            'payments' => $this->paymentsModuleEnabled(),
            'tickets' => Schema::hasTable('support_tickets') || Schema::hasTable('tickets'),
            'course_reviews' => Schema::hasTable('course_reviews') || Schema::hasTable('reviews'),
        ];
    }

    private function paymentsModuleEnabled(): bool
    {
        return Schema::hasTable('payments');
    }

    private function calculateKPIs($dateRange)
    {
        $start = $dateRange['start'];
        $end = $dateRange['end'];

        // Total Users (only students - total count, not period-based)
        $totalUsers = User::where('role', 'student')->count();
        
        // Log for debugging (remove in production)
        \Log::info('Dashboard Users Count', [
            'all_users' => User::count(),
            'admin_users' => User::where('role', 'admin')->count(),
            'student_users' => User::where('role', 'student')->count(),
            'instructor_users' => User::where('role', 'instructor')->count(),
            'total_users' => $totalUsers
        ]);
        
        // Previous period for trend calculation
        $prevStart = $start->copy()->subDays($start->diffInDays($end));
        $prevEnd = $start;
        
        // Calculate trend based on new students in current period vs previous period
        $newUsersCurrentPeriod = User::where('role', 'student')
            ->whereBetween('created_at', [$start, $end])
            ->count();
        
        $newUsersPreviousPeriod = User::where('role', 'student')
            ->whereBetween('created_at', [$prevStart, $prevEnd])
            ->count();
        
        $totalUsersTrend = $newUsersPreviousPeriod > 0 
            ? round((($newUsersCurrentPeriod - $newUsersPreviousPeriod) / $newUsersPreviousPeriod) * 100, 1)
            : ($newUsersCurrentPeriod > 0 ? 100 : 0);

        // Total Courses (all published courses - total count, not period-based)
        $totalCourses = Course::where('status', 'published')->count();
        
        // Calculate trend based on new courses in current period vs previous period
        $newCoursesCurrentPeriod = Course::where('status', 'published')
            ->whereBetween('created_at', [$start, $end])
            ->count();
        
        $newCoursesPreviousPeriod = Course::where('status', 'published')
            ->whereBetween('created_at', [$prevStart, $prevEnd])
            ->count();
        
        $totalCoursesTrend = $newCoursesPreviousPeriod > 0 
            ? round((($newCoursesCurrentPeriod - $newCoursesPreviousPeriod) / $newCoursesPreviousPeriod) * 100, 1)
            : ($newCoursesCurrentPeriod > 0 ? 100 : 0);

        // Active Users (users who had activity in period - enrolled, completed, or updated courses)
        // Get users with course activity in period
        $usersWithCourseActivity = collect([]);
        if (Schema::hasTable('course_user')) {
            $query = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where(function ($q) use ($start, $end) {
                    $q->whereBetween('course_user.updated_at', [$start, $end]);
                    if (Schema::hasColumn('course_user', 'enrolled_at')) {
                        $q->orWhereBetween('course_user.enrolled_at', [$start, $end]);
                    }
                    if (Schema::hasColumn('course_user', 'completed_at')) {
                        $q->orWhereBetween('course_user.completed_at', [$start, $end]);
                    }
                });

            $usersWithCourseActivity = $query->distinct()->pluck('course_user.user_id');
        }

        $usersUpdated = DB::table('users')
            ->where('role', 'student')
            ->whereBetween('users.updated_at', [$start, $end])
            ->pluck('id');
        
        $activeUsers = $usersWithCourseActivity->merge($usersUpdated)->unique()->count();

        // Previous period for trend
        $prevStart = $start->copy()->subDays($start->diffInDays($end));
        $prevEnd = $start;
        
        $prevUsersWithCourseActivity = collect([]);
        if (Schema::hasTable('course_user')) {
            $query = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where(function ($q) use ($prevStart, $prevEnd) {
                    $q->whereBetween('course_user.updated_at', [$prevStart, $prevEnd]);
                    if (Schema::hasColumn('course_user', 'enrolled_at')) {
                        $q->orWhereBetween('course_user.enrolled_at', [$prevStart, $prevEnd]);
                    }
                    if (Schema::hasColumn('course_user', 'completed_at')) {
                        $q->orWhereBetween('course_user.completed_at', [$prevStart, $prevEnd]);
                    }
                });

            $prevUsersWithCourseActivity = $query->distinct()->pluck('course_user.user_id');
        }

        $prevUsersUpdated = DB::table('users')
            ->where('role', 'student')
            ->whereBetween('users.updated_at', [$prevStart, $prevEnd])
            ->pluck('id');
        
        $previousActiveUsers = $prevUsersWithCourseActivity->merge($prevUsersUpdated)->unique()->count();

        $activeUsersTrend = $previousActiveUsers > 0 
            ? round((($activeUsers - $previousActiveUsers) / $previousActiveUsers) * 100, 1)
            : 0;

        // New Enrollments
        $newEnrollments = 0;
        $previousEnrollments = 0;
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled_at')) {
            $newEnrollments = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->whereBetween('course_user.enrolled_at', [$start, $end])
                ->where('course_user.enrolled', true)
                ->count();

            $previousEnrollments = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->whereBetween('course_user.enrolled_at', [
                    $start->copy()->subDays($start->diffInDays($end)),
                    $start
                ])
                ->where('course_user.enrolled', true)
                ->count();
        }

        $enrollmentsTrend = $previousEnrollments > 0
            ? round((($newEnrollments - $previousEnrollments) / $previousEnrollments) * 100, 1)
            : 0;

        // Completion Rate
        $totalEnrollments = 0;
        $completedEnrollments = 0;
        if (Schema::hasTable('course_user')) {
            $totalEnrollments = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->count();

            if (Schema::hasColumn('course_user', 'completed_at')) {
                $completedEnrollments = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->where('course_user.enrolled', true)
                    ->whereNotNull('course_user.completed_at')
                    ->count();
            }
        }

        $completionRate = $totalEnrollments > 0 
            ? round(($completedEnrollments / $totalEnrollments) * 100, 1)
            : 0;

        $previousCompleted = 0;
        $previousTotal = 0;
        if (Schema::hasTable('course_user')) {
            $prevEnd = $start->copy()->subDay();
            $prevStart = $prevEnd->copy()->subDays($start->diffInDays($end));
            $previousTotal = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.enrolled_at', '<=', $prevEnd)
                ->count();
            if (Schema::hasColumn('course_user', 'completed_at')) {
                $previousCompleted = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->where('course_user.enrolled', true)
                    ->where('course_user.enrolled_at', '<=', $prevEnd)
                    ->whereNotNull('course_user.completed_at')
                    ->count();
            }
        }
        $previousCompletionRate = $previousTotal > 0 ? ($previousCompleted / $previousTotal) * 100 : 0;
        $completionTrend = round($completionRate - $previousCompletionRate, 1);

        // Engagement (average progress across all enrollments)
        $avgProgress = 0;
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'progress_percentage')) {
            $avgProgress = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->whereNotNull('course_user.progress_percentage')
                ->avg('course_user.progress_percentage') ?? 0;
        }

        $engagement = round($avgProgress, 1);
        $previousAvgProgress = 0;
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'progress_percentage')) {
            $prevEnd = $start->copy()->subDay();
            $previousAvgProgress = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.updated_at', '<', $start)
                ->whereNotNull('course_user.progress_percentage')
                ->avg('course_user.progress_percentage') ?? 0;
        }
        $engagementTrend = round($engagement - $previousAvgProgress, 1);

        // „Issues” = lucrări de verificare manuală în așteptare (test + examen legacy)
        $issues = $this->countPendingManualReviews();
        $issuesTrend = 0;

        $studentIds = User::where('role', 'student')->pluck('id');
        $focusLogsPeriod = collect();
        if ($studentIds->isNotEmpty()) {
            $focusLogsPeriod = ActivityLog::where('action', 'telemetry.learner_focus_seconds')
                ->whereBetween('created_at', [$start, $end])
                ->whereIn('user_id', $studentIds)
                ->get(['new_values']);
        }

        $learningSessionsPeriod = $focusLogsPeriod->count();
        $learningSecondsPeriod = $focusLogsPeriod->sum(
            fn ($log) => (int) (($log->new_values ?? [])['seconds'] ?? 0)
        );

        $avgMinutesPeriod = $learningSessionsPeriod > 0
            ? round(($learningSecondsPeriod / 60) / $learningSessionsPeriod, 1)
            : 0.0;

        $avgMinutesAllTime = 0.0;
        if (Schema::hasTable('lesson_progress')) {
            $avgSecondsAllTime = (float) DB::table('lesson_progress')
                ->join('users', 'users.id', '=', 'lesson_progress.user_id')
                ->where('users.role', 'student')
                ->where('lesson_progress.time_spent_seconds', '>', 0)
                ->avg('lesson_progress.time_spent_seconds');
            $avgMinutesAllTime = round($avgSecondsAllTime / 60, 1);
        }

        $kpis = [
            'total_users' => [
                'value' => (string)$totalUsers, // Return as string directly, no formatting
                'trend' => $totalUsersTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($totalUsersTrend) . '%',
                'color' => '#6366f1',
            ],
            'total_courses' => [
                'value' => number_format($totalCourses),
                'trend' => $totalCoursesTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($totalCoursesTrend) . '%',
                'color' => '#8b5cf6',
            ],
            'active_users' => [
                'value' => number_format($activeUsers),
                'trend' => $activeUsersTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($activeUsersTrend) . '%',
                'color' => '#3b82f6',
            ],
            'new_enrollments' => [
                'value' => number_format($newEnrollments),
                'trend' => $enrollmentsTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($enrollmentsTrend) . '%',
                'color' => '#10b981',
            ],
            'completion_rate' => [
                'value' => $completionRate . '%',
                'trend' => $completionTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($completionTrend) . '%',
                'color' => '#ef4444',
            ],
            'engagement' => [
                'value' => $engagement . '%',
                'trend' => $engagementTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($engagementTrend) . '%',
                'color' => '#ec4899',
            ],
            'issues' => [
                'value' => number_format($issues),
                'trend' => $issuesTrend >= 0 ? 'up' : 'down',
                'trendValue' => abs($issuesTrend),
                'color' => '#f97316',
            ],
            'avg_learning_minutes' => [
                'value' => (string) $avgMinutesPeriod,
                'label' => 'Medie minute / sesiune (perioadă)',
                'sessions_count' => $learningSessionsPeriod,
                'trend' => 'up',
                'trendValue' => '0%',
                'color' => '#0ea5e9',
            ],
            'avg_learning_minutes_total' => [
                'value' => (string) $avgMinutesAllTime,
                'label' => 'Medie minute / lecție (total)',
                'trend' => 'up',
                'trendValue' => '0%',
                'color' => '#0284c7',
            ],
            'new_users' => [
                'value' => (string) User::where('role', 'student')
                    ->whereBetween('created_at', [$start, $end])
                    ->count(),
                'trend' => 'up',
                'trendValue' => '0%',
                'color' => '#22c55e',
            ],
        ];

        if ($this->paymentsModuleEnabled()) {
            // Placeholder until payment aggregates are wired; keys appear only when module exists.
            $kpis['revenue_gross'] = [
                'value' => 0,
                'trend' => 'up',
                'trendValue' => '0%',
                'color' => '#f59e0b',
            ];
            $kpis['revenue_net'] = [
                'value' => 0,
                'trend' => 'up',
                'trendValue' => '0%',
                'color' => '#8b5cf6',
            ];
        }

        return $kpis;
    }

    private function getChartData($dateRange)
    {
        $start = $dateRange['start'];
        $end = $dateRange['end'];
        $days = max(1, (int) ceil($start->diffInDays($end)));
        $dataPoints = min($days, 30); // Max 30 data points

        $chartData = [];
        $interval = max(0.0001, $days / max(1, $dataPoints));

        $studentIdsForChart = User::where('role', 'student')->pluck('id');
        $focusLogs = $studentIdsForChart->isEmpty()
            ? collect()
            : ActivityLog::where('action', 'telemetry.learner_focus_seconds')
                ->whereBetween('created_at', [$start, $end])
                ->whereIn('user_id', $studentIdsForChart)
                ->get(['created_at', 'new_values']);

        for ($i = 0; $i <= $dataPoints; $i++) {
            $date = $start->copy()->addDays($i * $interval);
            $dateEnd = $date->copy()->addDays($interval);
            if ($dateEnd->greaterThan($end)) {
                $dateEnd = $end->copy();
            }

            $enrollments = 0;
            if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled_at')) {
                $enrollments = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->whereBetween('course_user.enrolled_at', [$date, $dateEnd])
                    ->where('course_user.enrolled', true)
                    ->count();
            }

            $newUsers = User::where('role', 'student')
                ->whereBetween('created_at', [$date, $dateEnd])
                ->count();

            $totalUsers = User::where('role', 'student')
                ->where('created_at', '<=', $dateEnd)
                ->count();

            $usersWithCourseActivity = collect([]);
            if (Schema::hasTable('course_user')) {
                $activityQuery = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->where(function ($q) use ($date, $dateEnd) {
                        $q->whereBetween('course_user.updated_at', [$date, $dateEnd]);
                        if (Schema::hasColumn('course_user', 'enrolled_at')) {
                            $q->orWhereBetween('course_user.enrolled_at', [$date, $dateEnd]);
                        }
                        if (Schema::hasColumn('course_user', 'completed_at')) {
                            $q->orWhereBetween('course_user.completed_at', [$date, $dateEnd]);
                        }
                    });

                $usersWithCourseActivity = $activityQuery->distinct()->pluck('course_user.user_id');
            }

            $usersUpdated = DB::table('users')
                ->where('role', 'student')
                ->whereBetween('users.updated_at', [$date, $dateEnd])
                ->pluck('id');

            $activeUsers = $usersWithCourseActivity->merge($usersUpdated)->unique()->count();

            $learningSeconds = $focusLogs
                ->filter(fn ($log) => $log->created_at >= $date && $log->created_at < $dateEnd)
                ->sum(fn ($log) => (int) (($log->new_values ?? [])['seconds'] ?? 0));

            $point = [
                'date' => $date->format('Y-m-d'),
                'enrollments' => $enrollments,
                'users' => $totalUsers,
                'total_users' => $totalUsers,
                'new_users' => $newUsers,
                'active_users' => $activeUsers,
                'learning_minutes' => (int) round($learningSeconds / 60),
                'learning_hours' => round($learningSeconds / 3600, 2),
            ];
            if ($this->paymentsModuleEnabled()) {
                $point['revenue'] = 0;
            }
            $chartData[] = $point;
        }

        return $chartData;
    }

    /**
     * Distribuție pe orele zilei (00–23): sesiuni = deschideri de platformă (session_started).
     *
     * @return array<int, array{hour:int, sessions:int, visits:int, users:int}>
     */
    private function getHourlyActivity(array $dateRange): array
    {
        $start = $dateRange['start'];
        $end = $dateRange['end'];

        $sessionsByHour = array_fill(0, 24, 0);
        $usersByHour = array_fill(0, 24, []);

        if (! Schema::hasTable('activity_logs')) {
            return $this->emptyHourlySessionsBuckets();
        }

        $studentIds = User::where('role', 'student')->pluck('id');
        if ($studentIds->isEmpty()) {
            return $this->emptyHourlySessionsBuckets();
        }

        $logs = ActivityLog::query()
            ->whereBetween('created_at', [$start, $end])
            ->whereIn('user_id', $studentIds)
            ->where('action', StudentSessionLogger::ACTION)
            ->get(['created_at', 'user_id']);

        foreach ($logs as $log) {
            $h = (int) $log->created_at->format('G');
            $sessionsByHour[$h]++;
            if ($log->user_id) {
                $usersByHour[$h][$log->user_id] = true;
            }
        }

        $out = [];
        for ($h = 0; $h < 24; $h++) {
            $count = $sessionsByHour[$h];
            $out[] = [
                'hour' => $h,
                'sessions' => $count,
                'visits' => $count,
                'users' => count($usersByHour[$h]),
            ];
        }

        return $out;
    }

    /**
     * @return array<int, array{hour:int, sessions:int, visits:int, users:int}>
     */
    private function emptyHourlySessionsBuckets(): array
    {
        $out = [];
        for ($h = 0; $h < 24; $h++) {
            $out[] = ['hour' => $h, 'sessions' => 0, 'visits' => 0, 'users' => 0];
        }

        return $out;
    }

    private function getTopCourses($dateRange)
    {
        $start = $dateRange['start'];
        $end = $dateRange['end'];

        return Course::with('teacher')
            ->get()
            ->map(function($course) use ($start, $end) {
                $enrollments = 0;
                $completed = 0;
                $totalEnrollments = 0;
                
                if (Schema::hasTable('course_user')) {
                    if (Schema::hasColumn('course_user', 'enrolled_at')) {
                        $enrollments = DB::table('course_user')
                            ->join('users', 'users.id', '=', 'course_user.user_id')
                            ->where('users.role', 'student')
                            ->where('course_user.course_id', $course->id)
                            ->where('course_user.enrolled', true)
                            ->whereBetween('course_user.enrolled_at', [$start, $end])
                            ->count();
                    }

                    if (Schema::hasColumn('course_user', 'completed_at')) {
                        $completed = DB::table('course_user')
                            ->join('users', 'users.id', '=', 'course_user.user_id')
                            ->where('users.role', 'student')
                            ->where('course_user.course_id', $course->id)
                            ->whereNotNull('course_user.completed_at')
                            ->count();
                    }

                    $totalEnrollments = DB::table('course_user')
                        ->join('users', 'users.id', '=', 'course_user.user_id')
                        ->where('users.role', 'student')
                        ->where('course_user.course_id', $course->id)
                        ->where('course_user.enrolled', true)
                        ->count();
                }
                
                $completionRate = $totalEnrollments > 0 
                    ? round(($completed / $totalEnrollments) * 100, 1)
                    : 0;

                $row = [
                    'id' => $course->id,
                    'title' => $course->title,
                    'enrollments' => $enrollments,
                    'completion_rate' => $completionRate,
                ];
                if ($this->paymentsModuleEnabled()) {
                    $row['revenue'] = 0;
                }

                return $row;
            })
            ->sortByDesc('enrollments')
            ->take(5)
            ->values()
            ->toArray();
    }

    private function getProblematicCourses()
    {
        return Course::all()
            ->map(function($course) {
                $enrollments = 0;
                $completed = 0;
                $started = 0;
                
                if (Schema::hasTable('course_user')) {
                    $enrollments = DB::table('course_user')
                        ->join('users', 'users.id', '=', 'course_user.user_id')
                        ->where('users.role', 'student')
                        ->where('course_user.course_id', $course->id)
                        ->where('course_user.enrolled', true)
                        ->count();

                    if (Schema::hasColumn('course_user', 'completed_at')) {
                        $completed = DB::table('course_user')
                            ->join('users', 'users.id', '=', 'course_user.user_id')
                            ->where('users.role', 'student')
                            ->where('course_user.course_id', $course->id)
                            ->whereNotNull('course_user.completed_at')
                            ->count();
                    }

                    if (Schema::hasColumn('course_user', 'started_at')) {
                        $started = DB::table('course_user')
                            ->join('users', 'users.id', '=', 'course_user.user_id')
                            ->where('users.role', 'student')
                            ->where('course_user.course_id', $course->id)
                            ->whereNotNull('course_user.started_at')
                            ->count();
                    }
                }
                
                $completionRate = $enrollments > 0 
                    ? round(($completed / $enrollments) * 100, 1)
                    : 0;

                $dropoffRate = $started > 0
                    ? round((($started - $completed) / $started) * 100, 1)
                    : 0;

                return [
                    'id' => $course->id,
                    'title' => $course->title,
                    'completion_rate' => $completionRate,
                    'rating' => 0, // Fără modul recenzii; vezi `integrations.course_reviews`
                    'dropoff_rate' => $dropoffRate,
                ];
            })
            ->filter(function($course) {
                return $course['completion_rate'] < 30 
                    || $course['dropoff_rate'] > 50
                    || ($course['rating'] > 0 && $course['rating'] < 3);
            })
            ->take(5)
            ->values()
            ->toArray();
    }

    /**
     * Learning funnel - real counts from course_user
     */
    private function getLearningFunnel()
    {
        if (!Schema::hasTable('course_user')) {
            return [
                'enrolled' => 0,
                'started' => 0,
                'progress_25' => 0,
                'progress_50' => 0,
                'progress_75' => 0,
                'completed' => 0,
            ];
        }

        $enrolled = DB::table('course_user')
            ->join('users', 'users.id', '=', 'course_user.user_id')
            ->where('users.role', 'student')
            ->where('course_user.enrolled', true)
            ->count();

        $started = 0;
        if (Schema::hasColumn('course_user', 'started_at')) {
            $started = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->whereNotNull('course_user.started_at')
                ->count();
        } else {
            $started = $enrolled; // fallback: consider all enrolled as started
        }

        $completed = 0;
        if (Schema::hasColumn('course_user', 'completed_at')) {
            $completed = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->whereNotNull('course_user.completed_at')
                ->count();
        }

        $progress25 = 0;
        $progress50 = 0;
        $progress75 = 0;
        if (Schema::hasColumn('course_user', 'progress_percentage')) {
            $progress25 = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.progress_percentage', '>=', 25)
                ->count();
            $progress50 = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.progress_percentage', '>=', 50)
                ->count();
            $progress75 = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.progress_percentage', '>=', 75)
                ->count();
        } else {
            $progress25 = $started;
            $progress50 = $started;
            $progress75 = $completed;
        }

        return [
            'enrolled' => $enrolled,
            'started' => $started,
            'progress_25' => $progress25,
            'progress_50' => $progress50,
            'progress_75' => $progress75,
            'completed' => $completed,
        ];
    }

    /**
     * User segments - real counts
     * new: created in last 30 days
     * at_risk: enrolled, started, but no update in 14+ days and not completed
     * highly_engaged: at least one enrollment with progress >= 50%
     * inactive: no course_user activity in 30+ days
     */
    private function getUserSegments($dateRange)
    {
        $new = User::where('role', 'student')
            ->where('created_at', '>=', now()->subDays(30))
            ->count();

        $highlyEngaged = 0;
        $atRisk = 0;
        $inactive = 0;

        if (!Schema::hasTable('course_user')) {
            return [
                'new' => $new,
                'at_risk' => 0,
                'highly_engaged' => 0,
                'inactive' => 0,
            ];
        }

        if (Schema::hasColumn('course_user', 'progress_percentage')) {
            $highlyEngagedIds = DB::table('course_user')
                ->join('users', 'course_user.user_id', '=', 'users.id')
                ->where('users.role', 'student')
                ->where('course_user.enrolled', true)
                ->where('course_user.progress_percentage', '>=', 50)
                ->distinct()
                ->pluck('course_user.user_id');
            $highlyEngaged = $highlyEngagedIds->count();
        }

        $cutoff14d = now()->subDays(14);
        $cutoff30d = now()->subDays(30);

        $usersActive14d = DB::table('course_user')
            ->join('users', 'users.id', '=', 'course_user.user_id')
            ->where('users.role', 'student')
            ->where('course_user.updated_at', '>=', $cutoff14d)
            ->distinct()
            ->pluck('course_user.user_id');

        $usersActive30d = DB::table('course_user')
            ->join('users', 'users.id', '=', 'course_user.user_id')
            ->where('users.role', 'student')
            ->where('course_user.updated_at', '>=', $cutoff30d)
            ->distinct()
            ->pluck('course_user.user_id');

        $enrolledStartedNotCompleted = DB::table('course_user')
            ->join('users', 'course_user.user_id', '=', 'users.id')
            ->where('users.role', 'student')
            ->where('course_user.enrolled', true)
            ->where(function ($q) {
                $q->whereNotNull('course_user.started_at')
                    ->orWhereRaw('course_user.progress_percentage > 0');
            })
            ->whereNull('course_user.completed_at')
            ->distinct()
            ->pluck('course_user.user_id');

        $atRisk = $enrolledStartedNotCompleted->diff($usersActive14d)->count();

        $inactive = User::where('role', 'student')
            ->whereNotIn('id', $usersActive30d)
            ->count();

        return [
            'new' => $new,
            'at_risk' => $atRisk,
            'highly_engaged' => $highlyEngaged,
            'inactive' => $inactive,
        ];
    }

    private function getRecentActivities()
    {
        $activities = [];

        // Recent course completions
        $recentCompletions = collect([]);
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'completed_at')) {
            $recentCompletions = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->whereNotNull('course_user.completed_at')
                ->orderBy('course_user.completed_at', 'desc')
                ->select('course_user.*')
                ->take(15)
                ->get();
        }

        foreach ($recentCompletions as $completion) {
            $course = Course::find($completion->course_id);
            $user = User::find($completion->user_id);

            if ($course && $user && $user->role === 'student' && $completion->completed_at) {
                $activities[] = [
                    'id' => 'completion_' . $completion->id,
                    'type' => 'completion',
                    'description' => "{$user->name} a finalizat cursul \"{$course->title}\"",
                    'created_at' => is_string($completion->completed_at) 
                        ? $completion->completed_at 
                        : $completion->completed_at->format('Y-m-d H:i:s'),
                ];
            }
        }

        // Recent test completions
        foreach ($this->getRecentResultSources() as $source) {
            if (!Schema::hasTable($source['table']) || !Schema::hasColumn($source['table'], $source['id_column'])) {
                continue;
            }

            try {
                $recentResults = DB::table($source['table'])
                    ->join('users', 'users.id', '=', $source['table'] . '.user_id')
                    ->where('users.role', 'student')
                    ->where(function ($query) use ($source) {
                        if (Schema::hasColumn($source['table'], 'completed_at')) {
                            $query->whereNotNull($source['table'] . '.completed_at');
                        }
                        $query->orWhereNotNull($source['table'] . '.created_at');
                    })
                    ->orderByRaw('COALESCE(' . $source['table'] . '.completed_at, ' . $source['table'] . '.created_at) DESC')
                    ->select(
                        $source['table'] . '.id as result_id',
                        $source['table'] . '.user_id',
                        $source['table'] . '.' . $source['id_column'] . ' as entity_id',
                        $source['table'] . '.passed',
                        $source['table'] . '.score',
                        $source['table'] . '.max_score',
                        $source['table'] . '.percentage',
                        $source['table'] . '.completed_at',
                        $source['table'] . '.created_at'
                    )
                    ->take(15)
                    ->get();

                foreach ($recentResults as $result) {
                    $user = User::find($result->user_id);
                    $entity = $source['model']::find($result->entity_id);

                    if (!$entity || !$user || $user->role !== 'student') {
                        continue;
                    }

                    $passed = isset($result->passed) ? (bool) $result->passed : false;
                    $passedText = $passed ? 'a trecut' : 'a eșuat';
                    $scoreText = '';

                    if (isset($result->max_score) && $result->max_score > 0 && isset($result->score) && $result->score !== null) {
                        $scoreText = " ({$result->score}/{$result->max_score})";
                    } elseif (isset($result->score) && $result->score !== null) {
                        $scoreText = " ({$result->score})";
                    }

                    $activityDate = $result->completed_at ?? $result->created_at ?? now();

                    $activities[] = [
                        'id' => $source['prefix'] . '_' . ($result->result_id ?? uniqid()),
                        'type' => 'exam_submitted',
                        'description' => "{$user->name} {$passedText} {$source['label']} \"{$entity->title}\"{$scoreText}",
                        'created_at' => is_string($activityDate) ? $activityDate : (is_object($activityDate) ? $activityDate->format('Y-m-d H:i:s') : now()->format('Y-m-d H:i:s')),
                    ];
                }
            } catch (\Exception $e) {
                \Log::warning('Error fetching test results for dashboard: ' . $e->getMessage());
            }
        }

        // Recent lesson completions and learning time telemetry
        if (Schema::hasTable('activity_logs')) {
            try {
                $recentLearnerActivity = ActivityLog::with('user:id,name,role')
                    ->whereIn('action', ['completed_lesson', 'telemetry.learner_focus_seconds', 'enrolled_course'])
                    ->whereHas('user', fn ($q) => $q->where('role', 'student'))
                    ->latest('created_at')
                    ->take(20)
                    ->get();

                foreach ($recentLearnerActivity as $log) {
                    $user = $log->user;
                    if (!$user || $user->role !== 'student') {
                        continue;
                    }

                    $newValues = is_array($log->new_values) ? $log->new_values : [];

                    if ($log->action === 'enrolled_course') {
                        $courseTitle = $newValues['course_title'] ?? 'un curs';
                        $activities[] = [
                            'id' => 'enroll_' . $log->id,
                            'type' => 'enrollment',
                            'description' => "{$user->name} s-a înscris la cursul \"{$courseTitle}\"",
                            'created_at' => optional($log->created_at)->format('Y-m-d H:i:s') ?? now()->format('Y-m-d H:i:s'),
                        ];
                        continue;
                    }

                    if ($log->action === 'completed_lesson') {
                        $lessonTitle = $newValues['lesson_title'] ?? 'o lecție';
                        $activities[] = [
                            'id' => 'lesson_' . $log->id,
                            'type' => 'lesson_completed',
                            'description' => "{$user->name} a finalizat lecția \"{$lessonTitle}\"",
                            'created_at' => optional($log->created_at)->format('Y-m-d H:i:s') ?? now()->format('Y-m-d H:i:s'),
                        ];
                        continue;
                    }

                    if ($log->action === 'telemetry.learner_focus_seconds') {
                        $seconds = (int) ($newValues['seconds'] ?? 0);
                        if ($seconds < 30) {
                            continue;
                        }
                        $lessonId = (int) ($newValues['lesson_id'] ?? 0);
                        $lessonTitle = null;
                        if ($lessonId > 0) {
                            $lessonTitle = Lesson::query()->whereKey($lessonId)->value('title');
                        }
                        $minutes = max(1, (int) round($seconds / 60));
                        $lessonPart = $lessonTitle ? " la lecția \"{$lessonTitle}\"" : '';
                        $activities[] = [
                            'id' => 'focus_' . $log->id,
                            'type' => 'learning_time',
                            'description' => "{$user->name} a studiat {$minutes} min{$lessonPart}",
                            'created_at' => optional($log->created_at)->format('Y-m-d H:i:s') ?? now()->format('Y-m-d H:i:s'),
                        ];
                    }
                }
            } catch (\Exception $e) {
                \Log::warning('Error fetching learner activity logs for dashboard: ' . $e->getMessage());
            }
        }

        // Sort by date and take most recent
        usort($activities, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });

        return array_slice($activities, 0, 30);
    }

    /**
     * Get average test completion percentage across all students
     */
    private function getAvgTestCompletionPercentage()
    {
        $percentages = $this->getUnifiedResultPercentages();

        return $percentages->isNotEmpty()
            ? round((float) $percentages->avg(), 1)
            : 0;
    }

    private function getRecentResultSources(): array
    {
        return [
            ['table' => 'test_results', 'id_column' => 'test_id', 'model' => Test::class, 'label' => 'testul', 'prefix' => 'test'],
            ['table' => 'exam_results', 'id_column' => 'exam_id', 'model' => Exam::class, 'label' => 'examenul', 'prefix' => 'exam'],
        ];
    }

    private function getUnifiedResultPercentages()
    {
        $percentages = collect();

        foreach ($this->getRecentResultSources() as $source) {
            if (!Schema::hasTable($source['table']) || !Schema::hasColumn($source['table'], $source['id_column']) || !Schema::hasColumn($source['table'], 'percentage')) {
                continue;
            }

            $rows = DB::table($source['table'])
                ->join('users', 'users.id', '=', $source['table'] . '.user_id')
                ->where('users.role', 'student')
                ->whereNotNull($source['table'] . '.percentage')
                ->pluck($source['table'] . '.percentage');

            foreach ($rows as $percentage) {
                $percentages->push((float) $percentage);
            }
        }

        return $percentages;
    }

    /**
     * Statistici cursuri și teste. Instructor: doar cursurile și testele proprii.
     */
    private function getCourseAndTestStats(Request $request)
    {
        $user = $request->user();
        $isInstructor = $user && $user->isInstructor();
        $userId = $user ? (int) $user->id : 0;

        $courseQuery = Course::query();
        if ($isInstructor) {
            $courseQuery->where('teacher_id', $userId);
        }
        $coursesTotal = $courseQuery->count();
        $coursesPublished = (clone $courseQuery)->where('status', 'published')->count();
        $coursesDraft = (clone $courseQuery)->where(function ($q) {
            $q->where('status', 'draft')->orWhereNull('status');
        })->count();

        $testQuery = Test::query();
        if ($isInstructor && Schema::hasColumn('tests', 'created_by')) {
            $testQuery->where('created_by', $userId);
        }
        $testsTotal = $testQuery->count();
        $testsPublished = (clone $testQuery)->where('status', 'published')->count();
        $testsDraft = (clone $testQuery)->where(function ($q) {
            $q->where('status', 'draft')->orWhereNull('status');
        })->count();

        $pendingReviews = 0;
        $manualReviewsTotal = 0;
        $manualReviewsReviewed = 0;
        $manualReviewCompletionRate = 0;
        if (Schema::hasTable('test_results')) {
            $manualResultsQuery = DB::table('test_results')
                ->where(function ($q) {
                    $q->where('needs_manual_review', true)
                      ->orWhereNotNull('reviewed_at');
                    if (Schema::hasColumn('test_results', 'status')) {
                        $q->orWhere('status', 'pending_review');
                    }
                });

            $pendingReviewsQuery = DB::table('test_results')
                ->where(function ($q) {
                    $q->where('needs_manual_review', true);
                    if (Schema::hasColumn('test_results', 'status')) {
                        $q->orWhere('status', 'pending_review');
                    }
                })
                ->whereNull('reviewed_at');

            if ($isInstructor && Schema::hasColumn('tests', 'created_by')) {
                $instructorTestIds = Test::where('created_by', $userId)->pluck('id');
                $manualResultsQuery->whereIn('test_id', $instructorTestIds);
                $pendingReviewsQuery->whereIn('test_id', $instructorTestIds);
            }

            $pendingReviews = $pendingReviewsQuery->count();
            $manualReviewsTotal = $manualResultsQuery->count();
            $manualReviewsReviewed = (clone $manualResultsQuery)->whereNotNull('reviewed_at')->count();
            $manualReviewCompletionRate = $manualReviewsTotal > 0
                ? round(($manualReviewsReviewed / $manualReviewsTotal) * 100, 1)
                : 0;
        }

        return [
            'courses' => [
                'total' => $coursesTotal,
                'published' => $coursesPublished,
                'draft' => $coursesDraft,
            ],
            'tests' => [
                'total' => $testsTotal,
                'published' => $testsPublished,
                'draft' => $testsDraft,
                'pending_reviews' => $pendingReviews,
                'manual_reviews_total' => $manualReviewsTotal,
                'manual_reviews_reviewed' => $manualReviewsReviewed,
                'manual_review_completion_rate' => $manualReviewCompletionRate,
            ],
        ];
    }

    private function getPlatformAverageCompletionRate(): float
    {
        if (!Schema::hasTable('course_user') || !Schema::hasColumn('course_user', 'completed_at')) {
            return 50;
        }
        $total = DB::table('course_user')
            ->join('users', 'users.id', '=', 'course_user.user_id')
            ->where('users.role', 'student')
            ->where('course_user.enrolled', true)
            ->count();
        if ($total === 0) {
            return 50;
        }
        $completed = DB::table('course_user')
            ->join('users', 'users.id', '=', 'course_user.user_id')
            ->where('users.role', 'student')
            ->where('course_user.enrolled', true)
            ->whereNotNull('course_user.completed_at')
            ->count();

        return round(($completed / $total) * 100, 1);
    }

    /**
     * Computed dashboard alerts, minus those dismissed by this user.
     *
     * @return array<int, array<string, mixed>>
     */
    public function filteredAlertsForUser($user): array
    {
        $userId = is_object($user) ? (int) $user->id : (int) $user;
        $alerts = $this->getAlerts();

        return AdminAlertController::filterDismissed($alerts, $userId);
    }

    private function getAlerts()
    {
        $alerts = [];

        // Check for courses with low completion
        $lowCompletionCourses = Course::all()
            ->filter(function($course) {
                if (!Schema::hasTable('course_user')) {
                    return false;
                }
                
                $enrollments = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->where('course_user.course_id', $course->id)
                    ->where('course_user.enrolled', true)
                    ->count();

                if ($enrollments === 0) {
                    return false;
                }

                $completed = 0;
                if (Schema::hasColumn('course_user', 'completed_at')) {
                    $completed = DB::table('course_user')
                        ->join('users', 'users.id', '=', 'course_user.user_id')
                        ->where('users.role', 'student')
                        ->where('course_user.course_id', $course->id)
                        ->whereNotNull('course_user.completed_at')
                        ->count();
                }
                
                $rate = ($completed / $enrollments) * 100;
                return $rate < 20;
            })
            ->take(3);

        foreach ($lowCompletionCourses as $course) {
            $alerts[] = [
                'id' => 'alert_low_completion_' . $course->id,
                'type' => 'low_completion',
                'severity' => 'warning',
                'title' => 'Rată de finalizare scăzută',
                'description' => "Cursul \"{$course->title}\" are o rată de finalizare sub 20%",
                'action_url' => "/admin/courses/{$course->id}",
                'created_at' => now()->toDateTimeString(),
            ];
        }

        // Check for inactive instructors (mock - implement based on your logic)
        $inactiveInstructors = User::where('role', 'instructor')
            ->whereDoesntHave('courses', function($query) {
                $query->where('updated_at', '>=', now()->subMonths(3));
            })
            ->take(2)
            ->get();

        foreach ($inactiveInstructors as $instructor) {
            $alerts[] = [
                'id' => 'alert_inactive_instructor_' . $instructor->id,
                'type' => 'instructor_inactive',
                'severity' => 'info',
                'title' => 'Instructor inactiv',
                'description' => "Instructorul {$instructor->name} nu a actualizat cursuri în ultimele 3 luni",
                'action_url' => "/admin/users/{$instructor->id}",
                'created_at' => now()->toDateTimeString(),
            ];
        }

        // Course success below/above average
        $avgRate = $this->getPlatformAverageCompletionRate();
        foreach (Course::where('status', 'published')->get() as $course) {
            $enrollments = 0;
            $completed = 0;
            if (Schema::hasTable('course_user')) {
                $enrollments = DB::table('course_user')
                    ->join('users', 'users.id', '=', 'course_user.user_id')
                    ->where('users.role', 'student')
                    ->where('course_user.course_id', $course->id)
                    ->where('course_user.enrolled', true)
                    ->count();
                if ($enrollments > 0 && Schema::hasColumn('course_user', 'completed_at')) {
                    $completed = DB::table('course_user')
                        ->join('users', 'users.id', '=', 'course_user.user_id')
                        ->where('users.role', 'student')
                        ->where('course_user.course_id', $course->id)
                        ->where('course_user.enrolled', true)
                        ->whereNotNull('course_user.completed_at')
                        ->count();
                }
            }
            if ($enrollments < 3) {
                continue;
            }
            $rate = $enrollments > 0 ? round(($completed / $enrollments) * 100, 1) : 0;
            if ($rate < $avgRate - 15 && $rate < 30) {
                $alerts[] = [
                    'id' => 'alert_success_below_' . $course->id,
                    'type' => 'course_success_below',
                    'severity' => 'warning',
                    'title' => 'Rată de finalizare sub medie',
                    'description' => 'Cursul "' . $course->title . '" are ' . $rate . '% (medie: ' . $avgRate . '%)',
                    'action_url' => "/admin/courses/{$course->id}",
                    'created_at' => now()->toDateTimeString(),
                ];
            } elseif ($rate > $avgRate + 15 && $rate >= 50) {
                $alerts[] = [
                    'id' => 'alert_success_above_' . $course->id,
                    'type' => 'course_success_above',
                    'severity' => 'info',
                    'title' => 'Rată de finalizare peste medie',
                    'description' => 'Cursul "' . $course->title . '" are ' . $rate . '% (medie: ' . $avgRate . '%)',
                    'action_url' => "/admin/courses/{$course->id}",
                    'created_at' => now()->toDateTimeString(),
                ];
            }
        }

        return $alerts;
    }

    private function getTelemetryKpis(array $dateRange): array
    {
        $start = $dateRange['start'];
        $end = $dateRange['end'];

        $createdCourses = ActivityLog::where('action', 'telemetry.admin_course_created')
            ->whereBetween('created_at', [$start, $end])
            ->count();
        $publishedCourses = ActivityLog::whereIn('action', ['telemetry.admin_course_version_published', 'builder.publish_course'])
            ->whereBetween('created_at', [$start, $end])
            ->count();
        $funnelConversion = $createdCourses > 0
            ? round(($publishedCourses / $createdCourses) * 100, 1)
            : 0;

        $testCreateEvents = ActivityLog::where('action', 'telemetry.admin_test_created')
            ->whereBetween('created_at', [$start, $end])
            ->get(['model_id', 'created_at']);
        $testPublishEvents = ActivityLog::where('action', 'telemetry.admin_test_published')
            ->whereBetween('created_at', [$start, $end])
            ->get(['model_id', 'created_at'])
            ->groupBy('model_id');

        $latencies = [];
        foreach ($testCreateEvents as $event) {
            $testId = (int) ($event->model_id ?? 0);
            if ($testId <= 0 || !isset($testPublishEvents[$testId])) {
                continue;
            }
            $publishEvent = $testPublishEvents[$testId]
                ->first(fn ($p) => $p->created_at >= $event->created_at);
            if (!$publishEvent) {
                continue;
            }
            $seconds = (int) $event->created_at->diffInSeconds($publishEvent->created_at);
            $latencies[] = $seconds;
        }
        $avgGenerationLatencyMs = count($latencies) > 0
            ? (int) round((array_sum($latencies) / count($latencies)) * 1000)
            : 0;

        $topicBucket = [];
        $recentResults = TestResult::with(['test.questions', 'test.questionBank.questions'])
            ->whereNotNull('completed_at')
            ->whereBetween('completed_at', [$start, $end])
            ->orderByDesc('completed_at')
            ->take(300)
            ->get();

        foreach ($recentResults as $result) {
            $questions = collect();
            if ($result->test) {
                $questions = $result->test->question_source === 'bank' && $result->test->questionBank
                    ? $result->test->questionBank->questions
                    : $result->test->questions;
            }
            $tagsForResult = [];
            foreach ($questions as $question) {
                $meta = is_array($question->metadata) ? $question->metadata : [];
                $rawTags = $meta['tags'] ?? [];
                $tags = [];
                if (is_string($rawTags)) {
                    $tags = array_values(array_filter(array_map('trim', explode(',', $rawTags))));
                } elseif (is_array($rawTags)) {
                    $tags = array_values(array_filter(array_map(fn ($t) => trim((string) $t), $rawTags)));
                }
                if (empty($tags)) {
                    $tags = ['General'];
                }
                foreach ($tags as $tag) {
                    $tagsForResult[$tag] = true;
                }
            }

            foreach (array_keys($tagsForResult) as $tag) {
                if (!isset($topicBucket[$tag])) {
                    $topicBucket[$tag] = [
                        'topic' => $tag,
                        'attempts' => 0,
                        'passed' => 0,
                        'avg_percentage' => 0.0,
                        'percentage_sum' => 0.0,
                    ];
                }
                $topicBucket[$tag]['attempts'] += 1;
                $topicBucket[$tag]['passed'] += $result->passed ? 1 : 0;
                $topicBucket[$tag]['percentage_sum'] += (float) ($result->percentage ?? 0);
            }
        }

        $topicOutcomes = array_map(function ($entry) {
            $entry['pass_rate'] = $entry['attempts'] > 0
                ? round(($entry['passed'] / $entry['attempts']) * 100, 1)
                : 0;
            $entry['avg_percentage'] = $entry['attempts'] > 0
                ? round($entry['percentage_sum'] / $entry['attempts'], 1)
                : 0;
            unset($entry['percentage_sum']);
            return $entry;
        }, array_values($topicBucket));

        usort($topicOutcomes, fn ($a, $b) => $b['attempts'] <=> $a['attempts']);
        $topicOutcomes = array_slice($topicOutcomes, 0, 6);

        $totalTests = Test::count();
        $bankSourcedTests = Test::where('question_source', 'bank')->count();
        $reuseRatio = $totalTests > 0 ? round(($bankSourcedTests / $totalTests) * 100, 1) : 0;
        $questionBanksUsed = Test::whereNotNull('question_set_id')->distinct('question_set_id')->count('question_set_id');
        $bankQuestionsTotal = Question::whereNotNull('question_bank_id')->count();

        return [
            'course_creation_funnel' => [
                'created' => $createdCourses,
                'published' => $publishedCourses,
                'conversion_rate' => $funnelConversion,
            ],
            'test_generation_latency' => [
                'avg_ms' => $avgGenerationLatencyMs,
                'samples' => count($latencies),
            ],
            'attempt_outcomes_by_topic' => $topicOutcomes,
            'question_bank_reuse' => [
                'ratio' => $reuseRatio,
                'tests_using_bank' => $bankSourcedTests,
                'tests_total' => $totalTests,
                'question_banks_used' => $questionBanksUsed,
                'bank_questions_total' => $bankQuestionsTotal,
            ],
        ];
    }
}
