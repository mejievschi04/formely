<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityLogAdminController extends Controller
{
    protected const COUNT_CAP = 10000;

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

        // Only the columns the journal list renders; old_values / user_agent can be large.
        $query = ActivityLog::query()
            ->select(['id', 'user_id', 'action', 'description', 'new_values', 'created_at'])
            ->with('user:id,name,email');

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
                  ->orWhereIn('user_id', User::query()
                      ->select('id')
                      ->where('name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%"));
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

        // Range on the raw column (not whereDate) so the created_at index is usable.
        if ($dateFrom && ($from = $this->parseDate($dateFrom))) {
            $query->where('created_at', '>=', $from->startOfDay());
        }

        if ($dateTo && ($to = $this->parseDate($dateTo))) {
            $query->where('created_at', '<', $to->addDay()->startOfDay());
        }

        $query->orderBy($sortBy, $sortDir);
        // Stable order when many rows share the same timestamp
        $query->orderBy('id', $sortDir);

        // An exact COUNT(*) over the whole journal is the slow part on a large table;
        // count at most COUNT_CAP + 1 matching rows and report "10.000+" beyond that.
        $cappedIds = (clone $query)->toBase()->reorder()->select('id')->limit(static::COUNT_CAP + 1);
        $matched = DB::query()->fromSub($cappedIds, 'capped')->count();
        $totalCapped = $matched > static::COUNT_CAP;
        $total = min($matched, static::COUNT_CAP);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($lastPage, max(1, (int) $request->get('page', 1)));

        $items = $query->forPage($page, $perPage)->get();

        return response()->json([
            'data' => $items,
            'pagination' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
                'total_capped' => $totalCapped,
            ],
            'filters' => [
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

    protected function parseDate(string $value): ?Carbon
    {
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
