<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\RegistrationInvitation;
use App\Services\RegistrationInvitationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class RegistrationInvitationAdminController extends Controller
{
    use \App\Http\Controllers\Concerns\AssertsPlanEntitlements;

    public function __construct()
    {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot trimite invitații.');
        }
    }

    public function index()
    {
        $invitations = RegistrationInvitation::query()
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->with(['inviter:id,name', 'team:id,name'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (RegistrationInvitation $invitation) => $this->formatInvitation($invitation));

        $stats = [
            'total' => $invitations->count(),
            'pending_email' => $invitations->where('email_status', 'pending')->count(),
            'sent' => $invitations->where('email_status', 'sent')->count(),
            'failed' => $invitations->where('email_status', 'failed')->count(),
        ];

        return response()->json([
            'data' => $invitations->values(),
            'stats' => $stats,
        ]);
    }

    public function store(Request $request, RegistrationInvitationService $invitationService)
    {
        $validated = $request->validate([
            'email' => 'required|string|email|max:255',
            'name' => 'nullable|string|max:255|regex:/^[\p{L}\p{M}0-9\s\-\.]+$/u',
            'role' => 'nullable|string|in:student,instructor,analyst',
            'team_id' => 'nullable|exists:teams,id',
        ]);

        $this->assertSeatForRole($validated['role'] ?? 'student');

        $result = $invitationService->createAndSend(
            email: $validated['email'],
            invitedBy: Auth::user(),
            name: $validated['name'] ?? null,
            role: $validated['role'] ?? 'student',
            teamId: isset($validated['team_id']) ? (int) $validated['team_id'] : null,
        );

        $invitation = $result['invitation']->fresh(['inviter:id,name', 'team:id,name']);

        return response()->json([
            'message' => 'Invitația a fost creată.',
            'invite_url' => $result['invite_url'],
            'invitation' => $this->formatInvitation($invitation),
        ], 201);
    }

    public function copyLink(int $id, RegistrationInvitationService $invitationService)
    {
        $invitation = RegistrationInvitation::findOrFail($id);

        return response()->json([
            'invite_url' => $invitationService->getInviteUrl($invitation),
        ]);
    }

    public function resend(int $id, RegistrationInvitationService $invitationService)
    {
        $invitation = RegistrationInvitation::findOrFail($id);
        $result = $invitationService->resendEmail($invitation, Auth::user());

        return response()->json([
            'message' => 'Emailul se retrimite în fundal.',
            'invite_url' => $result['invite_url'],
            'invitation' => $this->formatInvitation(
                $result['invitation']->fresh(['inviter:id,name', 'team:id,name'])
            ),
        ]);
    }

    public function destroy(int $id)
    {
        $invitation = RegistrationInvitation::findOrFail($id);

        if ($invitation->isAccepted()) {
            return response()->json([
                'message' => 'Invitația a fost deja acceptată.',
            ], 422);
        }

        $invitation->delete();

        return response()->json([
            'message' => 'Invitația a fost anulată.',
        ]);
    }

    private function formatInvitation(RegistrationInvitation $invitation): array
    {
        return [
            'id' => $invitation->id,
            'email' => $invitation->email,
            'name' => $invitation->name,
            'role' => $invitation->role,
            'team' => $invitation->team ? ['id' => $invitation->team->id, 'name' => $invitation->team->name] : null,
            'invited_by' => $invitation->inviter ? ['id' => $invitation->inviter->id, 'name' => $invitation->inviter->name] : null,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
            'created_at' => $invitation->created_at?->toIso8601String(),
            'email_status' => $invitation->email_status ?? 'pending',
            'email_sent_at' => $invitation->email_sent_at?->toIso8601String(),
            'email_last_error' => $invitation->email_last_error,
        ];
    }
}
