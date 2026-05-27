<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class StudentActivityController extends Controller
{
    /** @var array<int, string> */
    private const PROGRESS_ACTIONS = [
        'enrolled_course',
        'completed_lesson',
        'completed_course',
        'completed_exam',
        'telemetry.learner_attempt_submitted',
    ];

    /** @var array<int, string> */
    private const AUTH_ACTIONS = [
        'logged_in',
        'logged_out',
    ];

    public function index(Request $request)
    {
        if (! Schema::hasTable('activity_logs')) {
            return response()->json([
                'data' => [],
                'pagination' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => 20,
                    'total' => 0,
                ],
            ]);
        }

        $user = Auth::user();
        $perPage = min(50, max(5, (int) $request->get('per_page', 20)));
        $scope = (string) $request->get('scope', 'progress');
        $action = $request->get('action');

        $query = ActivityLog::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($action) {
            $query->where('action', $action);
        } elseif ($scope === 'auth') {
            $query->whereIn('action', self::AUTH_ACTIONS);
        } elseif ($scope === 'all') {
            $query->where(function ($q) {
                $q->whereIn('action', self::PROGRESS_ACTIONS)
                    ->orWhereIn('action', self::AUTH_ACTIONS);
            });
        } else {
            $query->whereIn('action', self::PROGRESS_ACTIONS);
        }

        $logs = $query->paginate($perPage);

        return response()->json([
            'data' => collect($logs->items())->map(fn (ActivityLog $log) => $this->formatEntry($log))->values(),
            'pagination' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
            'filters' => [
                'scopes' => [
                    ['id' => 'progress', 'label' => 'Progres (cursuri, lecții, teste)'],
                    ['id' => 'auth', 'label' => 'Autentificare'],
                    ['id' => 'all', 'label' => 'Tot'],
                ],
                'actions' => array_merge(self::PROGRESS_ACTIONS, self::AUTH_ACTIONS),
            ],
        ]);
    }

    private function formatEntry(ActivityLog $log): array
    {
        $newValues = is_array($log->new_values) ? $log->new_values : [];

        return [
            'id' => $log->id,
            'action' => $log->action,
            'description' => $log->description,
            'created_at' => $log->created_at?->toIso8601String(),
            'new_values' => $newValues,
            'link' => $this->resolveLink($log->action, $newValues),
        ];
    }

    private function resolveLink(string $action, array $nv): ?string
    {
        $courseId = isset($nv['course_id']) ? (int) $nv['course_id'] : null;
        $lessonId = isset($nv['lesson_id']) ? (int) $nv['lesson_id'] : null;
        $examId = isset($nv['exam_id']) ? (int) $nv['exam_id'] : null;

        if ($action === 'completed_lesson' && $courseId && $lessonId) {
            return "/courses/{$courseId}/lessons/{$lessonId}";
        }

        if (in_array($action, ['enrolled_course', 'completed_course'], true) && $courseId) {
            return "/courses/{$courseId}";
        }

        if (in_array($action, ['completed_exam', 'telemetry.learner_attempt_submitted'], true) && $examId) {
            return "/exams/{$examId}";
        }

        if ($action === 'completed_exam' && $courseId && ! $examId) {
            return "/courses/{$courseId}";
        }

        return null;
    }
}
