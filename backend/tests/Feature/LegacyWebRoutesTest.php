<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Backend-ul nu mai are pagini web proprii (login/înregistrare/dashboard vechi, fără limită de încercări
 * și fără verificarea contului suspendat). Interfața e aplicația React; aici rămân doar /api și /storage.
 */
class LegacyWebRoutesTest extends TestCase
{
    public function test_legacy_web_pages_are_gone(): void
    {
        foreach (['/login', '/register', '/dashboard', '/courses/1'] as $url) {
            $this->get($url)->assertNotFound();
        }
        $this->post('/login', ['email' => 'a@b.c', 'password' => 'x'])->assertNotFound();
        $this->post('/register', ['email' => 'a@b.c'])->assertNotFound();
    }

    public function test_guest_on_protected_route_gets_401_json_or_redirect_to_app_login(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();

        $this->get('/api/auth/me')->assertRedirect(config('volta.frontend_url') . '/login');
    }
}
