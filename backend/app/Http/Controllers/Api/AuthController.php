<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
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
        $request->validate([
            'name' => 'required|string|max:255|regex:/^[a-zA-Z0-9\s\-\.]+$/u', // Sanitize name
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

        $user = User::create([
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
        $user = User::where('email', $request->email)->first();
        if ($user && ($user->status ?? 'active') === 'pending') {
            throw ValidationException::withMessages([
                'email' => ['Contul tău este în așteptarea aprobării. Un administrator va verifica cererea în curând.'],
            ]);
        }

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();
            
            $user = Auth::user();

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
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role ?? 'student',
                    'level' => $user->level ?? 1,
                    'points' => $user->points ?? 0,
                    'must_change_password' => (bool)$mustChangePassword,
                ],
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
                    'level' => $user->level ?? 1,
                    'points' => $user->points ?? 0,
                    'must_change_password' => (bool)($user->must_change_password ?? false),
                ],
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
                'level' => $user->level,
                'points' => $user->points,
                'must_change_password' => false,
            ],
        ]);
    }
}

