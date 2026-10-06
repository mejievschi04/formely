<?php

namespace App\Console\Commands;

use App\Services\LmsBackupService;
use Illuminate\Console\Command;

class RestoreLmsBackupCommand extends Command
{
    protected $signature = 'volta:backup-restore {path : Directorul backup cu manifest.json} {--force : Confirmă restaurarea}';

    protected $description = 'Restaurează un backup LMS (suprascrie datele curente).';

    public function handle(LmsBackupService $backups): int
    {
        if (! $this->option('force')) {
            $this->error('Adaugă --force ca să confirmi restaurarea. Operația suprascrie baza și fișierele publice.');

            return self::FAILURE;
        }

        if (app()->environment('production') && ! config('app.allow_lms_backup_restore')) {
            $this->error('Restaurarea în producție cere ALLOW_LMS_BACKUP_RESTORE=true.');

            return self::FAILURE;
        }

        $backups->restore((string) $this->argument('path'));
        $this->info('Backup restaurat.');

        return self::SUCCESS;
    }
}
