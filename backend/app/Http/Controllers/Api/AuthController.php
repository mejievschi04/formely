<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use App\Support\DefaultCompany;
use App\Support\AuthActivityLogger;
use App\Support\StudentSessionLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    private const PASSWORD_RULES = [
        'required',
        'string',
        'min:8',
        'regex:/[a-z]/',
        'regex:/[A-Z]/',
        'regex:/[0-9]/',
    ];

    private const PASSWORD_MESSAGES = [
        'password.regex' => 'Parola trebuie să conțină cel puțin 8 caractere, incluzând o literă mare, o literă mică și o cifră.',
        'new_password.regex' => 'Parola nouă trebuie să conțină cel puțin 8 caractere, incluzând o literă mare, o literă mică și o cifră.',
    ];

    public function register(Request $request)
    {
        if (! config('formely.public_register_enabled', true)) {
            return response()->json([
                'message' => 'Înregistrarea publică este dezactivată. Conturile se creează prin invitație după contract.',
            ], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255|regex:/^[a-zA-Z0-9\s\-\.]+$/u', // Sanitize name
            'email' => 'required|string|email|max:255|unique:users',
            'password' => self::PASSWORD_RULES,
        ], self::PASSWORD_MESSAGES);

        $companyId = DefaultCompany::id();
        if ($companyId) {
            $company = Company::withoutGlobalScopes()->find($companyId);
            if ($company && (! $company->isUsable() || ! app(\App\Services\PlanEntitlementService::class)->learnerSeatAvailable($company, 1))) {
                return response()->json([
                    'message' => ! $company->isUsable()
                        ? 'Organizația nu acceptă înregistrări momentan.'
                        : 'Nu mai sunt locuri de cursant disponibile pe această organizație. Contactează administratorul.',
                ], 422);
            }
        }

        $user = User::create([
            'name' => strip_tags($request->name), // Sanitize HTML tags
            'email' => strtolower(trim($request->email)), // Normalize email
            'password' => Hash::make($request->password),
            'role' => 'student',
            'level' => 1,
            'points' => 0,
            'status' => 'pending', // În așteptarea aprobării admin
            'company_id' => $companyId,
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

        $email = strtolower(trim($request->email));

        $user = User::withoutGlobalScopes()->where('email', $email)->first();
        $this->assertUserMayAuthenticate($user);

        if ($user && Hash::check($request->password, $user->password)) {
            $client = strtolower((string) $request->header('X-Formely-Client', ''));
            if ($user->isPlatformAdmin() && $client !== 'backoffice') {
                throw ValidationException::withMessages([
                    'email' => ['Operatorii Formely se autentifică în consola backoffice, nu în LMS.'],
                ]);
            }
            if ($client === 'backoffice' && ! $user->isPlatformAdmin()) {
                throw ValidationException::withMessages([
                    'email' => ['Consola backoffice e doar pentru operatorii Formely.'],
                ]);
            }

            Auth::guard('web')->login($user, $request->boolean('remember'));
            $request->session()->regenerate();
            
            $user = Auth::guard('web')->user();

            $user->forceFill(['last_login_at' => now()])->save();
            AuthActivityLogger::logLoggedIn($user, $request);
            StudentSessionLogger::recordOpened($user, $request);
            
            // Check if user has default password (must change password)
            $mustChangePassword = $user->must_change_password ?? false;
            
            // Log successful login
            $sessionId = $request->session()->getId();
            $sessionName = $request->session()->getName();
            
            Log::info('User logged in', [
                'user_id' => $user->id,
                'email' => $user->email,
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'session_id' => $sessionId,
                'session_name' => $sessionName,
            ]);
            
            $responseData = [
                'message' => 'Autentificare reușită',
                'user' => $this->authUserPayload($user, (bool) $mustChangePassword),
            ];

            // React Native: nu persistă cookie-uri de sesiune ca browserul — token Bearer (Sanctum)
            $wantsMobileToken = strtolower((string) $request->header('X-Formely-Client', '')) === 'mobile';
            if ($wantsMobileToken) {
                $responseData['token'] = $user->createToken('formely-student-mobile', ['*'])->plainTextToken;
            }
            
            // Only include debug info in development
            if (config('app.debug')) {
                $responseData['debug'] = [
                    'session_id' => $sessionId,
                    'session_name' => $sessionName,
                ];
            }
            
            $response = response()->json($responseData);
            
            // Log response headers only in development
            if (config('app.debug')) {
                Log::info('Login response headers', [
                    'set_cookie_header' => $response->headers->get('Set-Cookie'),
                ]);
            }
            
            return $response;
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
            $this->terminateAuthenticatedSession($request, $user);
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
                // Only log warnings in development
                if (config('app.debug')) {
                    $cookies = $request->cookies->all();
                    $cookieHeader = $request->header('Cookie');
                    Log::warning('Auth me failed - no user', [
                        'session_id' => $request->session()->getId(),
                        'cookies_received' => array_keys($cookies),
                        'cookie_header' => $cookieHeader ? 'present' : 'missing',
                    ]);
                }
                
                $responseData = [
                    'error' => 'Neautentificat',
                ];
                
                // Only include debug info in development
                if (config('app.debug')) {
                    $responseData['debug'] = [
                        'has_session' => $request->hasSession(),
                        'session_id' => $request->session()->getId(),
                        'cookies_received' => array_keys($cookies),
                    ];
                }
                
                return response()->json($responseData, 401);
            }

            $user->refresh();
            if ($user->isAccessBlocked()) {
                $this->terminateAuthenticatedSession($request, $user);

                return response()->json([
                    'error' => 'Acces restricționat',
                    'message' => $user->accessBlockedMessage(),
                    'access_blocked' => true,
                    'suspended' => $user->isSuspended(),
                    'inactive' => $user->isInactive(),
                ], 403);
            }

            if ($user->company_id) {
                $company = Company::withoutGlobalScopes()->find($user->company_id);
                if ($company && ! $company->isUsable()) {
                    $this->terminateAuthenticatedSession($request, $user);
                    $message = $company->isTrialExpired()
                        ? 'Perioada de demo s-a încheiat. Contactează Formely pentru activare.'
                        : 'Organizația ta este suspendată. Contactează Formely pentru reactivare.';

                    return response()->json([
                        'error' => 'Organizație indisponibilă',
                        'message' => $message,
                        'company_suspended' => true,
                        'trial_expired' => $company->isTrialExpired(),
                    ], 403);
                }
            }

            $avatarUrl = $user->avatar
                ? ('/storage/' . ltrim($user->avatar, '/'))
                : null;

            StudentSessionLogger::recordOpened($user, $request);

            return response()->json([
                'user' => array_merge(
                    $this->authUserPayload($user, (bool) ($user->must_change_password ?? false)),
                    [
                        'bio' => $user->bio,
                        'avatar' => $avatarUrl,
                    ]
                ),
            ]);
        } catch (\Exception $e) {
            Log::error('Auth me error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'error' => 'Eroare la verificarea autentificării: ' . $e->getMessage()
            ], 500);
        }
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'new_password' => array_merge(self::PASSWORD_RULES, ['confirmed', 'different:current_password']),
        ], array_merge(self::PASSWORD_MESSAGES, [
            'new_password.different' => 'Parola nouă trebuie să fie diferită de parola curentă.',
        ]));

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
            'user' => $this->authUserPayload($user, false),
        ]);
    }

    /** @return array<string, mixed> */
    private function authUserPayload(User $user, bool $mustChangePassword): array
    {
        $company = null;
        $entitlements = null;
        $onboarding = null;
        if ($user->company_id) {
            $companyModel = $user->relationLoaded('company')
                ? $user->company
                : Company::withoutGlobalScopes()->find($user->company_id);
            $company = $companyModel?->brandingPayload();
            if ($companyModel) {
                $entitlements = app(\App\Services\PlanEntitlementService::class)
                    ->entitlementsPayload($companyModel);
                $onboarding = [
                    'needs_branding' => false,
                    'has_logo' => ! empty($companyModel->logo_path),
                    'plan' => $companyModel->plan,
                ];
            }
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role ?? 'student',
            'role_label' => $user->roleLabel(),
            'level' => $user->level ?? 1,
            'points' => $user->points ?? 0,
            'must_change_password' => $mustChangePassword,
            'permissions' => $user->adminPermissions(),
            'company' => $company,
            'company_id' => $user->company_id,
            'entitlements' => $entitlements,
            'onboarding' => $onboarding,
            'is_platform_admin' => $user->isPlatformAdmin(),
        ];
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = strtolower(trim($request->email));
        Password::sendResetLink(['email' => $email]);

        return response()->json([
            'message' => 'Dacă există un cont cu acest email, vei primi un link de resetare în câteva minute.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => array_merge(self::PASSWORD_RULES, ['confirmed']),
        ], self::PASSWORD_MESSAGES);

        $status = Password::reset(
            [
                'email' => strtolower(trim($request->email)),
                'password' => $request->password,
                'password_confirmation' => $request->password_confirmation,
                'token' => $request->token,
            ],
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'must_change_password' => false,
                ])->save();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Parola a fost resetată cu succes. Te poți autentifica acum.',
            ]);
        }

        $message = match ($status) {
            Password::INVALID_TOKEN => 'Linkul de resetare este invalid sau a expirat.',
            Password::INVALID_USER => 'Nu am găsit un cont cu acest email.',
            Password::THROTTLED => 'Prea multe încercări. Încearcă din nou peste câteva minute.',
            default => 'Nu am putut reseta parola. Încearcă din nou.',
        };

        throw ValidationException::withMessages([
            'email' => [$message],
        ]);
    }

    private function assertUserMayAuthenticate(?User $user): void
    {
        if (! $user) {
            return;
        }

        if (($user->status ?? 'active') === 'pending') {
            throw ValidationException::withMessages([
                'email' => ['Contul tău este în așteptarea aprobării. Un administrator va verifica cererea în curând.'],
            ]);
        }

        if ($user->isInactive()) {
            throw ValidationException::withMessages([
                'email' => [$user->accessBlockedMessage()],
            ]);
        }

        if ($user->isSuspended()) {
            throw ValidationException::withMessages([
                'email' => [$user->accessBlockedMessage()],
            ]);
        }

        if ($user->company_id) {
            $company = Company::withoutGlobalScopes()->find($user->company_id);
            if ($company && ! $company->isUsable()) {
                $message = $company->isTrialExpired()
                    ? 'Perioada de demo s-a încheiat. Contactează Formely pentru activare.'
                    : 'Organizația ta este suspendată. Contactează Formely pentru reactivare.';
                throw ValidationException::withMessages([
                    'email' => [$message],
                ]);
            }
        }
    }

    private function terminateAuthenticatedSession(Request $request, User $user): void
    {
        AuthActivityLogger::logLoggedOut($user, $request);

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
    }
}

