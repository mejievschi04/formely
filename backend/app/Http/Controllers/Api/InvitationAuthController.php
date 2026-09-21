<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserInvitationService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class InvitationAuthController extends Controller
{
    public function __construct(
        private readonly UserInvitationService $invitationService,
    ) {}

    public function validateToken(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
        ]);

        $invitation = $this->invitationService->findValidByPlainToken($request->token);

        if (! $invitation) {
            return response()->json([
                'valid' => false,
                'message' => 'Invitația este invalidă sau a expirat.',
            ], 404);
        }

        return response()->json([
            'valid' => true,
            'email' => $invitation->email,
            'name' => $invitation->name,
            'role' => $invitation->role,
            'team' => $invitation->team ? ['id' => $invitation->team->id, 'name' => $invitation->team->name] : null,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);
    }

    public function accept(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'name' => 'required|string|max:255|regex:/^[a-zA-Z0-9\s\-\.]+$/u',
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
                'regex:/[a-z]/',
                'regex:/[A-Z]/',
                'regex:/[0-9]/',
            ],
        ], [
            'password.regex' => 'Parola trebuie să conțină cel puțin 8 caractere, incluzând o literă mare, o literă mică și o cifră.',
        ]);

        $invitation = $this->invitationService->findValidByPlainToken($request->token);

        if (! $invitation) {
            throw ValidationException::withMessages([
                'token' => ['Invitația este invalidă sau a expirat.'],
            ]);
        }

        $user = $this->invitationService->accept(
            $invitation,
            $request->name,
            $request->password
        );

        return response()->json([
            'message' => 'Cont creat cu succes. Te poți autentifica acum.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ], 201);
    }
}
