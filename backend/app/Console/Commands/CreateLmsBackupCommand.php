<?php

namespace App\Console\Commands;

use App\Services\LmsBackupService;
use Illuminate\Console\Command;

class CreateLmsBackupCommand extends Command
{
    protected $signature = 'volta:backup {--force : Rulează chiar dacă backup_enabled este oprit}';

    protected $description = 'Creează un backup LMS (bază + storage public).';

    public function handle(LmsBackupService $backups): int
    {
        if (! $this->option('force') && ! $backups->shouldRunScheduledBackup()) {
            $this->comment('Backup-ul programat este oprit sau a rulat deja în intervalul setat.');

            return self::SUCCESS;
        }

        $result = $backups->createBackup();
        $this->info('Backup salvat în ' . $result['path']);

        return self::SUCCESS;
    }
}
