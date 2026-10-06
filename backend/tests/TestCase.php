<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        parent::setUp();

        // Fișierele publice și backup-urile din teste stau în foldere proprii, golite la fiecare test,
        // ca testele (ex. backup + restaurare) să nu scrie peste storage/app/public sau lms-backups reale.
        $publicRoot = storage_path('framework/testing/public');
        $backupRoot = storage_path('framework/testing/lms-backups');
        File::deleteDirectory($publicRoot);
        File::deleteDirectory($backupRoot);
        config([
            'filesystems.disks.public.root' => $publicRoot,
            'volta.backup_root' => $backupRoot,
        ]);
    }
}
