<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\DefaultCompany;
use App\Support\AuthActivityLogger;
use App\Support\StudentSessionLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        // Formely e sales-led: conturile vin prin invitație. Register public doar pe compania implicită.
        // Verificat înaintea validării, ca `unique:users` să nu dezvăluie ce emailuri au deja cont.
        if (! config('formely.public_register_enabled', false)) {
            return response()->json([
                'message' => 'Înregistrarea publică este dezactivată. Conturile se creează prin invitație după contract.',
            ], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255|regex:/^[\p{L}\p{M}0-9\s\-\.]+$/u', // Sanitize name
            'email' => 'required|string|email|max:255|unique:users',
            'password' => [
                'required',
                'string',
                'min:8', // Increased minimum length
                'regex:/[a-z]/', // At least one lowercase letter
                'regex:/[A-Z]/', // At least one uppercase letter
                'regex:/[0-9]/', // At least one number
            ],
        ], [
            'password.regex' => 'Parola trebuie să conțină cel puțin 8 caractere, incluzând o literă mare, o literă mică și o cifră.',
        ]);

        $companyId = DefaultCompany::id();
        $company = $companyId ? Company::query()->find($companyId) : null;
        if ($company && (! $company->isUsable() || ! app(PlanEntitlementService::class)->learnerSeatAvailable($company, 1))) {
            return response()->json([
                'message' => ! $company->isUsable()
                    ? 'Organizația nu acceptă înregistrări momentan.'
                    : 'Nu mai sunt locuri de cursant disponibile pe această organizație. Contactează administratorul.',
            ], 422);
        }

        $registrationEnabled = \App\Models\Setting::get('registration_enabled', true);
        if ($registrationEnabled === false || $registrationEnabled === 0 || $registrationEnabled === '0') {
            return response()->json([
                'message' => 'Înregistrările sunt dezactivate. Folosește o invitație sau contactează un administrator.',
            ], 403);
        }

        $user = User::create([
            'company_id' => $companyId,
            'name' => strip_tags($request->name), // Sanitize HTML tags
            'email' => strtolower(trim($request->email)), // Normalize email
            'password' => Hash::make($request->password),
            'role' => 'student',
            'level' => 1,
            'points' => 0,
            'status' => 'pending', // În așteptarea aprobării admin
        ]);

        // Log registration
        Log::info('User registered (pending approval)', [
            'user_id' => $user->id,
            'email' => $user->email,
            'ip' => $request->ip(),
        ]);

        app(\App\Services\NotificationService::class)->notifyRegistrationRequested($user);

        // Nu facem auto-login - utilizatorul așteaptă aprobarea admin
        return response()->json([
            'message' => 'Cererea ta de înregistrare a fost trimisă. Un administrator va verifica contul în curând. Vei putea te autentifica după aprobare.',
            'pending_approval' => true,
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $credentials = $request->only('email', 'password');

        // Verifică dacă utilizatorul are status pending (așteaptă aprobare)
        $user = User::withoutGlobalScope(CompanyScope::class)->where('email', $request->email)->first();
        // Starea contului (pending / suspendat / academie inactivă) se spune doar cui știe parola;
        // altfel răspunsul e cel generic și nu confirmă că emailul are cont.
        if ($user && ! Hash::check((string) $request->password, $user->password)) {
            $user = null;
        }
        $this->assertSaasLoginAllowed($request, $user);
        if ($user && ($user->status ?? 'active') === 'pending') {
            throw ValidationException::withMessages([
                'email' => ['Contul tău este în așteptarea aprobării. Un administrator va verifica cererea în curând.'],
            ]);
        }

        if ($user && ($user->status ?? 'active') === 'suspended') {
            if ($user->suspended_until && now()->gte($user->suspended_until)) {
                $user->forceFill([
                    'status' => 'active',
                    'suspended_reason' => null,
                    'suspended_until' => null,
                ])->save();
            } else {
                throw ValidationException::withMessages([
                    'email' => ['Contul tău a fost suspendat.'],
                ]);
            }
        }

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();
            
            $user = Auth::user();

            $user->forceFill(['last_login_at' => now()])->save();
            AuthActivityLogger::logLoggedIn($user, $request);
            StudentSessionLogger::recordOpened($user, $request);
            
            // Check if user has default password (must change password)
            $mustChangePassword = $user->must_change_password ?? false;
            
            // Fără ID-ul de sesiune: cine citește logul nu trebuie să poată prelua sesiunea
            Log::info('User logged in', [
                'user_id' => $user->id,
                'email' => $user->email,
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
            
            $responseData = [
                'message' => 'Autentificare reușită',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role ?? 'student',
                    'capabilities' => ['volt' => \App\Support\VoltAvailability::isConfigured()],
                    'level' => $user->level ?? 1,
                    'points' => $user->points ?? 0,
                    'must_change_password' => (bool)$mustChangePassword,
                    ...$this->saasUserPayload($user),
                ],
            ];

            // React Native: nu persistă cookie-uri de sesiune ca browserul — token Bearer (Sanctum)
            // Formely: clienții mobili trimit X-Formely-Client; X-Volta-Client rămâne acceptat (compat Volta).
            $wantsMobileToken = in_array('mobile', [
                strtolower((string) $request->header('X-Formely-Client', '')),
                strtolower((string) $request->header('X-Volta-Client', '')),
            ], true);
            if ($wantsMobileToken) {
                $responseData['token'] = $user->createToken('volta-student-mobile', ['*'])->plainTextToken;
            }


            return response()->json($responseData);
        }

        // Log failed login attempt
        Log::warning('Failed login attempt', [
            'email' => $request->email,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        throw ValidationException::withMessages([
            'email' => ['Datele de autentificare nu sunt corecte.'],
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            AuthActivityLogger::logLoggedOut($user, $request);
        }

        $bearer = $request->bearerToken();
        if ($bearer) {
            $accessToken = PersonalAccessToken::findToken($bearer);
            if ($accessToken) {
                $accessToken->delete();
            }
        }

        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Deconectare reușită',
        ]);
    }

    public function me(Request $request)
    {
        try {
            $user = Auth::user();
            
            if (!$user) {
                $responseData = [
                    'error' => 'Neautentificat',
                ];

                if (config('app.debug')) {
                    $responseData['debug'] = [
                        'has_session' => $request->hasSession(),
                        'session_id' => $request->hasSession() ? $request->session()->getId() : null,
                        'cookies_received' => array_keys($request->cookies->all()),
                    ];
                }

                return response()->json($responseData, 401);
            }

            $avatarUrl = $user->avatar
                ? ('/storage/' . ltrim($user->avatar, '/'))
                : null;

            StudentSessionLogger::recordOpened($user, $request);

            return response()->json([
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'bio' => $user->bio,
                    'avatar' => $avatarUrl,
                    'role' => $user->role ?? 'student',
                    'capabilities' => ['volt' => \App\Support\VoltAvailability::isConfigured()],
                    'level' => $user->level ?? 1,
                    'points' => $user->points ?? 0,
                    'must_change_password' => (bool)($user->must_change_password ?? false),
                    ...$this->saasUserPayload($user),
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Auth me error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'error' => 'Eroare la verificarea autentificării.' . (config('app.debug') ? ' ' . $e->getMessage() : '')
            ], 500);
        }
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'new_password' => [
                'required',
                'string',
                'min:8', // Increased minimum length
                'confirmed',
                'regex:/[a-z]/', // At least one lowercase letter
                'regex:/[A-Z]/', // At least one uppercase letter
                'regex:/[0-9]/', // At least one number
                'different:current_password', // New password must be different from current
            ],
        ], [
            'new_password.regex' => 'Parola nouă trebuie să conțină cel puțin 8 caractere, incluzând o literă mare, o literă mică și o cifră.',
            'new_password.different' => 'Parola nouă trebuie să fie diferită de parola curentă.',
        ]);

        $user = Auth::user();

        if (!Hash::check($request->current_password, $user->password)) {
            // Log failed password change attempt
            Log::warning('Failed password change attempt', [
                'user_id' => $user->id,
                'email' => $user->email,
                'ip' => $request->ip(),
            ]);
            
            return response()->json([
                'message' => 'Parola curentă este incorectă',
            ], 422);
        }

        $user->password = Hash::make($request->new_password);
        $user->must_change_password = false;
        $user->save();

        // Log successful password change
        Log::info('User changed password', [
            'user_id' => $user->id,
            'email' => $user->email,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Parola a fost schimbată cu succes',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'capabilities' => ['volt' => \App\Support\VoltAvailability::isConfigured()],
                'level' => $user->level,
                'points' => $user->points,
                'must_change_password' => false,
                ...$this->saasUserPayload($user),
            ],
        ]);
    }

    /**
     * Operatorii Formely intră doar în backoffice; utilizatorii academiilor doar în LMS.
     * Academia suspendată sau cu trial expirat nu se poate autentifica.
     */
    private function assertSaasLoginAllowed(Request $request, ?User $user): void
    {
        if (! $user) {
            return;
        }

        $fromBackoffice = strtolower((string) $request->header('X-Formely-Client', '')) === 'backoffice';
        if ($user->isPlatformAdmin() && ! $fromBackoffice) {
            throw ValidationException::withMessages([
                'email' => ['Operatorii Formely se autentifică în consola backoffice, nu în LMS.'],
            ]);
        }
        if ($fromBackoffice && ! $user->isPlatformAdmin()) {
            throw ValidationException::withMessages([
                'email' => ['Consola backoffice e doar pentru operatorii Formely.'],
            ]);
        }

        $company = $user->company_id ? Company::query()->find($user->company_id) : null;
        if ($company && ! $company->isUsable()) {
            throw ValidationException::withMessages([
                'email' => [$this->companyBlockedMessage($company)],
            ]);
        }
    }

    private function companyBlockedMessage(Company $company): string
    {
        return $company->isTrialExpired()
            ? 'Perioada de demo s-a încheiat. Contactează Formely pentru activare.'
            : 'Organizația ta este suspendată. Contactează Formely pentru reactivare.';
    }

    /** @return array<string, mixed> */
    private function saasUserPayload(User $user): array
    {
        $company = $user->company_id ? Company::query()->find($user->company_id) : null;

        return [
            'company_id' => $user->company_id,
            'company' => $company?->brandingPayload(),
            'entitlements' => $company ? app(PlanEntitlementService::class)->entitlementsPayload($company) : null,
            'is_platform_admin' => $user->isPlatformAdmin(),
        ];
    }
}

