<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tabele venite din Volta după fork, care țin date per academie.
 * Academia se deduce din utilizatorul care a creat rândul.
 */
return new class extends Migration
{
    /** @var array<string, string> tabel => coloana cu utilizatorul de referință */
    private array $tables = [
        'registration_invitations' => 'invited_by',
        'guide_items' => 'user_id',
    ];

    public function up(): void
    {
        foreach ($this->tables as $table => $userColumn) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            if (! Schema::hasColumn($table, 'company_id')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->unsignedBigInteger('company_id')->nullable()->after('id');
                    $blueprint->index('company_id');
                });
            }

            DB::statement("
                UPDATE {$table}
                SET company_id = (SELECT u.company_id FROM users u WHERE u.id = {$table}.{$userColumn})
                WHERE company_id IS NULL AND {$userColumn} IS NOT NULL
            ");
        }
    }

    public function down(): void
    {
        foreach (array_keys($this->tables) as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'company_id')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropIndex(['company_id']);
                    $blueprint->dropColumn('company_id');
                });
            }
        }
    }
};
