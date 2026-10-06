<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/** Importul de backup (doar platformă) creează utilizatorii lipsă și nu lasă modelele fără protecție. */
class BackupImportTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->forceFill(['company_id' => null])->save();

        return $admin->fresh();
    }

    private function import(User $as, array $payload)
    {
        $file = UploadedFile::fake()->createWithContent('backup.json', json_encode($payload));

        return $this->actingAs($as, 'sanctum')
            ->post('/api/admin/import', ['backup_file' => $file], ['Accept' => 'application/json']);
    }

    public function test_import_creates_missing_users_with_a_forced_password_change(): void
    {
        $this->import($this->platformAdmin(), [
            'export_date' => now()->toISOString(),
            'users' => [['email' => 'restaurat@client.test', 'name' => 'Restaurat', 'role' => 'student', 'password' => 'hash-din-export']],
        ])->assertOk();

        $user = User::withoutGlobalScopes()->where('email', 'restaurat@client.test')->firstOrFail();
        $this->assertNotEmpty($user->password);
        $this->assertTrue((bool) $user->must_change_password);
    }

    public function test_failed_import_restores_mass_assignment_protection(): void
    {
        $this->import($this->platformAdmin(), [
            'export_date' => now()->toISOString(),
            'courses' => [['id' => 'nu-e-numar', 'title' => ['nu', 'e', 'text']]],
        ])->assertStatus(500);

        $this->assertFalse(Model::isUnguarded());
    }
}
