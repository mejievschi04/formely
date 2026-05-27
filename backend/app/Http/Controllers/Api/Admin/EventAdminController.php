<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\User;
use App\Models\Course;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class EventAdminController extends Controller
{
    public function index(Request $request)
    {
        $query = Event::with(['instructor:id,name,email', 'course:id,title']);
        if (auth()->user()->isInstructor()) {
            $query->where('instructor_id', auth()->id());
        }

        // Search
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('short_description', 'like', "%{$search}%")
                  ->orWhereHas('instructor', function($q) use ($search) {
                      $q->where('name', 'like', "%{$search}%");
                  });
            });
        }

        // Status filter
        if ($request->filled('status') && $request->status !== 'all') {
            if (Schema::hasColumn('events', 'status')) {
                $status = $request->status;
                $now = now();

                if ($status === 'future') {
                    $query->where(function ($q) use ($now) {
                        $q->whereIn('status', ['published', 'upcoming', 'live'])
                            ->orWhere(function ($dateScoped) use ($now) {
                                $dateScoped->whereNotIn('status', ['draft', 'completed', 'cancelled'])
                                    ->where('end_date', '>=', $now);
                            });
                    });
                } elseif ($status === 'completed') {
                    $query->where(function ($q) use ($now) {
                        $q->where('status', 'completed')
                            ->orWhere(function ($dateScoped) use ($now) {
                                $dateScoped->whereNotIn('status', ['draft', 'cancelled'])
                                    ->where('end_date', '<', $now);
                            });
                    });
                } else {
                    $query->where('status', $status);
                }
            }
        } elseif (Schema::hasColumn('events', 'status')) {
            // Default admin list: no drafts (evenimentele noi se publică automat)
            $query->whereNotIn('status', ['draft']);
        }

        // Type filter
        if ($request->has('type') && $request->type !== 'all') {
            $query->where('type', $request->type);
        }

        // Access type filter
        if ($request->has('access_type') && $request->access_type !== 'all') {
            if (Schema::hasColumn('events', 'access_type')) {
                $query->where('access_type', $request->access_type);
            }
        }

        // Instructor filter
        if ($request->has('instructor') && $request->instructor) {
            if (Schema::hasColumn('events', 'instructor_id')) {
                $query->where('instructor_id', $request->instructor);
            }
        }

        // Date range filter
        if ($request->has('date_from')) {
            $query->where('start_date', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->where('start_date', '<=', $request->date_to);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'start_date');
        $sortDirection = $request->get('sort_direction', 'asc');

        switch ($sortBy) {
            case 'registrations':
                $query->orderBy('registrations_count', $sortDirection);
                break;
            case 'attendance':
                $query->orderBy('attendance_count', $sortDirection);
                break;
            case 'title':
                $query->orderBy('title', $sortDirection);
                break;
            default:
                $query->orderBy($sortBy, $sortDirection);
        }

        $perPage = $request->get('per_page', 50);
        $events = $query->paginate($perPage);

        // Add metrics to each event
        $events->getCollection()->transform(function($event) {
            return $this->addEventMetrics($event);
        });

        return response()->json($events);
    }

    public function show($id)
    {
        $event = Event::with(['instructor', 'course', 'registeredUsers', 'attendedUsers'])
            ->findOrFail($id);
        $this->ensureCanManageEvent($event);

        // Return raw datetime values without timezone conversion
        $event->start_date = $event->getRawOriginal('start_date') ?? $event->start_date;
        $event->end_date = $event->getRawOriginal('end_date') ?? $event->end_date;

        // Add detailed metrics
        $event = $this->addEventMetrics($event);

        // Add registration details
        $event->registration_rate = $event->registration_rate;
        $event->attendance_rate = $event->attendance_rate;
        $event->is_full = $event->is_full;
        $event->is_upcoming = $event->is_upcoming;
        $event->is_live = $event->is_live;
        $event->is_completed = $event->is_completed;

        return response()->json($event);
    }

    public function store(Request $request)
    {
        $this->normalizeOptionalUrls($request);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'short_description' => 'nullable|string',
            'type' => 'required|string|in:live_online,physical,webinar,workshop',
            'status' => 'sometimes|string|in:draft,published,upcoming,live,completed,cancelled',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'timezone' => 'nullable|string|max:50',
            'location' => 'nullable|string|max:255',
            'live_link' => 'nullable|url|max:500',
            'max_capacity' => 'nullable|integer|min:1',
            'instructor_id' => 'nullable|exists:users,id',
            'access_type' => 'nullable|string|in:free,course_included',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'course_id' => 'nullable|exists:courses,id|required_if:access_type,course_included',
            'replay_url' => 'nullable|url|max:500',
            'thumbnail' => 'nullable|string|max:500',
        ]);

        // Parse datetime
        if (isset($validated['start_date'])) {
            $validated['start_date'] = $this->parseLocalDateTime($validated['start_date']);
        }
        if (isset($validated['end_date'])) {
            $validated['end_date'] = $this->parseLocalDateTime($validated['end_date']);
        }

        // Evenimentele create din admin sunt întotdeauna publicate (vizibile pentru elevi)
        $validated['status'] = 'published';

        if (!isset($validated['timezone'])) {
            $validated['timezone'] = 'Europe/Chisinau';
        }
        if (!isset($validated['currency'])) {
            $validated['currency'] = 'RON';
        }
        if (!isset($validated['access_type'])) {
            $validated['access_type'] = 'free';
        }
        // Ensure price is 0 for free events
        if ($validated['access_type'] === 'free') {
            $validated['price'] = 0;
        }

        if (auth()->user()->isInstructor()) {
            $validated['instructor_id'] = auth()->id();
        }

        $event = Event::create($validated);
        $event->refresh();
        $event->load(['instructor', 'course']);

        // Return raw datetime values
        $event->start_date = $event->getRawOriginal('start_date') ?? $event->start_date;
        $event->end_date = $event->getRawOriginal('end_date') ?? $event->end_date;

        return response()->json([
            'message' => 'Eveniment creat cu succes',
            'event' => $this->addEventMetrics($event),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $event = Event::findOrFail($id);
        $this->ensureCanManageEvent($event);

        $this->normalizeOptionalUrls($request);

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|required|string',
            'short_description' => 'nullable|string',
            'type' => 'sometimes|required|string|in:live_online,physical,webinar,workshop',
            'status' => 'sometimes|string|in:draft,published,upcoming,live,completed,cancelled',
            'start_date' => 'sometimes|required|date',
            'end_date' => 'sometimes|required|date|after_or_equal:start_date',
            'timezone' => 'nullable|string|max:50',
            'location' => 'nullable|string|max:255',
            'live_link' => 'nullable|url|max:500',
            'max_capacity' => 'nullable|integer|min:1',
            'instructor_id' => 'nullable|exists:users,id',
            'access_type' => 'sometimes|nullable|string|in:free,course_included',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'course_id' => 'nullable|exists:courses,id|required_if:access_type,course_included',
            'replay_url' => 'nullable|url|max:500',
            'thumbnail' => 'nullable|string|max:500',
        ]);

        // Parse datetime
        if (isset($validated['start_date'])) {
            $validated['start_date'] = $this->parseLocalDateTime($validated['start_date']);
        }
        if (isset($validated['end_date'])) {
            $validated['end_date'] = $this->parseLocalDateTime($validated['end_date']);
        }

        // Set default values for update
        if (!isset($validated['access_type'])) {
            $validated['access_type'] = 'free';
        }
        // Ensure price is 0 for free events
        if ($validated['access_type'] === 'free') {
            $validated['price'] = 0;
        }

        if (auth()->user()->isInstructor()) {
            unset($validated['instructor_id']);
        }

        $event->update($validated);
        $event->refresh();
        $event->load(['instructor', 'course']);

        // Update KPI counts
        $event->updateKPIs();

        // Return raw datetime values
        $event->start_date = $event->getRawOriginal('start_date') ?? $event->start_date;
        $event->end_date = $event->getRawOriginal('end_date') ?? $event->end_date;

        return response()->json([
            'message' => 'Eveniment actualizat cu succes',
            'event' => $this->addEventMetrics($event),
        ]);
    }

    public function destroy($id)
    {
        $event = Event::findOrFail($id);
        $this->ensureCanManageEvent($event);
        $event->delete();

        return response()->json([
            'message' => 'Eveniment șters cu succes',
        ]);
    }

    /**
     * Admin marchează / elimină prezența unui participant înscris.
     */
    public function updateParticipantAttendance(Request $request, $id, $userId)
    {
        $event = Event::findOrFail($id);
        $this->ensureCanManageEvent($event);

        $validated = $request->validate([
            'attended' => 'required|boolean',
        ]);

        if (! Schema::hasTable('event_user')) {
            return response()->json(['message' => 'Înregistrările nu sunt disponibile'], 400);
        }

        $registration = DB::table('event_user')
            ->where('event_id', $event->id)
            ->where('user_id', $userId)
            ->where('registered', true)
            ->first();

        if (! $registration) {
            return response()->json(['message' => 'Utilizatorul nu este înscris la acest eveniment'], 404);
        }

        $attended = (bool) $validated['attended'];
        DB::table('event_user')
            ->where('event_id', $event->id)
            ->where('user_id', $userId)
            ->update([
                'attended' => $attended,
                'attended_at' => $attended ? now() : null,
                'updated_at' => now(),
            ]);

        $event->updateKPIs();
        $event->refresh();
        $event->load(['registeredUsers']);

        return response()->json([
            'message' => $attended ? 'Prezență marcată' : 'Prezență eliminată',
            'registrations_count' => $event->registrations_count,
            'attendance_count' => $event->attendance_count,
            'registered_users' => $event->registeredUsers,
        ]);
    }

    /**
     * Quick actions: publish, unpublish, cancel, complete
     */
    public function quickAction(Request $request, $id, $action)
    {
        $event = Event::findOrFail($id);
        $this->ensureCanManageEvent($event);

        switch ($action) {
            case 'publish':
                if ($event->status === 'draft') {
                    $event->status = 'published';
                    $event->save();
                    return response()->json([
                        'message' => 'Eveniment publicat cu succes',
                        'event' => $this->addEventMetrics($event),
                    ]);
                }
                return response()->json(['message' => 'Evenimentul nu poate fi publicat'], 400);

            case 'unpublish':
                if (in_array($event->status, ['published', 'upcoming'])) {
                    $event->status = 'draft';
                    $event->save();
                    return response()->json([
                        'message' => 'Eveniment retras cu succes',
                        'event' => $this->addEventMetrics($event),
                    ]);
                }
                return response()->json(['message' => 'Evenimentul nu poate fi retras'], 400);

            case 'cancel':
                if (!in_array($event->status, ['completed', 'cancelled'])) {
                    $event->status = 'cancelled';
                    $event->save();
                    return response()->json([
                        'message' => 'Eveniment anulat cu succes',
                        'event' => $this->addEventMetrics($event),
                    ]);
                }
                return response()->json(['message' => 'Evenimentul nu poate fi anulat'], 400);

            case 'complete':
                if (in_array($event->status, ['published', 'upcoming', 'live'])) {
                    $event->status = 'completed';
                    $event->save();
                    return response()->json([
                        'message' => 'Eveniment marcat ca finalizat',
                        'event' => $this->addEventMetrics($event),
                    ]);
                }
                return response()->json(['message' => 'Evenimentul nu poate fi finalizat'], 400);

            default:
                return response()->json(['message' => 'Acțiune invalidă'], 400);
        }
    }

    /**
     * Bulk actions
     */
    public function bulkAction(Request $request)
    {
        $request->validate([
            'action' => 'required|string|in:publish,unpublish,cancel,delete',
            'event_ids' => 'required|array',
            'event_ids.*' => 'exists:events,id',
        ]);

        $action = $request->action;
        $eventIds = $request->event_ids;
        $successCount = 0;
        $errors = [];

        foreach ($eventIds as $eventId) {
            try {
                $event = Event::findOrFail($eventId);
                $this->ensureCanManageEvent($event);

                switch ($action) {
                    case 'publish':
                        if ($event->status === 'draft') {
                            $event->status = 'published';
                            $event->save();
                            $successCount++;
                        } else {
                            $errors[] = "Evenimentul #{$eventId} nu poate fi publicat";
                        }
                        break;

                    case 'unpublish':
                        if (in_array($event->status, ['published', 'upcoming'])) {
                            $event->status = 'draft';
                            $event->save();
                            $successCount++;
                        } else {
                            $errors[] = "Evenimentul #{$eventId} nu poate fi retras";
                        }
                        break;

                    case 'cancel':
                        if (!in_array($event->status, ['completed', 'cancelled'])) {
                            $event->status = 'cancelled';
                            $event->save();
                            $successCount++;
                        } else {
                            $errors[] = "Evenimentul #{$eventId} nu poate fi anulat";
                        }
                        break;

                    case 'delete':
                        $event->delete();
                        $successCount++;
                        break;
                }
            } catch (\Exception $e) {
                $errors[] = "Eroare la evenimentul #{$eventId}: " . $e->getMessage();
            }
        }

        return response()->json([
            'message' => "Acțiune executată pentru {$successCount} eveniment(e)",
            'success_count' => $successCount,
            'errors' => $errors,
        ]);
    }

    /**
     * Get insights and analytics
     */
    public function insights()
    {
        $scoped = Event::query();
        if (auth()->user()->isInstructor()) {
            $scoped->where('instructor_id', auth()->id());
        }

        $totalEvents = (clone $scoped)->count();
        $publishedEvents = (clone $scoped)->where('status', 'published')->count();
        $upcomingEvents = (clone $scoped)->where(function ($q) {
            $q->where('status', 'upcoming')
                ->orWhere(function ($q2) {
                    $q2->where('status', 'published')
                        ->where('start_date', '>', now());
                });
        })->count();
        $completedEvents = (clone $scoped)->where('status', 'completed')->count();
        $cancelledEvents = (clone $scoped)->where('status', 'cancelled')->count();

        $myEventIds = (clone $scoped)->pluck('id');
        $instructorScoped = auth()->user()->isInstructor();

        // Total registrations
        $totalRegistrations = 0;
        if (Schema::hasTable('event_user')) {
            $rq = DB::table('event_user')->where('registered', true);
            if ($instructorScoped) {
                $totalRegistrations = $myEventIds->isEmpty() ? 0 : $rq->whereIn('event_id', $myEventIds)->count();
            } else {
                $totalRegistrations = $rq->count();
            }
        }

        // Total attendance
        $totalAttendance = 0;
        if (Schema::hasTable('event_user')) {
            $aq = DB::table('event_user')->where('attended', true);
            if ($instructorScoped) {
                $totalAttendance = $myEventIds->isEmpty() ? 0 : $aq->whereIn('event_id', $myEventIds)->count();
            } else {
                $totalAttendance = $aq->count();
            }
        }

        // Average attendance rate
        $avgAttendanceRate = 0;
        if ($totalRegistrations > 0) {
            $avgAttendanceRate = round(($totalAttendance / $totalRegistrations) * 100, 1);
        }

        // Events with low registration
        $lowRegistrationEvents = (clone $scoped)->where('max_capacity', '>', 0)
            ->get()
            ->filter(function($event) {
                if ($event->max_capacity > 0) {
                    $rate = ($event->registrations_count / $event->max_capacity) * 100;
                    return $rate < 30;
                }
                return false;
            })
            ->take(5)
            ->map(function($event) {
                return [
                    'id' => $event->id,
                    'title' => $event->title,
                    'registration_rate' => $event->registration_rate,
                    'registrations_count' => $event->registrations_count,
                    'max_capacity' => $event->max_capacity,
                ];
            })
            ->values();

        return response()->json([
            'total_events' => $totalEvents,
            'published_events' => $publishedEvents,
            'upcoming_events' => $upcomingEvents,
            'completed_events' => $completedEvents,
            'cancelled_events' => $cancelledEvents,
            'total_registrations' => $totalRegistrations,
            'total_attendance' => $totalAttendance,
            'average_attendance_rate' => $avgAttendanceRate,
            'low_registration_events' => $lowRegistrationEvents,
        ]);
    }

    /**
     * Get list of instructors for filter
     */
    public function getInstructors()
    {
        if (auth()->user()->isInstructor()) {
            $u = auth()->user();

            return response()->json([[
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
            ]]);
        }

        $instructors = User::whereHas('courses')
            ->orWhereHas('events', function($q) {
                $q->whereNotNull('instructor_id');
            })
            ->select('id', 'name', 'email')
            ->orderBy('name')
            ->get();

        return response()->json($instructors);
    }

    /**
     * Add metrics to event
     */
    private function addEventMetrics($event)
    {
        // Update KPI counts if needed
        if (Schema::hasTable('event_user')) {
            $event->registrations_count = DB::table('event_user')
                ->where('event_id', $event->id)
                ->where('registered', true)
                ->count();

            $event->attendance_count = DB::table('event_user')
                ->where('event_id', $event->id)
                ->where('attended', true)
                ->count();

            $event->replay_views_count = DB::table('event_user')
                ->where('event_id', $event->id)
                ->where('watched_replay', true)
                ->count();

            // Save if model is dirty
            if ($event->isDirty(['registrations_count', 'attendance_count', 'replay_views_count'])) {
                $event->save();
            }
        }

        return $event;
    }

    /**
     * Parse datetime-local format (YYYY-MM-DDTHH:mm) as-is without timezone conversion
     */
    private function parseLocalDateTime($dateTimeString)
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $dateTimeString)) {
            return str_replace('T', ' ', $dateTimeString) . ':00';
        }
        return $dateTimeString;
    }

    private function normalizeOptionalUrls(Request $request): void
    {
        $clean = [];
        foreach (['live_link', 'replay_url', 'thumbnail'] as $key) {
            if ($request->has($key) && $request->input($key) === '') {
                $clean[$key] = null;
            }
        }
        if ($clean !== []) {
            $request->merge($clean);
        }
    }

    private function ensureCanManageEvent(Event $event): void
    {
        $user = auth()->user();
        if (! $user) {
            abort(401);
        }
        if ($user->isAdmin() || $user->isAnalyst()) {
            return;
        }
        if ($user->isInstructor() && (int) $event->instructor_id === (int) $user->id) {
            return;
        }
        abort(403, 'Nu poți gestiona acest eveniment.');
    }
}
