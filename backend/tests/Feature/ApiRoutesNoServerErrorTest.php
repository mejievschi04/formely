<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\E2eSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Fiecare rută API, apelată de fiecare rol (și fără autentificare), cu id-uri existente și inexistente:
 * niciun răspuns 5xx. Un id inexistent trebuie să dea 404, un acces interzis 403, date greșite 422.
 */
class ApiRoutesNoServerErrorTest extends TestCase
{
    use RefreshDatabase;

    /** Rute care cheamă servicii externe (AI), fac backup sau trimit fișiere — testate separat. */
    private const SKIP = '#(logout|backup|restore|ai/|volt|openai|groq|stream|export|download|impersonat|study-tools|broadcast|sanctum|_ignition)#i';

    public function test_no_api_route_answers_with_a_server_error(): void
    {
        $this->seed(E2eSeeder::class);
        $actors = [
            'admin' => User::where('email', 'admin@e2e.test')->firstOrFail(),
            'instructor' => User::factory()->create(['role' => 'instructor', 'status' => 'active']),
            'analyst' => User::factory()->create(['role' => 'analyst', 'status' => 'active']),
            'student' => User::where('email', 'student-desktop@e2e.test')->firstOrFail(),
            'guest' => null,
        ];

        $failures = [];
        foreach (['1', '2', '999999'] as $id) {
            foreach (Route::getRoutes() as $route) {
                $uri = $route->uri();
                if (! str_starts_with($uri, 'api/') || preg_match(self::SKIP, $uri)) {
                    continue;
                }
                $url = '/' . preg_replace('/\{[^}]+\}/', $id, $uri);
                foreach ($route->methods() as $method) {
                    if ($method === 'HEAD') {
                        continue;
                    }
                    foreach ($actors as $name => $user) {
                        // adminul nu șterge: restul cererilor au nevoie de date
                        if ($method === 'DELETE' && $name === 'admin') {
                            continue;
                        }
                        $this->app['auth']->forgetGuards();
                        $request = $user ? $this->actingAs($user, 'sanctum') : $this;
                        $status = $request->json($method, $url, $method === 'GET' ? [] : ['x' => 1])->getStatusCode();
                        if ($status >= 500) {
                            $failures[] = "{$status} {$method} {$url} [{$name}]";
                        }
                    }
                }
            }
        }

        $this->assertSame([], array_values(array_unique($failures)), "Rute cu eroare de server:\n" . implode("\n", array_unique($failures)));
    }
}
