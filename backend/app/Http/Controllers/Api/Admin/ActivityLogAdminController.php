<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogAdminController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot accesa jurnalul de activitate.');
        }
    }

    public function index(Request $request)
    {
        $perPage = min(100, max(1, (int) $request->get('per_page', 50)));
        $search = $request->get('search');
        $action = $request->get('action');
        $modelType = $request->get('model_type');
        $userId = $request->get('user_id');
        $dateFrom = $request->get('date_from');
        $dateTo = $request->get('date_to');
        $actionScope = $request->get('action_scope'); // elev_progres | all | telemetry | learner | admin_ops | legacy
        $excludeSelf = $request->boolean('exclude_self', true);

        $sortBy = $request->get('sort_by', 'created_at');
        if (! in_array($sortBy, ['created_at', 'action'], true)) {
            $sortBy = 'created_at';
        }
        $sortDir = strtolower((string) $request->get('sort_dir', 'desc'));
        if (! in_array($sortDir, ['asc', 'desc'], true)) {
            $sortDir = 'desc';
        }
        if ($sortBy === 'action') {
            $sortDir = $sortDir === 'asc' ? 'asc' : 'desc';
        } else {
            $sortDir = $sortDir === 'asc' ? 'asc' : 'desc';
        }

        $query = ActivityLog::with('user:id,name,email');

        if ($excludeSelf && ($viewer = $request->user())) {
            $query->where(function ($q) use ($viewer) {
                $q->whereNull('user_id')
                    ->orWhere('user_id', '!=', $viewer->id);
            });
        }

        // Apply filters
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($q) use ($search) {
                      $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        if ($action) {
            $query->where('action', $action);
        }

        if ($actionScope && $actionScope !== 'all') {
            match ($actionScope) {
                'elev_progres' => $query->where(function ($q) {
                    $q->whereIn('action', [
                        'completed_course',
                        'completed_exam',
                        'completed_lesson',
                        'enrolled_course',
                    ])
                        ->orWhereIn('action', ['telemetry.learner_attempt_submitted', 'telemetry.learner_focus_seconds']);
                }),
                'telemetry' => $query->where('action', 'like', 'telemetry.%'),
                'learner' => $query->where('action', 'like', 'telemetry.learner%'),
                'admin_ops' => $query->where(function ($q) {
                    $q->where('action', 'like', 'telemetry.admin%')
                        ->orWhere('action', 'like', 'builder.%');
                }),
                'legacy' => $query->where('action', 'not like', 'telemetry.%'),
                'auth' => $query->whereIn('action', ['logged_in', 'logged_out']),
                default => null,
            };
        }

        if ($modelType) {
            $query->where('model_type', $modelType);
        }

        if ($userId) {
            $query->where('user_id', $userId);
        }

        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $query->orderBy($sortBy, $sortDir);
        // Stable order when many rows share the same timestamp
        $query->orderBy('id', $sortDir);

        $logs = $query->paginate($perPage);

        $actionsQuery = ActivityLog::query()->select('action')->distinct()->orderBy('action')->limit(400);
        $modelTypesQuery = ActivityLog::query()->select('model_type')->whereNotNull('model_type')->where('model_type', '!=', '')->distinct()->orderBy('model_type')->limit(200);

        return response()->json([
            'data' => $logs->items(),
            'pagination' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
            'filters' => [
                'actions' => $actionsQuery->pluck('action')->values(),
                'model_types' => $modelTypesQuery->pluck('model_type')->values(),
                'action_scopes' => [
                    ['id' => 'elev_progres', 'label' => 'Progres elevi (cursuri și teste)'],
                    ['id' => 'all', 'label' => 'Tot jurnalul'],
                    ['id' => 'telemetry', 'label' => 'Telemetrie (toate)'],
                    ['id' => 'learner', 'label' => 'Elevi / învățare'],
                    ['id' => 'admin_ops', 'label' => 'Admin & builder'],
                    ['id' => 'legacy', 'label' => 'Fără telemetrie'],
                    ['id' => 'auth', 'label' => 'Autentificare (login / logout)'],
                ],
            ],
        ]);
    }

    public function show($id)
    {
        $log = ActivityLog::with('user:id,name,email')->findOrFail($id);
        return response()->json($log);
    }
}
