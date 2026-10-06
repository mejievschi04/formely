<?php

namespace App\Providers;

use App\Support\SchemaCache;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Formely: validările exists/unique respectă academia curentă.
        $this->app->extend('validation.presence', fn ($verifier, $app) => new \App\Support\TenantPresenceVerifier($app['db']));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $appUrl = (string) config('app.url', '');
        if (str_starts_with($appUrl, 'https://')) {
            URL::forceScheme('https');
        }

        // Structura tabelelor e ținută în cache (SchemaCache); orice migrare o invalidează.
        Event::listen(MigrationsEnded::class, fn () => SchemaCache::flush());

        // SPA autentificat: polling notificări, progres lecții, telemetrie — buget mai mare decât 60/min.
        RateLimiter::for('api-app', function (Request $request) {
            $key = (string) ($request->user()?->id ?? $request->ip());

            return Limit::perMinute((int) config('api.app_per_minute', 300))->by($key);
        });

        if (config('database.default') === 'sqlite') {
            $databasePath = config('database.connections.sqlite.database');

            // Skip file creation for in-memory database (used in tests)
            if ($databasePath === ':memory:') {
                return;
            }

            if (is_string($databasePath) && ! file_exists($databasePath)) {
                $directory = dirname($databasePath);

                if (! is_dir($directory)) {
                    mkdir($directory, 0755, true);
                }

                touch($databasePath);
            }
        }
    }
}
