<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;
use Carbon\Carbon;

class EventController extends Controller
{
    /**
     * List all published events (user-side)
     */
    public function index(Request $request)
    {
        $query = Event::with(['instructor:id,name,email,avatar', 'course:id,title'])
            ->where(function ($q) {
                $q->whereIn('status', ['published', 'upcoming', 'live'])
                    ->orWhere(function ($dateScoped) {
                        $dateScoped->whereNotIn('status', ['draft', 'cancelled', 'completed'])
                            ->whereNotNull('end_date');
                    });
            })
            ->where(function ($q) {
                $q->whereNull('end_date')->orWhere('end_date', '>=', now());
            });

        if (SchemaCache::hasTable('event_team')) {
            $query->with('teams:id,name');
        }

        // Type filter
        if ($request->has('type') && $request->type !== 'all') {
            $query->where('type', $request->type);
        }

        // Access type filter
        if ($request->has('access_type') && $request->access_type !== 'all') {
            if (SchemaCache::hasColumn('events', 'access_type')) {
                $query->where('access_type', $request->access_type);
            }
        }

        // Date filter: upcoming, live. Past events stay hidden on the student list.
        if ($request->has('date_filter')) {
            $now = now();
            switch ($request->date_filter) {
                case 'upcoming':
                    $query->where('start_date', '>', $now);
                    break;
                case 'past':
                case 'completed':
                    $query->whereRaw('1 = 0');
                    break;
                case 'live':
                    $query->where('start_date', '<=', $now)
                          ->where('end_date', '>=', $now);
                    break;
            }
        }

        // Sort
        $sortBy = $request->get('sort_by', 'start_date');
        $sortDirection = $request->get('sort_direction', 'asc');

        $query->orderBy($sortBy, $sortDirection);

        $perPage = $request->get('per_page', 20);
        $events = $query->paginate($perPage);

        $user = Auth::user();
        $userTeamIds = $user && method_exists($user, 'teams')
            ? $user->teams()->pluck('teams.id')->all()
            : [];

        $events->setCollection(
            $events->getCollection()
                ->filter(fn ($event) => $this->eventVisibleToUser($event, $user, $userTeamIds))
                ->values()
        );

        // Add user-specific data if authenticated
        if (Auth::check()) {
            $events->getCollection()->transform(function($event) {
                $event = $this->addUserEventData($event);
                $event = $this->hideRestrictedEventLinks($event);
                $event->is_upcoming = $event->is_upcoming;
                $event->is_live = $event->is_live;
                $event->is_completed = $event->is_completed;
                return $event;
            });
        } else {
            $events->getCollection()->transform(function($event) {
                $event = $this->hideRestrictedEventLinks($event);
                $event->is_upcoming = $event->is_upcoming;
                $event->is_live = $event->is_live;
                $event->is_completed = $event->is_completed;
                return $event;
            });
        }

        return response()->json($events);
    }

    /**
     * Show event details (user-side)
     */
    public function show($id)
    {
        $event = Event::with(['instructor', 'course'])
            ->where(function($q) {
                $q->where('status', 'published')
                  ->orWhere('status', 'upcoming')
                  ->orWhere('status', 'live')
                  ->orWhere('status', 'completed');
            })
            ->findOrFail($id);

        $endRaw = $event->getRawOriginal('end_date') ?? $event->end_date;
        if ($endRaw && Carbon::parse($endRaw)->lt(now())) {
            abort(404);
        }

        // Return raw datetime values
        $event->start_date = $event->getRawOriginal('start_date') ?? $event->start_date;
        $event->end_date = $event->getRawOriginal('end_date') ?? $event->end_date;

        // Add user-specific data if authenticated
        if (Auth::check()) {
            $event = $this->addUserEventData($event);
        }

        $event = $this->hideRestrictedEventLinks($event);

        // Add public metrics
        $event->is_full = $event->is_full;
        $event->is_upcoming = $event->is_upcoming;
        $event->is_live = $event->is_live;
        $event->is_completed = $event->is_completed;
        $event->available_spots = $event->max_capacity 
            ? max(0, $event->max_capacity - $event->registrations_count)
            : null;

        return response()->json($event);
    }

