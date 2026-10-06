<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class UserNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_and_edit_users_with_romanian_diacritics(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $name = 'Ștefăniță Țîrlea Áâîșț ĂÂÎȘȚ';
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/users', [
            'name' => $name, 'email' => 'diacritice@example.test', 'role' => 'student',
        ])->assertCreated()->assertJsonPath('user.name', $name);

        // Combining marks are valid too (e.g. names pasted from another application).
        $updatedName = "S\u{0326}tefan Ma\u{0306}riut\u{0326}a";
        $this->putJson('/api/admin/users/'.$response->json('user.id'), ['name' => $updatedName])
            ->assertOk()->assertJsonPath('user.name', $updatedName);
        $this->assertDatabaseHas('users', ['email' => 'diacritice@example.test', 'name' => $updatedName]);

        $this->postJson('/api/admin/users', [
            'name' => $updatedName, 'email' => 'combining@example.test', 'role' => 'student',
        ])->assertCreated()->assertJsonPath('user.name', $updatedName);
    }

    public function test_registration_accepts_diacritics_and_still_rejects_markup(): void
    {
        Mail::fake();
        $this->postJson('/api/auth/register', [
            'name' => 'Ștefan Măriuță', 'email' => 'register@example.test',
            'password' => 'Password123', 'password_confirmation' => 'Password123',
        ])->assertCreated();
        $this->assertDatabaseHas('users', ['email' => 'register@example.test', 'name' => 'Ștefan Măriuță']);
        $this->postJson('/api/auth/register', [
            'name' => '<b>Ștefan</b>', 'email' => 'markup@example.test',
            'password' => 'Password123', 'password_confirmation' => 'Password123',
        ])->assertUnprocessable()->assertJsonValidationErrors('name');
    }
}
