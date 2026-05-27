<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            if (Schema::hasColumn('users', 'role')) {
                DB::statement('CREATE INDEX IF NOT EXISTS users_role_index ON users (role)');
            }
            if (Schema::hasColumn('users', 'status')) {
                DB::statement('CREATE INDEX IF NOT EXISTS users_status_index ON users (status)');
            }
            if (Schema::hasColumn('users', 'deleted_at')) {
                DB::statement('CREATE INDEX IF NOT EXISTS users_deleted_at_index ON users (deleted_at)');
            }
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'role')) {
                $table->index('role');
            }
            if (Schema::hasColumn('users', 'status')) {
                $table->index('status');
            }
            if (Schema::hasColumn('users', 'deleted_at')) {
                $table->index('deleted_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS users_role_index');
            DB::statement('DROP INDEX IF EXISTS users_status_index');
            DB::statement('DROP INDEX IF EXISTS users_deleted_at_index');
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'role')) {
                $table->dropIndex(['role']);
            }
            if (Schema::hasColumn('users', 'status')) {
                $table->dropIndex(['status']);
            }
            if (Schema::hasColumn('users', 'deleted_at')) {
                $table->dropIndex(['deleted_at']);
            }
        });
    }
};
