<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Support\SchemaCache;
use App\Support\TenantContext;
use App\Support\TenantQuery;

/**
 * Builds a real, database-backed snapshot of the whole platform so Volt can
 * answer data questions directly instead of asking the administrator.
 */
class VoltDataInsightService
{
    public function buildContextForPrompt(string $prompt): array
    {
        return array_merge($this->buildSnapshot(), [
            'focused_data' => $this->safe(fn () => $this->buildFocusedData($prompt), 'focused_data'),
        ]);
    }

    public function buildSnapshot(): array
    {
        return Cache::remember('volt_data_snapshot:v4:' . (TenantContext::companyId() ?? 'none'), 120, function () {
            return [
                'generated_at' => Carbon::now()->toIso8601String(),
                'note' => 'Date reale din baza de date Formely. Folosește-le pentru a răspunde cu cifre concrete.',
                'users' => $this->safe(fn () => $this->buildUsers(), 'users'),
                'student_profiles' => $this->safe(fn () => $this->buildStudentProfiles(50), 'student_profiles'),
                'risk_analysis' => $this->safe(fn () => $this->buildStudentRiskAnalysis(25), 'risk_analysis'),
                'ask_your_data' => $this->safe(fn () => $this->buildAskYourDataInsights(), 'ask_your_data'),
                'courses' => $this->safe(fn () => $this->buildCourses(), 'courses'),
                'tests' => $this->safe(fn () => $this->buildTests(), 'tests'),
                'exams' => $this->safe(fn () => $this->buildExams(), 'exams'),
                'events' => $this->safe(fn () => $this->buildEvents(), 'events'),
                'learning' => $this->safe(fn () => $this->buildLearning(), 'learning'),
                'activity_last_30d' => $this->safe(fn () => $this->buildRecentActivity(), 'activity'),
            ];
        });
    }

    /** DB::table() limitat la academia curentă (prin company_id sau user_id). */
    private function table(string $table)
    {
        $query = DB::table($table);
        if (TenantContext::denyTenantData()) {
            return $query->whereRaw('1 = 0');
        }
        if (! TenantContext::shouldScope()) {
            return $query;
        }
        if (SchemaCache::hasColumn($table, 'company_id')) {
            TenantContext::constrain($query, "{$table}.company_id");

            return $query;
        }
        if (SchemaCache::hasColumn($table, 'user_id')) {
            return TenantQuery::constrainUserColumn($query, "{$table}.user_id");
        }

        return $query;
    }

