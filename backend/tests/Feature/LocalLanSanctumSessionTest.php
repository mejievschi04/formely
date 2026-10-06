<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Illuminate\Http\Request;
use Tests\TestCase;

class LocalLanSanctumSessionTest extends TestCase
{
    public function test_lan_origin_from_phone_is_stateful_so_session_starts(): void
    {
        $request = Request::create('http://127.0.0.1:8000/api/csrf-cookie', 'GET', server: [
            'HTTP_ORIGIN' => 'http://172.16.1.216:5173',
            'HTTP_HOST' => '127.0.0.1:8000',
        ]);

        $this->assertTrue(EnsureFrontendRequestsAreStateful::fromFrontend($request));
    }

    public function test_csrf_cookie_from_lan_origin_does_not_fail_without_session(): void
    {
        $response = $this->withHeaders([
            'Origin' => 'http://172.16.1.216:5173',
            'Referer' => 'http://172.16.1.216:5173/',
        ])->getJson('/api/csrf-cookie');

        $response->assertOk();
        $this->assertNotSame('', (string) $response->json('token'));
        $this->assertNotSame('', (string) $response->headers->get('X-CSRF-TOKEN'));
        $this->assertSame($response->json('token'), $response->headers->get('X-CSRF-TOKEN'));
    }
}
