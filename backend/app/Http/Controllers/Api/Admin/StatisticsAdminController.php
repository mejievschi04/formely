<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Course;
use App\Models\TestResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class StatisticsAdminController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot accesa statisticile.');
        }
    }

    private function hasColumn(string $table, string $column): bool
    {
        return Schema::hasTable($table) && Schema::hasColumn($table, $column);
    }

    private function selectOrNull(string $table, string $column, ?string $alias = null, string $fallback = 'NULL'): mixed
    {
        if ($this->hasColumn($table, $column)) {
            return $table . '.' . $column . ($alias ? ' as ' . $alias : '');
        }

        return DB::raw($fallback . ' as ' . ($alias ?: $column));
    }

    /**
     * Date detaliate pentru hub-ul Statistică: cursuri, elevi, înscrieri, teste, timp pe lecții.
     */
    public function courseTestDetail(Request $request)
    {
        $courseId = $request->get('course_id');
        $userId = $request->get('user_id');
        $dateFrom = $request->get('date_from');
        $dateTo = $request->get('date_to');

        $from = null;
        $to = null;
        if ($dateFrom) {
            try {
                $from = Carbon::parse($dateFrom)->startOfDay();
            } catch (\Throwable $e) {
                $from = null;
            }
        }
        if ($dateTo) {
            try {
                $to = Carbon::parse($dateTo)->endOfDay();
            } catch (\Throwable $e) {
                $to = null;
            }
        }

        $testCourseMap = [];
        if (Schema::hasTable('course_test')) {
            foreach (DB::table('course_test')->select('test_id', 'course_id')->get() as $ct) {
                if (!isset($testCourseMap[(int) $ct->test_id])) {
                    $testCourseMap[(int) $ct->test_id] = (int) $ct->course_id;
                }
            }
        }

        $courses = Course::select('id', 'title', 'updated_at', 'created_at')
            ->orderBy('title')
            ->when($courseId, fn ($q) => $q->where('id', (int) $courseId))
            ->get();

        $enrollments = [];
        if (Schema::hasTable('course_user')) {
            $courseUserHasEnrolled = $this->hasColumn('course_user', 'enrolled');
            $courseUserHasEnrolledAt = $this->hasColumn('course_user', 'enrolled_at');
            $courseUserHasCompletedAt = $this->hasColumn('course_user', 'completed_at');
            $courseUserHasUpdatedAt = $this->hasColumn('course_user', 'updated_at');
            $query = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->where('users.role', 'student')
                ->select(
                    'course_user.user_id',
                    'course_user.course_id',
                    $this->selectOrNull('course_user', 'progress_percentage', null, '0'),
                    $this->selectOrNull('course_user', 'completed_at'),
                    $this->selectOrNull('course_user', 'enrolled_at'),
                    $this->selectOrNull('course_user', 'updated_at')
                );
            if ($courseUserHasEnrolled) {
                $query->where('course_user.enrolled', true);
            }
            if ($courseId) {
                $query->where('course_user.course_id', (int) $courseId);
            }
            if ($userId) {
                $query->where('course_user.user_id', (int) $userId);
            }
            if ($from && $to && ($courseUserHasEnrolledAt || $courseUserHasUpdatedAt || $courseUserHasCompletedAt)) {
                $query->where(function ($q) use ($from, $to) {
                    $added = false;
                    if ($this->hasColumn('course_user', 'enrolled_at')) {
                        $q->whereBetween('course_user.enrolled_at', [$from, $to]);
                        $added = true;
                    }
                    if ($this->hasColumn('course_user', 'updated_at')) {
                        $method = $added ? 'orWhereBetween' : 'whereBetween';
                        $q->{$method}('course_user.updated_at', [$from, $to]);
                        $added = true;
                    }
                    if ($this->hasColumn('course_user', 'completed_at')) {
                        $method = $added ? 'orWhere' : 'where';
                        $q->{$method}(function ($q2) use ($from, $to) {
                            $q2->whereNotNull('course_user.completed_at')
                                ->whereBetween('course_user.completed_at', [$from, $to]);
                        });
                    }
                });
            }

            $enrollments = $query->get()->map(fn ($r) => [
                'user_id' => $r->user_id,
                'course_id' => $r->course_id,
                'progress_percentage' => (int) ($r->progress_percentage ?? 0),
                'completed_at' => $r->completed_at ? Carbon::parse($r->completed_at)->toIso8601String() : null,
                'enrolled_at' => $r->enrolled_at ? Carbon::parse($r->enrolled_at)->toIso8601String() : null,
                'updated_at' => $r->updated_at ? Carbon::parse($r->updated_at)->toIso8601String() : null,
            ])->all();
        }

        $learningKeyed = $this->getLearningAggregatesByUserCourse();

        foreach ($enrollments as &$e) {
            $k = $e['user_id'] . ':' . $e['course_id'];
            $agg = $learningKeyed[$k] ?? null;
            $e['lessons_completed'] = (int) ($agg->lessons_completed ?? 0);
            $e['time_spent_seconds'] = (int) ($agg->time_spent_seconds ?? 0);
        }
        unset($e);

        $testResults = [];
        if (Schema::hasTable('test_results')) {
            $hasTestsTable = Schema::hasTable('tests');
            $hasCourseTestTable = Schema::hasTable('course_test');
            $hasTestIdColumn = $this->hasColumn('test_results', 'test_id');
            $testCompletedColumn = $this->hasColumn('test_results', 'completed_at')
                ? 'completed_at'
                : ($this->hasColumn('test_results', 'created_at') ? 'created_at' : null);

            $query = DB::table('test_results')
                ->join('users', 'users.id', '=', 'test_results.user_id')
                ->where('users.role', 'student');

            if ($hasTestsTable && $hasTestIdColumn) {
                $query->leftJoin('tests', 'tests.id', '=', 'test_results.test_id');
            }
            if ($hasCourseTestTable && $hasTestIdColumn) {
                $query->leftJoin('course_test', 'course_test.test_id', '=', 'test_results.test_id');
            }
            if ($testCompletedColumn) {
                $query->whereNotNull('test_results.' . $testCompletedColumn);
            }

            if ($userId) {
                $query->where('test_results.user_id', (int) $userId);
            }
            if ($courseId && $hasCourseTestTable && $hasTestIdColumn) {
                $query->where('course_test.course_id', (int) $courseId);
            }
            if ($from && $to && $testCompletedColumn) {
                $query->whereBetween('test_results.' . $testCompletedColumn, [$from, $to]);
            }

            $results = $query
                ->select(
                    'test_results.id',
                    'test_results.user_id',
                    $hasTestIdColumn ? 'test_results.test_id' : DB::raw('NULL as test_id'),
                    $this->selectOrNull('test_results', 'passed', null, '0'),
                    $this->selectOrNull('test_results', 'percentage', null, '0'),
                    $this->selectOrNull('test_results', 'score', null, '0'),
                    $this->selectOrNull('test_results', 'max_score'),
                    $this->selectOrNull('test_results', 'correct_answers_count'),
                    $this->selectOrNull('test_results', 'total_questions'),
                    $testCompletedColumn ? 'test_results.' . $testCompletedColumn . ' as completed_at' : DB::raw('NULL as completed_at'),
                    $this->selectOrNull('test_results', 'attempt_number', null, '1'),
                    ($hasTestsTable && $hasTestIdColumn) ? 'tests.title as test_title' : DB::raw('NULL as test_title'),
                    ($hasCourseTestTable && $hasTestIdColumn) ? 'course_test.course_id as course_id' : DB::raw('NULL as course_id')
                )
                ->when($testCompletedColumn, fn ($q) => $q->orderBy('test_results.' . $testCompletedColumn, 'desc'))
                ->get()
                ->map(function ($r) use ($testCourseMap) {
                    return [
                        'user_id' => $r->user_id,
                        'test_id' => $r->test_id,
                        'course_id' => $r->course_id ?? $testCourseMap[(int) $r->test_id] ?? null,
                        'test_title' => $r->test_title,
                        'passed' => (bool) $r->passed,
                        'percentage' => $r->percentage !== null ? round((float) $r->percentage, 1) : null,
                        'score' => $r->score,
                        'max_score' => $r->max_score,
                        'correct_answers_count' => $r->correct_answers_count ?? null,
                        'total_questions' => $r->total_questions ?? null,
                        'completed_at' => $r->completed_at ? Carbon::parse($r->completed_at)->toIso8601String() : null,
                        'attempt_number' => $r->attempt_number,
                    ];
                })->all();

            $testResults = array_merge($testResults, $results);
        }

        if (Schema::hasTable('exam_results')) {
            $hasExamsTable = Schema::hasTable('exams');
            $hasExamIdColumn = $this->hasColumn('exam_results', 'exam_id');
            $examCompletedColumn = $this->hasColumn('exam_results', 'completed_at')
                ? 'completed_at'
                : ($this->hasColumn('exam_results', 'created_at') ? 'created_at' : null);
            $examMaxScoreSelect = $this->hasColumn('exam_results', 'total_points')
                ? 'exam_results.total_points as max_score'
                : $this->selectOrNull('exam_results', 'max_score');

            $query = DB::table('exam_results')
                ->join('users', 'users.id', '=', 'exam_results.user_id')
                ->where('users.role', 'student');

            if ($hasExamsTable && $hasExamIdColumn) {
                $query->leftJoin('exams', 'exams.id', '=', 'exam_results.exam_id');
            }
            if ($examCompletedColumn) {
                $query->whereNotNull('exam_results.' . $examCompletedColumn);
            }

            if ($userId) {
                $query->where('exam_results.user_id', (int) $userId);
            }
            if ($courseId && $hasExamsTable && $hasExamIdColumn && $this->hasColumn('exams', 'course_id')) {
                $query->where('exams.course_id', (int) $courseId);
            }
            if ($from && $to && $examCompletedColumn) {
                $query->whereBetween('exam_results.' . $examCompletedColumn, [$from, $to]);
            }

            $results = $query
                ->select(
                    'exam_results.id',
                    'exam_results.user_id',
                    $hasExamIdColumn ? 'exam_results.exam_id as test_id' : DB::raw('NULL as test_id'),
                    $this->selectOrNull('exam_results', 'passed', null, '0'),
                    $this->selectOrNull('exam_results', 'percentage', null, '0'),
                    $this->selectOrNull('exam_results', 'score', null, '0'),
                    $examMaxScoreSelect,
                    DB::raw('NULL as correct_answers_count'),
                    DB::raw('NULL as total_questions'),
                    $examCompletedColumn ? 'exam_results.' . $examCompletedColumn . ' as completed_at' : DB::raw('NULL as completed_at'),
                    $this->selectOrNull('exam_results', 'attempt_number', null, '1'),
                    ($hasExamsTable && $hasExamIdColumn) ? 'exams.title as test_title' : DB::raw('NULL as test_title'),
                    ($hasExamsTable && $hasExamIdColumn && $this->hasColumn('exams', 'course_id')) ? 'exams.course_id as course_id' : DB::raw('NULL as course_id')
                )
                ->when($examCompletedColumn, fn ($q) => $q->orderBy('exam_results.' . $examCompletedColumn, 'desc'))
                ->get()
                ->map(function ($r) {
                    return [
                        'user_id' => $r->user_id,
                        'test_id' => $r->test_id,
                        'course_id' => $r->course_id ?? null,
                        'test_title' => $r->test_title,
                        'passed' => (bool) $r->passed,
                        'percentage' => $r->percentage !== null ? round((float) $r->percentage, 1) : null,
                        'score' => $r->score,
                        'max_score' => $r->max_score,
                        'correct_answers_count' => null,
                        'total_questions' => null,
                        'completed_at' => $r->completed_at ? Carbon::parse($r->completed_at)->toIso8601String() : null,
                        'attempt_number' => $r->attempt_number,
                    ];
                })->all();

            $testResults = array_merge($testResults, $results);
        }

        usort($testResults, function ($a, $b) {
            return strtotime($b['completed_at'] ?? '') <=> strtotime($a['completed_at'] ?? '');
        });

        $testResults = collect($testResults)
            ->unique(function (array $row) {
                return implode('|', [
                    $row['user_id'] ?? '',
                    $row['test_id'] ?? '',
                    $row['attempt_number'] ?? '',
                    $row['percentage'] ?? '',
                    $row['score'] ?? '',
                    $row['completed_at'] ?? '',
                ]);
            })
            ->values()
            ->all();

        $activityUserIds = collect($enrollments)->pluck('user_id')
            ->merge(collect($testResults)->pluck('user_id'))
            ->unique()
            ->filter()
            ->values();

        $studentsQuery = User::select('id', 'name', 'email', 'created_at')
            ->where('role', 'student')
            ->when($userId, fn ($q) => $q->where('id', (int) $userId));

        if ($from && $to && !$userId) {
            if ($activityUserIds->isEmpty()) {
                $students = collect();
            } else {
                $students = $studentsQuery->whereIn('id', $activityUserIds->all())->orderBy('name')->get();
            }
        } else {
            $students = $studentsQuery->orderBy('name')->get();
        }

        $courseTests = [];
        if (Schema::hasTable('course_test')) {
            $query = DB::table('course_test')->select('course_id', 'test_id');
            if ($courseId) {
                $query->where('course_id', (int) $courseId);
            }
            $courseTests = $query->get()->map(fn ($r) => ['course_id' => $r->course_id, 'test_id' => $r->test_id])->all();
        }

        $totals = [
            'total_learning_seconds' => (int) collect($learningKeyed)->sum(fn ($row) => (int) ($row->time_spent_seconds ?? 0)),
        ];

        return response()->json([
            'courses' => $courses,
            'students' => $students,
            'enrollments' => $enrollments,
            'test_results' => $testResults,
            'course_tests' => $courseTests,
            'meta' => [
                'date_from' => $from?->toDateString(),
                'date_to' => $to?->toDateString(),
                'total_learning_seconds' => $totals['total_learning_seconds'],
            ],
        ]);
    }

    /**
     * @return array<string, object{user_id:int,course_id:int,time_spent_seconds:int,lessons_completed:int}>
     */
    private function getLearningAggregatesByUserCourse(): array
    {
        if (!Schema::hasTable('lesson_progress') || !Schema::hasTable('lessons')) {
            return [];
        }

        $lessonHasCourseId = $this->hasColumn('lessons', 'course_id');
        $lessonHasModuleId = $this->hasColumn('lessons', 'module_id');
        $moduleHasCourseId = Schema::hasTable('modules') && $this->hasColumn('modules', 'course_id');

        if (! $lessonHasCourseId && ! ($lessonHasModuleId && $moduleHasCourseId)) {
            return [];
        }

        $courseExpr = $lessonHasCourseId && $lessonHasModuleId && $moduleHasCourseId
            ? 'COALESCE(l.course_id, m.course_id)'
            : ($lessonHasCourseId ? 'l.course_id' : 'm.course_id');
        $timeExpr = $this->hasColumn('lesson_progress', 'time_spent_seconds')
            ? 'COALESCE(SUM(lp.time_spent_seconds), 0)'
            : '0';
        $completedExpr = $this->hasColumn('lesson_progress', 'completed')
            ? 'SUM(CASE WHEN lp.completed THEN 1 ELSE 0 END)'
            : '0';

        $query = DB::table('lesson_progress as lp')
            ->join('users', 'users.id', '=', 'lp.user_id')
            ->where('users.role', 'student')
            ->join('lessons as l', 'l.id', '=', 'lp.lesson_id');

        if ($lessonHasModuleId && $moduleHasCourseId) {
            $query->leftJoin('modules as m', 'm.id', '=', 'l.module_id');
        }

        $rows = $query
            ->select(
                'lp.user_id',
                DB::raw($courseExpr . ' as course_id'),
                DB::raw($timeExpr . ' as time_spent_seconds'),
                DB::raw($completedExpr . ' as lessons_completed')
            )
            ->whereRaw($courseExpr . ' IS NOT NULL')
            ->groupBy('lp.user_id', DB::raw($courseExpr))
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[$row->user_id . ':' . $row->course_id] = $row;
        }

        return $out;
    }
}