    private function safe(callable $callback, string $section): mixed
    {
        try {
            return $callback();
        } catch (\Throwable $e) {
            Log::warning('Formely AI data snapshot section failed', [
                'section' => $section,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function buildUsers(): ?array
    {
        if (!SchemaCache::hasTable('users')) {
            return null;
        }

        $hasRole = SchemaCache::hasColumn('users', 'role');
        $hasCreatedAt = SchemaCache::hasColumn('users', 'created_at');
        $since = Carbon::now()->subDays(30);

        $byRole = [];
        if ($hasRole) {
            $byRole = $this->table('users')
                ->select('role', DB::raw('COUNT(*) as total'))
                ->groupBy('role')
                ->pluck('total', 'role')
                ->all();
        }

        return [
            'total' => (int) $this->table('users')->count(),
            'students' => (int) ($byRole['student'] ?? 0),
            'admins' => (int) ($byRole['admin'] ?? 0),
            'instructors' => (int) ($byRole['instructor'] ?? 0),
            'analysts' => (int) ($byRole['analyst'] ?? 0),
            'new_last_30d' => $hasCreatedAt
                ? (int) $this->table('users')->where('created_at', '>=', $since)->count()
                : null,
            'active_last_30d' => $this->countActiveStudents($since),
        ];
    }

    private function buildStudentProfiles(int $limit = 50): ?array
    {
        if (!SchemaCache::hasTable('users')) {
            return null;
        }

        $students = $this->table('users')
            ->select('id', 'name', 'email', 'created_at')
            ->where('role', 'student')
            ->orderBy('name')
            ->limit(max(1, min(200, $limit)))
            ->get();

        $ids = $students->pluck('id')->map(fn ($id) => (int) $id)->all();
        $enrollments = $this->getEnrollmentAggregatesForUsers($ids);
        $learning = $this->getLearningAggregatesForUsers($ids);
        $tests = $this->getTestAggregatesForUsers($ids);
        $lastActivity = $this->getLastActivityForUsers($ids);

        return [
            'included' => $students->count(),
            'limit' => $limit,
            'note' => 'Profiluri compacte per-elev. Pentru elevi care nu apar aici, folosește `focused_data.matching_students` pe baza întrebării.',
            'students' => $students->map(function ($student) use ($enrollments, $learning, $tests, $lastActivity) {
                $id = (int) $student->id;
                $enrollment = $enrollments[$id] ?? [];
                $learn = $learning[$id] ?? [];
                $test = $tests[$id] ?? [];

                return [
                    'id' => $id,
                    'name' => $student->name,
                    'email' => $student->email,
                    'registered_at' => $this->formatNullableDate($student->created_at ?? null),
                    'enrolled_courses' => (int) ($enrollment['enrolled_courses'] ?? 0),
                    'completed_courses' => (int) ($enrollment['completed_courses'] ?? 0),
                    'avg_course_progress_percent' => $enrollment['avg_course_progress_percent'] ?? null,
                    'lessons_completed' => (int) ($learn['lessons_completed'] ?? 0),
                    'learning_hours' => isset($learn['learning_seconds'])
                        ? round(((int) $learn['learning_seconds']) / 3600, 1)
                        : null,
                    'test_attempts' => (int) ($test['test_attempts'] ?? 0),
                    'passed_tests' => (int) ($test['passed_tests'] ?? 0),
                    'avg_test_score_percent' => $test['avg_test_score_percent'] ?? null,
                    'last_activity_at' => $lastActivity[$id] ?? null,
                ];
            })->values()->all(),
        ];
    }

    private function buildFocusedData(string $prompt): array
    {
        $tokens = $this->extractSearchTokens($prompt);

        return [
            'query_tokens' => $tokens,
            'matching_students' => $this->buildMatchingStudents($tokens),
            'matching_courses' => $this->buildMatchingCourses($tokens),
            'matching_tests' => $this->buildMatchingTests($tokens),
            'top_students_by_test_score' => $this->buildTopStudentsByTestScore(10),
            'students_needing_attention' => $this->buildStudentsNeedingAttention(10),
        ];
    }

    private function buildMatchingStudents(array $tokens): array
    {
        if (!SchemaCache::hasTable('users') || empty($tokens)) {
            return [];
        }

        $query = $this->table('users')
            ->select('id', 'name', 'email', 'created_at')
            ->where('role', 'student')
            ->where(function ($q) use ($tokens) {
                foreach ($tokens as $token) {
                    $like = '%' . mb_strtolower($token) . '%';
                    $q->orWhereRaw('LOWER(COALESCE(name, \'\')) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(COALESCE(email, \'\')) LIKE ?', [$like]);
                }
            })
            ->orderBy('name')
            ->limit(10)
            ->get();

        if ($query->isEmpty()) {
            return [];
        }

        $ids = $query->pluck('id')->map(fn ($id) => (int) $id)->all();
        $courseDetails = $this->getCourseDetailsForUsers($ids);
        $testDetails = $this->getRecentTestDetailsForUsers($ids);
        $profiles = collect($this->buildStudentProfiles(200)['students'] ?? [])->keyBy('id');

        return $query->map(function ($student) use ($profiles, $courseDetails, $testDetails) {
            $id = (int) $student->id;
            $profile = $profiles->get($id, [
                'id' => $id,
                'name' => $student->name,
                'email' => $student->email,
                'registered_at' => $this->formatNullableDate($student->created_at ?? null),
            ]);

            return array_merge($profile, [
                'courses' => $courseDetails[$id] ?? [],
                'recent_tests' => $testDetails[$id] ?? [],
            ]);
        })->values()->all();
    }

    private function buildMatchingCourses(array $tokens): array
    {
        if (!SchemaCache::hasTable('courses') || empty($tokens)) {
            return [];
        }

        return $this->table('courses')
            ->select('id', 'title', 'status', 'created_at')
            ->where(function ($q) use ($tokens) {
                foreach ($tokens as $token) {
                    $like = '%' . mb_strtolower($token) . '%';
                    $q->orWhereRaw('LOWER(COALESCE(title, \'\')) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(COALESCE(description, \'\')) LIKE ?', [$like]);
                }
            })
            ->orderBy('title')
            ->limit(10)
            ->get()
            ->map(function ($course) {
                $stats = $this->getCourseStats((int) $course->id);

                return array_merge([
                    'id' => (int) $course->id,
                    'title' => $course->title,
                    'status' => $course->status ?? null,
                    'created_at' => $this->formatNullableDate($course->created_at ?? null),
                ], $stats);
            })
            ->values()
            ->all();
    }

    private function buildMatchingTests(array $tokens): array
    {
        if (!SchemaCache::hasTable('tests') || empty($tokens)) {
            return [];
        }

        return $this->table('tests')
            ->select('id', 'title', 'created_at')
            ->where(function ($q) use ($tokens) {
                foreach ($tokens as $token) {
                    $like = '%' . mb_strtolower($token) . '%';
                    $q->orWhereRaw('LOWER(COALESCE(title, \'\')) LIKE ?', [$like]);
                }
            })
            ->orderBy('title')
            ->limit(10)
            ->get()
            ->map(function ($test) {
                $stats = $this->getTestStats((int) $test->id);

                return array_merge([
                    'id' => (int) $test->id,
                    'title' => $test->title,
                    'created_at' => $this->formatNullableDate($test->created_at ?? null),
                ], $stats);
            })
            ->values()
            ->all();
    }

    private function buildTopStudentsByTestScore(int $limit): array
    {
        if (!SchemaCache::hasTable('users') || !SchemaCache::hasTable('test_results') || !SchemaCache::hasColumn('test_results', 'percentage')) {
            return [];
        }

        return $this->table('users')
            ->join('test_results', 'test_results.user_id', '=', 'users.id')
            ->where('users.role', 'student')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                DB::raw('COUNT(test_results.id) as test_attempts'),
                DB::raw('AVG(test_results.percentage) as avg_score')
            )
            ->groupBy('users.id', 'users.name', 'users.email')
            ->orderByDesc('avg_score')
            ->limit(max(1, min(50, $limit)))
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->name,
                'email' => $row->email,
                'test_attempts' => (int) $row->test_attempts,
                'avg_test_score_percent' => round((float) $row->avg_score, 1),
            ])
            ->all();
    }

    private function buildStudentsNeedingAttention(int $limit): array
    {
        return $this->buildStudentRiskAnalysis($limit)['students'] ?? [];
    }

    private function buildAskYourDataInsights(): array
    {
        return [
            'purpose' => 'Insight-uri pregătite pentru întrebări naturale de tip Ask Your Data.',
            'engagement' => $this->buildEngagementInsights(),
            'course_watchlist' => $this->buildCourseWatchlist(10),
            'test_watchlist' => $this->buildTestWatchlist(10),
            'suggested_questions' => [
                'Ce cursuri au engagement slab?',
                'Ce teste au rată mică de promovare?',
                'Câți elevi sunt inactivi de peste 14 zile?',
                'Unde ar trebui să intervenim săptămâna aceasta?',
            ],
        ];
    }

    private function buildEngagementInsights(): array
    {
        $profiles = $this->buildStudentProfiles(200)['students'] ?? [];
        $inactive14 = 0;
        $inactive30 = 0;
        $noActivity = 0;
        $lowProgress = 0;

        foreach ($profiles as $profile) {
            $days = $this->daysSince($profile['last_activity_at'] ?? null);
            if ($days === null) {
                $noActivity++;
            } else {
                if ($days >= 14) {
                    $inactive14++;
                }
                if ($days >= 30) {
                    $inactive30++;
                }
            }

            if ((int) ($profile['enrolled_courses'] ?? 0) > 0 && (float) ($profile['avg_course_progress_percent'] ?? 0) < 30) {
                $lowProgress++;
            }
        }

        $total = count($profiles);

        return [
            'students_evaluated' => $total,
            'inactive_14d' => $inactive14,
            'inactive_30d' => $inactive30,
            'no_activity_recorded' => $noActivity,
            'low_progress_students' => $lowProgress,
            'inactive_14d_rate_percent' => $total > 0 ? round(($inactive14 / $total) * 100, 1) : null,
            'recommended_actions' => $this->buildEngagementRecommendations($inactive14, $inactive30, $noActivity, $lowProgress),
        ];
    }

    private function buildEngagementRecommendations(int $inactive14, int $inactive30, int $noActivity, int $lowProgress): array
    {
        $actions = [];
        if ($inactive30 > 0) {
            $actions[] = 'Rulează o campanie de reactivare pentru elevii inactivi de peste 30 zile.';
        }
        if ($inactive14 > 0) {
            $actions[] = 'Trimite reminder personalizat elevilor fără activitate de peste 14 zile.';
        }
        if ($noActivity > 0) {
            $actions[] = 'Trimite mesaj de onboarding elevilor fără activitate înregistrată.';
        }
        if ($lowProgress > 0) {
            $actions[] = 'Recomandă lecții scurte și checkpoint-uri pentru elevii cu progres sub 30%.';
        }

        return $actions ?: ['Engagement-ul nu arată semnale majore de risc în datele disponibile.'];
    }

    private function buildCourseWatchlist(int $limit): array
    {
        if (!SchemaCache::hasTable('courses')) {
            return [];
        }

        return $this->table('courses')
            ->select('id', 'title', 'status')
            ->orderBy('title')
            ->get()
            ->map(function ($course) {
                $stats = $this->getCourseStats((int) $course->id);
                $signals = [];
                $actions = [];
                $enrolled = (int) ($stats['enrolled_students'] ?? 0);
                $avgProgress = $stats['avg_progress_percent'];
                $completionRate = $stats['completion_rate_percent'];

                if ($enrolled === 0) {
                    $signals[] = 'Nu are elevi înscriși.';
                    $actions[] = 'Promovează cursul sau atașează-l într-o mapă/campanie relevantă.';
                }
                if ($enrolled > 0 && $avgProgress !== null && (float) $avgProgress < 30) {
                    $signals[] = 'Progres mediu sub 30%.';
                    $actions[] = 'Verifică primele lecții și adaugă un checkpoint scurt.';
                }
                if ($enrolled > 0 && $completionRate !== null && (float) $completionRate < 25) {
                    $signals[] = 'Rată de finalizare sub 25%.';
                    $actions[] = 'Analizează unde abandonează elevii și simplifică secțiunea respectivă.';
                }

                if (empty($signals)) {
                    return null;
                }

                return array_merge([
                    'id' => (int) $course->id,
                    'title' => $course->title,
                    'status' => $course->status ?? null,
                    'signals' => $signals,
                    'recommended_actions' => array_values(array_unique($actions)),
                ], $stats);
            })
            ->filter()
            ->sortByDesc(function ($course) {
                return count($course['signals'] ?? []) * 100
                    + (int) (($course['enrolled_students'] ?? 0) === 0 ? 20 : 0);
            })
            ->take(max(1, min(50, $limit)))
            ->values()
            ->all();
    }

    private function buildTestWatchlist(int $limit): array
    {
        if (!SchemaCache::hasTable('tests')) {
            return [];
        }

        return $this->table('tests')
            ->select('id', 'title')
            ->orderBy('title')
            ->get()
            ->map(function ($test) {
                $stats = $this->getTestStats((int) $test->id);
                $signals = [];
                $actions = [];
                $attempts = (int) ($stats['attempts'] ?? 0);
                $passRate = $stats['pass_rate_percent'];
                $avgScore = $stats['avg_score_percent'];

                if ($attempts === 0) {
                    $signals[] = 'Nu are încercări.';
                    $actions[] = 'Atașează testul într-un curs activ sau comunică elevilor că este disponibil.';
                }
                if ($attempts > 0 && $passRate !== null && (float) $passRate < 50) {
                    $signals[] = 'Rată de promovare sub 50%.';
                    $actions[] = 'Revizuiește dificultatea și oferă lecții remediale înainte de retestare.';
                }
                if ($attempts > 0 && $avgScore !== null && (float) $avgScore < 60) {
                    $signals[] = 'Scor mediu sub 60%.';
                    $actions[] = 'Analizează întrebările cu rată mare de greșeală.';
                }

                if (empty($signals)) {
                    return null;
                }

                return array_merge([
                    'id' => (int) $test->id,
                    'title' => $test->title,
                    'signals' => $signals,
                    'recommended_actions' => array_values(array_unique($actions)),
                ], $stats);
            })
            ->filter()
            ->sortByDesc(fn ($test) => count($test['signals'] ?? []) * 100)
            ->take(max(1, min(50, $limit)))
            ->values()
            ->all();
    }

    private function buildStudentRiskAnalysis(int $limit): array
    {
        $profiles = $this->buildStudentProfiles(200)['students'] ?? [];
        $students = [];

        foreach ($profiles as $profile) {
            $risk = $this->assessStudentRisk($profile);
            if (($risk['risk_score'] ?? 0) <= 0) {
                continue;
            }

            $students[] = array_merge($profile, $risk);
        }

        usort($students, fn ($a, $b) => ($b['risk_score'] ?? 0) <=> ($a['risk_score'] ?? 0));

        $high = count(array_filter($students, fn ($s) => ($s['risk_level'] ?? '') === 'high'));
        $medium = count(array_filter($students, fn ($s) => ($s['risk_level'] ?? '') === 'medium'));
        $low = count(array_filter($students, fn ($s) => ($s['risk_level'] ?? '') === 'low'));

        return [
            'generated_at' => Carbon::now()->toIso8601String(),
            'rules' => [
                'high' => '70+ puncte: inactivitate, progres foarte slab sau scoruri mici',
                'medium' => '40-69 puncte: risc moderat, necesită intervenție',
                'low' => '20-39 puncte: urmărește evoluția',
            ],
            'summary' => [
                'students_evaluated' => count($profiles),
                'at_risk_total' => count($students),
                'high' => $high,
                'medium' => $medium,
                'low' => $low,
            ],
            'students' => array_slice($students, 0, max(1, min(50, $limit))),
        ];
    }

    private function assessStudentRisk(array $profile): array
    {
        $score = 0;
        $reasons = [];
        $recommendations = [];

        $enrolledCourses = (int) ($profile['enrolled_courses'] ?? 0);
        $completedCourses = (int) ($profile['completed_courses'] ?? 0);
        $avgProgress = $profile['avg_course_progress_percent'];
        $testAttempts = (int) ($profile['test_attempts'] ?? 0);
        $passedTests = (int) ($profile['passed_tests'] ?? 0);
        $avgScore = $profile['avg_test_score_percent'];
        $learningHours = $profile['learning_hours'];
        $daysSinceActivity = $this->daysSince($profile['last_activity_at'] ?? null);
        $daysSinceRegistration = $this->daysSince($profile['registered_at'] ?? null);

        if ($daysSinceActivity !== null) {
            if ($daysSinceActivity >= 30) {
                $score += 35;
                $reasons[] = "Inactiv de {$daysSinceActivity} zile.";
                $recommendations[] = 'Trimite un reminder personalizat și propune reluarea de la ultima lecție accesată.';
            } elseif ($daysSinceActivity >= 14) {
                $score += 20;
                $reasons[] = "Activitate slabă: ultima activitate acum {$daysSinceActivity} zile.";
                $recommendations[] = 'Verifică dacă are blocaje și recomandă o sesiune scurtă de recapitulare.';
            }
        } elseif ($daysSinceRegistration !== null && $daysSinceRegistration >= 7) {
            $score += 25;
            $reasons[] = 'Nu are activitate înregistrată după înscriere.';
            $recommendations[] = 'Trimite mesaj de onboarding și recomandă primul curs/primul modul.';
        }

        if ($enrolledCourses > 0) {
            if ($avgProgress === null || (float) $avgProgress < 10) {
                $score += 30;
                $reasons[] = 'Progres mediu foarte scăzut la cursuri.';
                $recommendations[] = 'Recomandă o lecție scurtă și setează un obiectiv de progres pentru următoarele 7 zile.';
            } elseif ((float) $avgProgress < 30) {
                $score += 20;
                $reasons[] = 'Progres mediu sub 30%.';
                $recommendations[] = 'Sugerează recapitularea modulelor începute și un checkpoint rapid.';
            } elseif ((float) $avgProgress < 60) {
                $score += 10;
                $reasons[] = 'Progres mediu încă sub 60%.';
            }

            if ($completedCourses === 0) {
                $score += 10;
                $reasons[] = 'Nu a finalizat niciun curs.';
            }
        }

        if ($testAttempts > 0) {
            if ($avgScore !== null && (float) $avgScore < 50) {
                $score += 35;
                $reasons[] = 'Scor mediu la teste sub 50%.';
                $recommendations[] = 'Recomandă lecții remediale și un test de practică mai scurt.';
            } elseif ($avgScore !== null && (float) $avgScore < 70) {
                $score += 20;
                $reasons[] = 'Scor mediu la teste sub 70%.';
                $recommendations[] = 'Recomandă recapitulare pe întrebările greșite și refacerea testului.';
            }

            $passRate = $testAttempts > 0 ? ($passedTests / $testAttempts) * 100 : null;
            if ($passRate !== null && $passRate < 50) {
                $score += 15;
                $reasons[] = 'Mai puțin de jumătate dintre testele încercate sunt promovate.';
            }
        } elseif ($enrolledCourses > 0) {
            $score += 10;
            $reasons[] = 'Nu are încercări la teste.';
            $recommendations[] = 'Recomandă un quiz diagnostic pentru a verifica nivelul.';
        }

        if ($enrolledCourses > 0 && ($learningHours === null || (float) $learningHours <= 0)) {
            $score += 20;
            $reasons[] = 'Nu are timp de învățare înregistrat.';
        }

        $score = min(100, $score);
        $level = $score >= 70 ? 'high' : ($score >= 40 ? 'medium' : ($score >= 20 ? 'low' : 'none'));

        if (empty($recommendations) && $score > 0) {
            $recommendations[] = 'Monitorizează evoluția și revino cu o recomandare dacă riscul crește.';
        }

        return [
            'risk_score' => $score,
            'risk_level' => $level,
            'risk_reasons' => array_values(array_unique($reasons)),
            'recommended_actions' => array_values(array_unique($recommendations)),
        ];
    }

    private function countActiveStudents(Carbon $since): ?int
    {
        if (SchemaCache::hasTable('lesson_progress') && SchemaCache::hasColumn('lesson_progress', 'updated_at')) {
            return (int) $this->table('lesson_progress')
                ->where('updated_at', '>=', $since)
                ->distinct()
                ->count('user_id');
        }

        if (SchemaCache::hasTable('test_results') && SchemaCache::hasColumn('test_results', 'created_at')) {
            return (int) $this->table('test_results')
                ->where('created_at', '>=', $since)
                ->distinct()
                ->count('user_id');
        }

        return null;
    }

    private function buildCourses(): ?array
    {
        if (!SchemaCache::hasTable('courses')) {
            return null;
        }

        $hasStatus = SchemaCache::hasColumn('courses', 'status');
        $total = (int) $this->table('courses')->count();
        $published = $hasStatus ? (int) $this->table('courses')->where('status', 'published')->count() : null;
        $draft = $hasStatus ? (int) $this->table('courses')->where('status', 'draft')->count() : null;

        $enrollmentStats = [
            'total_enrollments' => null,
            'completed_enrollments' => null,
            'avg_progress_percent' => null,
            'completion_rate_percent' => null,
        ];
        $topCourses = [];

        if (SchemaCache::hasTable('course_user')) {
            $hasProgress = SchemaCache::hasColumn('course_user', 'progress_percentage');
            $hasCompleted = SchemaCache::hasColumn('course_user', 'completed_at');
            $hasEnrolled = SchemaCache::hasColumn('course_user', 'enrolled');

            $base = $this->table('course_user');
            if ($hasEnrolled) {
                $base->where('enrolled', true);
            }

            $totalEnrollments = (int) (clone $base)->count();
            $completedEnrollments = $hasCompleted
                ? (int) (clone $base)->whereNotNull('completed_at')->count()
                : null;
            $avgProgress = $hasProgress
                ? round((float) (clone $base)->avg('progress_percentage'), 1)
                : null;

            $enrollmentStats = [
                'total_enrollments' => $totalEnrollments,
                'completed_enrollments' => $completedEnrollments,
                'avg_progress_percent' => $avgProgress,
                'completion_rate_percent' => ($completedEnrollments !== null && $totalEnrollments > 0)
                    ? round(($completedEnrollments / $totalEnrollments) * 100, 1)
                    : null,
            ];

            $selects = [
                'courses.id',
                'courses.title',
                DB::raw('COUNT(course_user.user_id) as enrolled'),
            ];
            if ($hasCompleted) {
                $selects[] = DB::raw('SUM(CASE WHEN course_user.completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed');
            }
            if ($hasProgress) {
                $selects[] = DB::raw('AVG(course_user.progress_percentage) as avg_progress');
            }

            $topQuery = $this->table('courses')
                ->leftJoin('course_user', 'course_user.course_id', '=', 'courses.id');
            if ($hasEnrolled) {
                $topQuery->where(function ($q) {
                    $q->where('course_user.enrolled', true)->orWhereNull('course_user.user_id');
                });
            }

            $topCourses = $topQuery
                ->select($selects)
                ->groupBy('courses.id', 'courses.title')
                ->orderByDesc('enrolled')
                ->limit(10)
                ->get()
                ->map(function ($row) {
                    $enrolled = (int) $row->enrolled;
                    $completed = isset($row->completed) ? (int) $row->completed : null;

                    return array_filter([
                        'title' => $row->title,
                        'enrolled' => $enrolled,
                        'completed' => $completed,
                        'completion_rate_percent' => ($completed !== null && $enrolled > 0)
                            ? round(($completed / $enrolled) * 100, 1)
                            : null,
                        'avg_progress_percent' => isset($row->avg_progress)
                            ? round((float) $row->avg_progress, 1)
                            : null,
                    ], fn ($v) => $v !== null);
                })
                ->all();
        }

        return array_merge([
            'total' => $total,
            'published' => $published,
            'draft' => $draft,
            'top_courses' => $topCourses,
        ], $enrollmentStats);
    }

    private function buildTests(): ?array
    {
        if (!SchemaCache::hasTable('tests')) {
            return null;
        }

        $total = (int) $this->table('tests')->count();
        $attempts = null;
        $passed = null;
        $avgScore = null;
        $topTests = [];

        if (SchemaCache::hasTable('test_results')) {
            $hasPassed = SchemaCache::hasColumn('test_results', 'passed');
            $hasPercentage = SchemaCache::hasColumn('test_results', 'percentage');

            $attempts = (int) $this->table('test_results')->count();
            $passed = $hasPassed ? (int) $this->table('test_results')->where('passed', true)->count() : null;
            $avgScore = $hasPercentage ? round((float) $this->table('test_results')->avg('percentage'), 1) : null;

            if (SchemaCache::hasColumn('test_results', 'test_id')) {
                $selects = [
                    'tests.title',
                    DB::raw('COUNT(test_results.id) as attempts'),
                ];
                if ($hasPassed) {
                    $selects[] = DB::raw('SUM(CASE WHEN test_results.passed THEN 1 ELSE 0 END) as passed');
                }
                if ($hasPercentage) {
                    $selects[] = DB::raw('AVG(test_results.percentage) as avg_percentage');
                }

                $topTests = $this->table('tests')
                    ->leftJoin('test_results', 'test_results.test_id', '=', 'tests.id')
                    ->select($selects)
                    ->groupBy('tests.id', 'tests.title')
                    ->orderByDesc('attempts')
                    ->limit(10)
                    ->get()
                    ->map(function ($row) {
                        $a = (int) $row->attempts;
                        $p = isset($row->passed) ? (int) $row->passed : null;

                        return array_filter([
                            'title' => $row->title,
                            'attempts' => $a,
                            'pass_rate_percent' => ($p !== null && $a > 0) ? round(($p / $a) * 100, 1) : null,
                            'avg_score_percent' => isset($row->avg_percentage) ? round((float) $row->avg_percentage, 1) : null,
                        ], fn ($v) => $v !== null);
                    })
                    ->all();
            }
        }

        return [
            'total' => $total,
            'total_attempts' => $attempts,
            'passed_attempts' => $passed,
            'pass_rate_percent' => ($passed !== null && $attempts > 0) ? round(($passed / $attempts) * 100, 1) : null,
            'avg_score_percent' => $avgScore,
            'top_tests' => $topTests,
        ];
    }

    private function buildExams(): ?array
    {
        if (!SchemaCache::hasTable('exams')) {
            return null;
        }

        $total = (int) $this->table('exams')->count();
        $attempts = null;
        $passed = null;

        if (SchemaCache::hasTable('exam_results')) {
            $attempts = (int) $this->table('exam_results')->count();
            if (SchemaCache::hasColumn('exam_results', 'passed')) {
                $passed = (int) $this->table('exam_results')->where('passed', true)->count();
            }
        }

        return [
            'total' => $total,
            'total_attempts' => $attempts,
            'passed_attempts' => $passed,
            'pass_rate_percent' => ($passed !== null && $attempts > 0) ? round(($passed / $attempts) * 100, 1) : null,
        ];
    }

    private function buildEvents(): ?array
    {
        if (!SchemaCache::hasTable('events')) {
            return null;
        }

        $total = (int) $this->table('events')->count();
        $upcoming = null;

        $dateColumn = SchemaCache::hasColumn('events', 'start_at')
            ? 'start_at'
            : (SchemaCache::hasColumn('events', 'starts_at')
                ? 'starts_at'
                : (SchemaCache::hasColumn('events', 'start_date') ? 'start_date' : null));

        if ($dateColumn) {
            $upcoming = (int) $this->table('events')->where($dateColumn, '>=', Carbon::now())->count();
        }

        return [
            'total' => $total,
            'upcoming' => $upcoming,
        ];
    }

    private function buildLearning(): ?array
    {
        if (!SchemaCache::hasTable('lesson_progress') || !SchemaCache::hasColumn('lesson_progress', 'time_spent_seconds')) {
            return null;
        }

        $seconds = (int) $this->table('lesson_progress')->sum('time_spent_seconds');

        return [
            'total_hours' => round($seconds / 3600, 1),
            'total_seconds' => $seconds,
        ];
    }

    private function getEnrollmentAggregatesForUsers(array $userIds): array
    {
        if (empty($userIds) || !SchemaCache::hasTable('course_user')) {
            return [];
        }

        $selects = [
            'user_id',
            DB::raw('COUNT(course_id) as enrolled_courses'),
        ];

        if (SchemaCache::hasColumn('course_user', 'completed_at')) {
            $selects[] = DB::raw('SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_courses');
        }
        if (SchemaCache::hasColumn('course_user', 'progress_percentage')) {
            $selects[] = DB::raw('AVG(progress_percentage) as avg_course_progress_percent');
        }

        $query = $this->table('course_user')
            ->select($selects)
            ->whereIn('user_id', $userIds);

        if (SchemaCache::hasColumn('course_user', 'enrolled')) {
            $query->where('enrolled', true);
        }

        return $query
            ->groupBy('user_id')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->user_id => [
                    'enrolled_courses' => (int) $row->enrolled_courses,
                    'completed_courses' => isset($row->completed_courses) ? (int) $row->completed_courses : 0,
                    'avg_course_progress_percent' => isset($row->avg_course_progress_percent)
                        ? round((float) $row->avg_course_progress_percent, 1)
                        : null,
                ],
            ])
            ->all();
    }

    private function getLearningAggregatesForUsers(array $userIds): array
    {
        if (empty($userIds) || !SchemaCache::hasTable('lesson_progress')) {
            return [];
        }

        $selects = ['user_id'];
        $selects[] = SchemaCache::hasColumn('lesson_progress', 'completed')
            ? DB::raw('SUM(CASE WHEN completed THEN 1 ELSE 0 END) as lessons_completed')
            : DB::raw('0 as lessons_completed');
        $selects[] = SchemaCache::hasColumn('lesson_progress', 'time_spent_seconds')
            ? DB::raw('SUM(time_spent_seconds) as learning_seconds')
            : DB::raw('0 as learning_seconds');

        return $this->table('lesson_progress')
            ->select($selects)
            ->whereIn('user_id', $userIds)
            ->groupBy('user_id')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->user_id => [
                    'lessons_completed' => (int) ($row->lessons_completed ?? 0),
                    'learning_seconds' => (int) ($row->learning_seconds ?? 0),
                ],
            ])
            ->all();
    }

    private function getTestAggregatesForUsers(array $userIds): array
    {
        if (empty($userIds) || !SchemaCache::hasTable('test_results')) {
            return [];
        }

        $selects = [
            'user_id',
            DB::raw('COUNT(id) as test_attempts'),
        ];
        if (SchemaCache::hasColumn('test_results', 'passed')) {
            $selects[] = DB::raw('SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed_tests');
        }
        if (SchemaCache::hasColumn('test_results', 'percentage')) {
            $selects[] = DB::raw('AVG(percentage) as avg_test_score_percent');
        }

        return $this->table('test_results')
            ->select($selects)
            ->whereIn('user_id', $userIds)
            ->groupBy('user_id')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->user_id => [
                    'test_attempts' => (int) $row->test_attempts,
                    'passed_tests' => isset($row->passed_tests) ? (int) $row->passed_tests : 0,
                    'avg_test_score_percent' => isset($row->avg_test_score_percent)
                        ? round((float) $row->avg_test_score_percent, 1)
                        : null,
                ],
            ])
            ->all();
    }

    private function getLastActivityForUsers(array $userIds): array
    {
        if (empty($userIds)) {
            return [];
        }

        $dates = [];
        $mergeDate = function (int $userId, mixed $value) use (&$dates) {
            $formatted = $this->formatNullableDate($value);
            if (!$formatted) {
                return;
            }
            if (!isset($dates[$userId]) || strcmp($formatted, $dates[$userId]) > 0) {
                $dates[$userId] = $formatted;
            }
        };

        if (SchemaCache::hasTable('lesson_progress') && SchemaCache::hasColumn('lesson_progress', 'updated_at')) {
            $this->table('lesson_progress')
                ->select('user_id', DB::raw('MAX(updated_at) as last_at'))
                ->whereIn('user_id', $userIds)
                ->groupBy('user_id')
                ->get()
                ->each(fn ($row) => $mergeDate((int) $row->user_id, $row->last_at));
        }

        if (SchemaCache::hasTable('test_results')) {
            $dateColumn = SchemaCache::hasColumn('test_results', 'completed_at')
                ? 'completed_at'
                : (SchemaCache::hasColumn('test_results', 'created_at') ? 'created_at' : null);

            if ($dateColumn) {
                $this->table('test_results')
                    ->select('user_id', DB::raw("MAX({$dateColumn}) as last_at"))
                    ->whereIn('user_id', $userIds)
                    ->groupBy('user_id')
                    ->get()
                    ->each(fn ($row) => $mergeDate((int) $row->user_id, $row->last_at));
            }
        }

        if (SchemaCache::hasTable('course_user') && SchemaCache::hasColumn('course_user', 'updated_at')) {
            $this->table('course_user')
                ->select('user_id', DB::raw('MAX(updated_at) as last_at'))
                ->whereIn('user_id', $userIds)
                ->groupBy('user_id')
                ->get()
                ->each(fn ($row) => $mergeDate((int) $row->user_id, $row->last_at));
        }

        return $dates;
    }

    private function getCourseDetailsForUsers(array $userIds): array
    {
        if (empty($userIds) || !SchemaCache::hasTable('course_user') || !SchemaCache::hasTable('courses')) {
            return [];
        }

        $selects = [
            'course_user.user_id',
            'courses.title',
        ];
        $selects[] = SchemaCache::hasColumn('course_user', 'progress_percentage')
            ? 'course_user.progress_percentage'
            : DB::raw('NULL as progress_percentage');
        $selects[] = SchemaCache::hasColumn('course_user', 'completed_at')
            ? 'course_user.completed_at'
            : DB::raw('NULL as completed_at');
        $selects[] = SchemaCache::hasColumn('course_user', 'enrolled_at')
            ? 'course_user.enrolled_at'
            : DB::raw('NULL as enrolled_at');

        $query = $this->table('course_user')
            ->join('courses', 'courses.id', '=', 'course_user.course_id')
            ->select($selects)
            ->whereIn('course_user.user_id', $userIds)
            ->orderBy('courses.title');

        if (SchemaCache::hasColumn('course_user', 'enrolled')) {
            $query->where('course_user.enrolled', true);
        }

        $out = [];
        foreach ($query->get() as $row) {
            $out[(int) $row->user_id][] = [
                'title' => $row->title,
                'progress_percent' => $row->progress_percentage !== null ? (int) $row->progress_percentage : null,
                'completed_at' => $this->formatNullableDate($row->completed_at ?? null),
                'enrolled_at' => $this->formatNullableDate($row->enrolled_at ?? null),
            ];
        }

        return $out;
    }

    private function getRecentTestDetailsForUsers(array $userIds): array
    {
        if (empty($userIds) || !SchemaCache::hasTable('test_results')) {
            return [];
        }

        $hasTestsTable = SchemaCache::hasTable('tests') && SchemaCache::hasColumn('test_results', 'test_id');
        $dateColumn = SchemaCache::hasColumn('test_results', 'completed_at')
            ? 'completed_at'
            : (SchemaCache::hasColumn('test_results', 'created_at') ? 'created_at' : null);

        $query = $this->table('test_results')
            ->select([
                'test_results.user_id',
                $hasTestsTable ? 'tests.title as test_title' : DB::raw('NULL as test_title'),
                SchemaCache::hasColumn('test_results', 'percentage') ? 'test_results.percentage' : DB::raw('NULL as percentage'),
                SchemaCache::hasColumn('test_results', 'passed') ? 'test_results.passed' : DB::raw('NULL as passed'),
                $dateColumn ? 'test_results.' . $dateColumn . ' as completed_at' : DB::raw('NULL as completed_at'),
            ])
            ->whereIn('test_results.user_id', $userIds);

        if ($hasTestsTable) {
            $query->leftJoin('tests', 'tests.id', '=', 'test_results.test_id');
        }
        if ($dateColumn) {
            $query->orderByDesc('test_results.' . $dateColumn);
        }

        $out = [];
        foreach ($query->limit(80)->get() as $row) {
            $userRows = $out[(int) $row->user_id] ?? [];
            if (count($userRows) >= 8) {
                continue;
            }
            $userRows[] = [
                'test_title' => $row->test_title ?? 'Test',
                'percentage' => $row->percentage !== null ? round((float) $row->percentage, 1) : null,
                'passed' => $row->passed !== null ? (bool) $row->passed : null,
                'completed_at' => $this->formatNullableDate($row->completed_at ?? null),
            ];
            $out[(int) $row->user_id] = $userRows;
        }

        return $out;
    }

    private function getCourseStats(int $courseId): array
    {
        if (!SchemaCache::hasTable('course_user')) {
            return [];
        }

        $query = $this->table('course_user')->where('course_id', $courseId);
        if (SchemaCache::hasColumn('course_user', 'enrolled')) {
            $query->where('enrolled', true);
        }

        $enrolled = (int) (clone $query)->count();
        $completed = SchemaCache::hasColumn('course_user', 'completed_at')
            ? (int) (clone $query)->whereNotNull('completed_at')->count()
            : null;
        $avgProgress = SchemaCache::hasColumn('course_user', 'progress_percentage')
            ? round((float) (clone $query)->avg('progress_percentage'), 1)
            : null;

        return [
            'enrolled_students' => $enrolled,
            'completed_students' => $completed,
            'completion_rate_percent' => ($completed !== null && $enrolled > 0)
                ? round(($completed / $enrolled) * 100, 1)
                : null,
            'avg_progress_percent' => $avgProgress,
        ];
    }

    private function getTestStats(int $testId): array
    {
        if (!SchemaCache::hasTable('test_results')) {
            return [];
        }

        $query = $this->table('test_results')->where('test_id', $testId);
        $attempts = (int) (clone $query)->count();
        $passed = SchemaCache::hasColumn('test_results', 'passed')
            ? (int) (clone $query)->where('passed', true)->count()
            : null;
        $avgScore = SchemaCache::hasColumn('test_results', 'percentage')
            ? round((float) (clone $query)->avg('percentage'), 1)
            : null;

        return [
            'attempts' => $attempts,
            'passed_attempts' => $passed,
            'pass_rate_percent' => ($passed !== null && $attempts > 0)
                ? round(($passed / $attempts) * 100, 1)
                : null,
            'avg_score_percent' => $avgScore,
        ];
    }

    private function extractSearchTokens(string $prompt): array
    {
        $normalized = mb_strtolower($prompt);
        preg_match_all('/[\\pL\\pN@._-]{3,}/u', $normalized, $matches);
        $stopWords = [
            'care', 'este', 'sunt', 'cati', 'câte', 'cate', 'pentru', 'despre', 'vreau', 'arată',
            'arata', 'elev', 'elevi', 'student', 'studenți', 'studenti', 'curs', 'cursuri',
            'test', 'teste', 'scor', 'progres', 'ultima', 'ultimele', 'luna', 'zile', 'din',
            'are', 'avut', 'făcut', 'facut', 'studentul', 'elevul', 'scoruri', 'rezultate',
            'activitate', 'activ', 'activa', 'active', 'spune', 'aratami', 'arată-mi',
        ];

        return array_values(array_unique(array_filter($matches[0] ?? [], function ($token) use ($stopWords) {
            return !in_array($token, $stopWords, true) && mb_strlen($token) >= 3;
        })));
    }

    private function formatNullableDate(mixed $value): ?string
    {
        if (!$value) {
            return null;
        }

        try {
            return Carbon::parse($value)->toIso8601String();
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function daysSince(mixed $value): ?int
    {
        if (!$value) {
            return null;
        }

        try {
            return (int) floor(max(0, Carbon::parse($value)->diffInDays(Carbon::now())));
        } catch (\Throwable) {
            return null;
        }
    }

    private function buildRecentActivity(): array
    {
        $since = Carbon::now()->subDays(30);
        $activity = [];

        if (SchemaCache::hasTable('users') && SchemaCache::hasColumn('users', 'created_at')) {
            $activity['new_users'] = (int) $this->table('users')->where('created_at', '>=', $since)->count();
        }

        if (SchemaCache::hasTable('course_user')) {
            if (SchemaCache::hasColumn('course_user', 'enrolled_at')) {
                $activity['new_enrollments'] = (int) $this->table('course_user')->where('enrolled_at', '>=', $since)->count();
            }
            if (SchemaCache::hasColumn('course_user', 'completed_at')) {
                $activity['course_completions'] = (int) $this->table('course_user')
                    ->whereNotNull('completed_at')
                    ->where('completed_at', '>=', $since)
                    ->count();
            }
        }

        if (SchemaCache::hasTable('test_results') && SchemaCache::hasColumn('test_results', 'created_at')) {
            $activity['test_attempts'] = (int) $this->table('test_results')->where('created_at', '>=', $since)->count();
        }

        return $activity;
    }
}
