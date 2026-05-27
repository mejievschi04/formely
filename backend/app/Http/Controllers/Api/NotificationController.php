<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Admin\DashboardAdminController;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        if (! Schema::hasTable('notifications')) {
            return response()->json(['data' => []]);
        }

        $user = $request->user();
        $limit = min((int) $request->get('limit', 50), 100);

        $query = Notification::where('user_id', $user->id)
            ->orderByDesc('created_at');

        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }

        $items = $query->take($limit)->get()->map(fn (Notification $n) => $this->formatNotification($n));

        return response()->json(['data' => $items]);
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $count = 0;

        if (Schema::hasTable('notifications')) {
            $count = (int) Notification::where('user_id', $user->id)
                ->whereNull('read_at')
                ->count();
        }

        // Admin/analyst: include computed dashboard alerts not yet dismissed
        if (in_array($user->role ?? '', ['admin', 'instructor', 'analyst'], true)) {
            $alerts = app(DashboardAdminController::class)->filteredAlertsForUser($user);
            $count += count($alerts);
        }

        return response()->json(['count' => $count]);
    }

    public function markRead(Request $request, $id)
    {
        if (! Schema::hasTable('notifications')) {
            return response()->json(['message' => 'Notificare marcată'], 200);
        }

        $notification = Notification::where('user_id', $request->user()->id)
            ->where('id', $id)
            ->firstOrFail();

        if (! $notification->read_at) {
            $notification->markAsRead();
        }

        return response()->json([
            'message' => 'Notificare marcată ca citită',
            'notification' => $this->formatNotification($notification->fresh()),
        ]);
    }

    public function markAllRead(Request $request)
    {
        if (! Schema::hasTable('notifications')) {
            return response()->json(['message' => 'Toate notificările au fost marcate', 'updated' => 0]);
        }

        $updated = Notification::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json([
            'message' => 'Toate notificările au fost marcate ca citite',
            'updated' => $updated,
        ]);
    }

    private function formatNotification(Notification $n): array
    {
        return [
            'id' => $n->id,
            'type' => $n->type,
            'title' => $n->title,
            'description' => $n->description,
            'message' => $n->description,
            'data' => $n->data,
            'action_url' => $n->action_url,
            'link' => $n->action_url,
            'severity' => $n->severity ?? 'info',
            'read_at' => $n->read_at?->toIso8601String(),
            'created_at' => $n->created_at?->toIso8601String(),
            'stored' => true,
        ];
    }
}