    /**
     * Register user for event
     */
    public function register(Request $request, $id)
    {
        $user = Auth::user();

        if (! SchemaCache::hasTable('event_user')) {
            return response()->json(['message' => 'Înscrierea nu este disponibilă'], 400);
        }

        try {
            $event = DB::transaction(function () use ($id, $user) {
                $event = Event::where(function ($q) {
                    $q->where('status', 'published')->orWhere('status', 'upcoming');
                })->lockForUpdate()->findOrFail($id);

                $existing = DB::table('event_user')
                    ->where('event_id', $event->id)
                    ->where('user_id', $user->id)
                    ->first();

                if ($existing && $existing->registered) {
                    abort(400, 'Ești deja înscris la acest eveniment');
                }

                if ($event->access_type === 'course_included') {
                    if (!$event->course_id) {
                        abort(400, 'Evenimentul nu este asociat cu un curs');
                    }
                    if (SchemaCache::hasTable('course_user')) {
                        $enrolled = DB::table('course_user')
                            ->where('course_id', $event->course_id)
                            ->where('user_id', $user->id)
                            ->where(function ($q) {
                                if (SchemaCache::hasColumn('course_user', 'enrolled')) {
                                    $q->where('enrolled', true);
                                } else {
                                    $q->whereNotNull('course_id');
                                }
                            })
                            ->exists();
                        if (!$enrolled) {
                            abort(400, 'Trebuie să fii înscris la cursul asociat pentru a participa la acest eveniment');
                        }
                    }
                }

                $registeredCount = (int) DB::table('event_user')
                    ->where('event_id', $event->id)
                    ->where('registered', true)
                    ->count();
                if ($event->max_capacity && $registeredCount >= (int) $event->max_capacity) {
                    abort(400, 'Evenimentul este plin');
                }

                DB::table('event_user')->updateOrInsert(
                    [
                        'event_id' => $event->id,
                        'user_id' => $user->id,
                    ],
                    [
                        'registered' => true,
                        'registered_at' => now(),
                        'updated_at' => now(),
                    ]
                );

                $event->updateKPIs();
                return $event->fresh();
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        return response()->json([
            'message' => 'Te-ai înscris cu succes la eveniment',
            'event' => $this->addUserEventData($event),
        ]);
    }

    /**
     * Cancel the authenticated user's own registration
     */
    public function cancelRegistration(Request $request, $id)
    {
        $user = Auth::user();

        if (! SchemaCache::hasTable('event_user')) {
            return response()->json(['message' => 'Înscrierea nu este disponibilă'], 400);
        }

        try {
            $event = DB::transaction(function () use ($id, $user) {
                $event = Event::lockForUpdate()->findOrFail($id);

                if (in_array($event->status, ['cancelled', 'completed'], true)) {
                    abort(400, 'Nu poți anula înscrierea la acest eveniment');
                }

                $existing = DB::table('event_user')
                    ->where('event_id', $event->id)
                    ->where('user_id', $user->id)
                    ->where('registered', true)
                    ->first();

                if (! $existing) {
                    abort(400, 'Nu ești înscris la acest eveniment');
                }

                DB::table('event_user')
                    ->where('event_id', $event->id)
                    ->where('user_id', $user->id)
                    ->update([
                        'registered' => false,
                        'registered_at' => null,
                        'updated_at' => now(),
                    ]);

                $event->updateKPIs();

                return $event->fresh();
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        return response()->json([
            'message' => 'Înscriere anulată',
            'event' => $this->addUserEventData($event),
        ]);
    }

    /**
     * Add user-specific data to event
     */
    private function addUserEventData($event)
    {
        if (!Auth::check() || !SchemaCache::hasTable('event_user')) {
            $event->user_registered = false;
            $event->user_attended = false;
            $event->user_watched_replay = false;
            return $event;
        }

        $user = Auth::user();
        $userEvent = DB::table('event_user')
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->first();

        $event->user_registered = $userEvent ? (bool)$userEvent->registered : false;
        $event->user_attended = $userEvent ? (bool)$userEvent->attended : false;
        $event->user_watched_replay = $userEvent ? (bool)$userEvent->watched_replay : false;
        $event->user_registered_at = $userEvent ? $userEvent->registered_at : null;
        $event->user_attended_at = $userEvent ? $userEvent->attended_at : null;
        $event->user_replay_watched_at = $userEvent ? $userEvent->replay_watched_at : null;

        return $event;
    }

    private function userCanSeeEventLinks($event): bool
    {
        $user = Auth::user();
        if (! $user) {
            return false;
        }
        if (method_exists($user, 'isAdmin') && $user->isAdmin()) {
            return true;
        }
        if ((int) ($event->instructor_id ?? 0) === (int) $user->id) {
            return true;
        }
        if (! SchemaCache::hasTable('event_user')) {
            return false;
        }

        return DB::table('event_user')
            ->where('event_id', $event->id)
            ->where('user_id', $user->id)
            ->where('registered', true)
            ->exists();
    }

    private function hideRestrictedEventLinks($event)
    {
        if ($this->userCanSeeEventLinks($event)) {
            return $event;
        }

        $event->live_link = null;
        $event->replay_url = null;
        $event->makeHidden(['live_link', 'replay_url']);

        return $event;
    }

    private function eventVisibleToUser($event, $user, array $userTeamIds): bool
    {
        $audience = SchemaCache::hasColumn('events', 'audience_type')
            ? ($event->audience_type ?? 'all')
            : 'all';
        if ($audience !== 'teams') {
            return true;
        }
        if (! $user) {
            return false;
        }
        if (method_exists($user, 'isAdmin') && $user->isAdmin()) {
            return true;
        }
        $eventTeamIds = $event->relationLoaded('teams')
            ? $event->teams->pluck('id')->all()
            : [];

        return count(array_intersect($eventTeamIds, $userTeamIds)) > 0;
    }
}
