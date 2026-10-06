<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Cu register-ul public oprit, endpoint-ul nu trebuie să dezvăluie ce emailuri au cont. */
class RegisterDisabledTest extends TestCase
{
    use RefreshDatabase;

    public function test_disabled_register_answers_the_same_for_existing_and_new_emails(): void
    {
        config(['formely.public_register_enabled' => false]);
        User::factory()->create(['email' => 'exista@client.test']);

        $payload = fn (string $email) => [
            'name' => 'Ion Pop',
            'email' => $email,
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ];

        $existing = $this->postJson('/api/auth/register', $payload('exista@client.test'));
        $fresh = $this->postJson('/api/auth/register', $payload('nou@client.test'));
        $invalid = $this->postJson('/api/auth/register', ['email' => 'exista@client.test']);

        $existing->assertForbidden();
        $fresh->assertForbidden();
        $invalid->assertForbidden();
        $this->assertSame($existing->json('message'), $fresh->json('message'));
        $this->assertDatabaseMissing('users', ['email' => 'nou@client.test']);
    }
}
