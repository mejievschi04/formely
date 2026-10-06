<?php

namespace Tests\Feature;

use App\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use ReflectionMethod;
use Tests\TestCase;

class CsrfTokenResolutionTest extends TestCase
{
    public function test_plaintext_xsrf_header_matches_session_token(): void
    {
        $token = $this->tokenFromHeader('plain-session-token', 'plain-session-token');

        $this->assertSame('plain-session-token', $token);
    }

    public function test_xsrf_header_with_spaces_is_treated_as_base64_plus(): void
    {
        $token = $this->tokenFromHeader('abc+def', 'abc def');

        $this->assertSame('abc+def', $token);
    }

    public function test_wrong_xsrf_header_does_not_match(): void
    {
        $token = $this->tokenFromHeader('expected-token', 'other-token');

        $this->assertSame('', $token);
    }

    private function tokenFromHeader(string $sessionToken, string $header): string
    {
        $middleware = $this->app->make(ValidateCsrfToken::class);
        $request = Request::create('/api/auth/login', 'POST', server: [
            'HTTP_X_XSRF_TOKEN' => $header,
            'HTTP_ORIGIN' => 'http://localhost:5173',
        ]);

        $session = $this->app['session']->driver();
        $session->start();
        $session->put('_token', $sessionToken);
        $request->setLaravelSession($session);

        $method = new ReflectionMethod($middleware, 'getTokenFromRequest');
        $resolved = $method->invoke($middleware, $request);

        return is_string($resolved) ? $resolved : '';
    }
}
