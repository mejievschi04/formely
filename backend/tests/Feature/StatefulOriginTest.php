<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Illuminate\Http\Request;
use Tests\TestCase;

/** Originile din LAN / localhost sunt de încredere doar în dezvoltare, nu și cu APP_DEBUG în producție. */
class StatefulOriginTest extends TestCase
{
    private function lanRequest(): Request
    {
        $request = Request::create('/api/auth/me');
        $request->headers->set('Origin', 'http://192.168.1.50:5173');
        $request->headers->set('Referer', 'http://192.168.1.50:5173/');

        return $request;
    }

    public function test_lan_origin_is_not_trusted_in_production_even_with_debug(): void
    {
        config(['app.debug' => true, 'sanctum.stateful' => ['academy.formely.org']]);
        $this->app['env'] = 'production';

        $this->assertFalse(EnsureFrontendRequestsAreStateful::fromFrontend($this->lanRequest()));
    }

    public function test_lan_origin_is_trusted_locally(): void
    {
        config(['sanctum.stateful' => ['academy.formely.org']]);
        $this->app['env'] = 'local';

        $this->assertTrue(EnsureFrontendRequestsAreStateful::fromFrontend($this->lanRequest()));
    }
}
