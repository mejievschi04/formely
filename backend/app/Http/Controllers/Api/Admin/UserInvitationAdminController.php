<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\AssertsPlanEntitlements;
use App\Support\UserRoles;
use App\Models\UserInvitation;
use App\Services\UserInvitationService;
use Illuminate\Http\Request;

class UserInvitationAdminController extends Controller
{
    use AssertsPlanEntitlements;

    public function __construct(
        private readonly UserInvitationService $invitationService,
    ) {
        if (auth()->check() && ! auth()->user()->canManageUsers()) {
            abort(403, 'Nu ai drepturi pentru trimiterea invitațiilor.');
        }
    }

    public function index(Request $request)
    {
        $query = UserInvitation::query()
            ->with(['inviter:id,name,email', 'team:id,name'])
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('created_at');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('email', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $invitations = $query->get()->map(fn (UserInvitation $invitation) => $this->formatInvitation($invitation));

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

    public function store(Request $request)
    {
        $validated = $request->validate([
            'email' => 'nullable|email',
            'name' => 'nullable|string|max:255|regex:/^[a-zA-Z0-9\s\-\.]+$/u',
            'emails' => 'nullable|string|max:10000',
            'invitations' => 'nullable|array|max:100',
            'invitations.*.email' => 'required_with:invitations|email',
            'invitations.*.name' => 'nullable|string|max:255',
            'role' => 'required|string|in:'.implode(',', UserRoles::assignable()),
            'team_id' => 'nullable|exists:teams,id',
        ]);

        $entries = $this->normalizeEntries($validated, $request);

        if (count($entries) === 0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'email' => ['Adaugă cel puțin un email.'],
            ]);
        }

        $this->assertSeatForRole($validated['role'], count($entries));

        if (count($entries) === 1 && empty($validated['emails']) && empty($validated['invitations'])) {
            $entry = $entries[0];
            $result = $this->invitationService->createAndSend(
                $entry['email'],
                $request->user(),
                $entry['name'] ?? null,
                $validated['role'],
                $validated['team_id'] ?? null,
                $request
            );

            return response()->json([
                'message' => 'Invitația a fost creată.',
                'invite_url' => $result['invite_url'],
                'invitation' => $this->formatInvitation($result['invitation']),
            ], 201);
        }

        if (count($entries) > 50) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'emails' => ['Poți trimite maximum 50 de invitații odată.'],
            ]);
        }

        $result = $this->invitationService->sendMany(
            $entries,
            $validated['role'],
            $validated['team_id'] ?? null,
            $request->user(),
            $request
        );

        $sentCount = count($result['sent']);
        $failedCount = count($result['failed']);

        return response()->json([
            'message' => $sentCount > 0
                ? "{$sentCount} invitații trimise" . ($failedCount > 0 ? ", {$failedCount} eșuate" : '')
                : 'Nu s-a trimis nicio invitație',
            'sent' => $result['sent'],
            'failed' => $result['failed'],
        ], $sentCount > 0 ? 201 : 422);
    }

    public function copyLink($id)
    {
        $invitation = UserInvitation::whereNull('accepted_at')->findOrFail($id);

        return response()->json([
            'invite_url' => $this->invitationService->getInviteUrl($invitation),
        ]);
    }

    public function destroy($id)
    {
        $invitation = UserInvitation::whereNull('accepted_at')->findOrFail($id);
        $invitation->delete();

        return response()->json(['message' => 'Invitația a fost anulată']);
    }

    public function resend(Request $request, $id)
    {
        $invitation = UserInvitation::with('inviter')->whereNull('accepted_at')->findOrFail($id);
        $result = $this->invitationService->resend($invitation, $request->user(), $request);

        return response()->json([
            'message' => 'Invitația a fost retrimisă',
            'invite_url' => $result['invite_url'],
            'invitation' => $this->formatInvitation($result['invitation']),
        ]);
    }

    private function formatInvitation(UserInvitation $invitation): array
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

    /**
     * @return array<int, array{email: string, name?: string|null}>
     */
    private function normalizeEntries(array $validated, Request $request): array
    {
        $entries = [];

        if (! empty($validated['invitations']) && is_array($validated['invitations'])) {
            foreach ($validated['invitations'] as $row) {
                $entries[] = [
                    'email' => $row['email'],
                    'name' => $row['name'] ?? null,
                ];
            }
        }

        if (! empty($validated['email'])) {
            $entries[] = [
                'email' => $validated['email'],
                'name' => $validated['name'] ?? null,
            ];
        }

        if (! empty($validated['emails'])) {
            $lines = preg_split('/[\r\n,;]+/', $validated['emails']) ?: [];
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $name = null;
                $email = $line;
                if (preg_match('/^(.+?)\s*<([^>]+)>$/', $line, $m)) {
                    $name = trim($m[1]);
                    $email = trim($m[2]);
                }
                $entries[] = ['email' => $email, 'name' => $name];
            }
        }

        $seen = [];
        $unique = [];
        foreach ($entries as $entry) {
            $key = strtolower(trim($entry['email'] ?? ''));
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $unique[] = $entry;
        }

        return $unique;
    }
}
