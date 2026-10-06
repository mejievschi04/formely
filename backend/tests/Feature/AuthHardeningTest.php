<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** Autentificarea nu dezvăluie starea conturilor și nu blochează ieșirea din sesiune. */
class AuthHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_wrong_password_gets_generic_error_whatever_the_account_status(): void
    {
        foreach (['pending', 'suspended', 'active'] as $status) {
            User::factory()->create([
                'email' => "{$status}@client.test",
                'password' => Hash::make('Password123'),
                'status' => $status,
            ]);
        }

        $messages = collect(['pending', 'suspended', 'active', 'nimeni'])->map(fn ($s) => $this
            ->postJson('/api/auth/login', ['email' => "{$s}@client.test", 'password' => 'Gresita123'])
            ->assertUnprocessable()
            ->json('errors.email.0'));

        $this->assertSame(['Datele de autentificare nu sunt corecte.'], $messages->unique()->values()->all());
    }

    public function test_correct_password_still_explains_pending_and_suspended(): void
    {
        User::factory()->create(['email' => 'p@client.test', 'password' => Hash::make('Password123'), 'status' => 'pending']);
        User::factory()->create(['email' => 's@client.test', 'password' => Hash::make('Password123'), 'status' => 'suspended']);

        $this->postJson('/api/auth/login', ['email' => 'p@client.test', 'password' => 'Password123'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', fn ($m) => str_contains($m, 'așteptarea aprobării'));
        $this->postJson('/api/auth/login', ['email' => 's@client.test', 'password' => 'Password123'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', fn ($m) => str_contains($m, 'suspendat'));
    }

    public function test_suspended_user_can_still_log_out(): void
    {
        $user = User::factory()->create(['status' => 'suspended']);

        $this->actingAs($user, 'sanctum')->getJson('/api/auth/me')->assertForbidden();
        $this->actingAs($user, 'sanctum')->postJson('/api/auth/logout')->assertOk();
    }

    public function test_mobile_token_is_issued_for_formely_and_volta_client_headers(): void
    {
        User::factory()->create(['email' => 'mobil@client.test', 'password' => Hash::make('Password123'), 'status' => 'active']);

        foreach (['X-Formely-Client', 'X-Volta-Client'] as $header) {
            $this->app['auth']->forgetGuards();
            $this->withHeaders([$header => 'mobile', 'Origin' => 'http://localhost', 'Referer' => 'http://localhost/'])
                ->postJson('/api/auth/login', ['email' => 'mobil@client.test', 'password' => 'Password123'])
                ->assertOk()
                ->assertJsonStructure(['token']);
        }
    }
}
