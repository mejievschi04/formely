<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $tables = [
        'users',
        'departments',
        'teams',
        'courses',
        'user_invitations',
    ];

    public function up(): void
    {
        $companyId = (int) DB::table('companies')->where('slug', 'default')->value('id');
        if ($companyId < 1) {
            throw new RuntimeException('Default company not found. Run create_companies_table migration first.');
        }

        foreach ($this->tables as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                if (! Schema::hasColumn($table, 'company_id')) {
                    $blueprint->unsignedBigInteger('company_id')->nullable()->after('id');
                    $blueprint->index('company_id');
                }
            });

            DB::table($table)->whereNull('company_id')->update(['company_id' => $companyId]);
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'company_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (array_reverse($this->tables) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_id')) {
                continue;
            }

            if ($table === 'users') {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropForeign(['company_id']);
                });
            }

            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropIndex(['company_id']);
                $blueprint->dropColumn('company_id');
            });
        }
    }
};
