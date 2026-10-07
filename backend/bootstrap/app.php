<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands()
    ->withSchedule(function (\Illuminate\Console\Scheduling\Schedule $schedule): void {
        $schedule->command('volta:backup')->hourly();
        $schedule->command('volta:remind-invitation-expiry')->hourly();
        $schedule->command('companies:expire-trials')->hourly();
    })
    ->withMiddleware(function (Middleware $middleware): void {
        // Nu există pagini web de login pe backend: vizitatorul neautentificat care deschide o rută
        // protejată în browser ajunge la login-ul aplicației; cererile API primesc 401 (JSON).
        $middleware->redirectGuestsTo(fn (\Illuminate\Http\Request $request) => $request->expectsJson()
            ? null
            : config('volta.frontend_url') . '/login');
        $middleware->alias([
            'account.active' => \App\Http\Middleware\EnsureAccountIsActive::class,
            'tenant' => \App\Http\Middleware\SetTenantFromUser::class,
            'tenant.optional' => \App\Http\Middleware\SetOptionalTenant::class,
            'platform_admin' => \App\Http\Middleware\EnsureSuperAdmin::class,
            'company_feature' => \App\Http\Middleware\EnsureCompanyFeature::class,
            'platform.only' => \App\Http\Middleware\BlockTenantPlatformActions::class,
        ]);
        // Formularul de lead și statisticile de pe site-ul de marketing (alt domeniu, fără sesiune).
        $middleware->validateCsrfTokens(except: [
            'api/leads',
            'api/track',
        ]);

        // În spatele Nginx / Docker, X-Forwarded-Proto și IP corect pentru HTTPS, rate limit, sesiuni.
        $middleware->trustProxies(at: '*');

        // Sanctum SPA: sesiune + CSRF doar pentru request-uri stateful (fără StartSession duplicat).
        $middleware->api(prepend: [
            \App\Http\Middleware\ResetTenantContext::class,
            \App\Http\Middleware\HandleCors::class,
            \App\Http\Middleware\SecurityHeaders::class,
            \App\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);
        // AuthenticateSession can cause issues with API routes, so we'll handle auth differently
        // $middleware->api(append: [
        //     \Illuminate\Session\Middleware\AuthenticateSession::class,
        // ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Suppress Laravel 12 ServeCommand parsing errors (non-critical)
        // These errors occur when parsing PHP server output and don't affect functionality
        $exceptions->reportable(function (\Throwable $e) {
            // Ignore non-critical ServeCommand parsing errors
            if ($e instanceof \ErrorException 
                && str_contains($e->getMessage(), 'Undefined array key') 
                && str_contains($e->getFile(), 'ServeCommand.php')) {
                return false; // Don't report this error
            }
        });

        // Pe VPS: pune VOLTA_EXPOSE_API_ERRORS=true temporar în .env ca răspunsul JSON la 500 să conțină mesajul excepției (fără APP_DEBUG complet).
        // JSON response when upload exceeds PHP `post_max_size` (the request doesn't reach controllers).
        $exceptions->render(function (\Illuminate\Http\Exceptions\PostTooLargeException $e, \Illuminate\Http\Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Fisierul incarcat este prea mare pentru server (limita de upload).',
            ], 413);
        });

        $exceptions->render(function (\Throwable $e, \Illuminate\Http\Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            // config(), nu env(): în producție rulează `config:cache`, iar env() ar întoarce null.
            if (! config('app.expose_api_errors')) {
                return null;
            }
            // Doar erorile neprevăzute devin 500 cu detalii; 401/403/404/422 rămân cum sunt.
            if ($e instanceof \Illuminate\Validation\ValidationException
                || $e instanceof \Illuminate\Auth\AuthenticationException
                || $e instanceof \Illuminate\Auth\Access\AuthorizationException
                || $e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException
                || $e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                return null;
            }

            return response()->json([
                'message' => $e->getMessage(),
                'exception' => basename(str_replace('\\', '/', $e::class)),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ], 500);
        });
    })->create();
