<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use App\Services\LmsBackupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LmsBackupTest extends TestCase
{
    use RefreshDatabase;

    public function test_backup_and_restore_recover_user_and_public_file(): void
    {
        $user = User::factory()->create(['name' => 'Nume original']);
        Storage::disk('public')->put('lms-backup-probe.txt', 'continut-original');

        $path = app(LmsBackupService::class)->createBackup()['path'];
        $this->assertFileExists($path . '/manifest.json');
        $this->assertFileExists($path . '/database.json');

        $user->update(['name' => 'Nume schimbat']);
        Storage::disk('public')->put('lms-backup-probe.txt', 'continut-schimbat');

        $this->artisan('volta:backup-restore', ['path' => $path, '--force' => true])->assertSuccessful();

        $this->assertSame('Nume original', $user->fresh()->name);
        $this->assertSame('continut-original', Storage::disk('public')->get('lms-backup-probe.txt'));
    }

    public function test_scheduled_backup_is_skipped_when_disabled(): void
    {
        Setting::set('backup_enabled', '0', 'boolean', 'Backup automat activat');
        $before = glob(storage_path('app/lms-backups/*/manifest.json')) ?: [];
        $this->artisan('volta:backup')->assertSuccessful();
        $after = glob(storage_path('app/lms-backups/*/manifest.json')) ?: [];
        $this->assertCount(count($before), $after);
    }

    public function test_forced_backup_runs_when_disabled(): void
    {
        Setting::set('backup_enabled', '0', 'boolean', 'Backup automat activat');
        $this->artisan('volta:backup', ['--force' => true])->assertSuccessful();
        $this->assertNotFalse(glob(storage_path('app/lms-backups/*/manifest.json')));
    }
}
