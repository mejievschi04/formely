<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adaugă status 'pending' pentru cereri de înregistrare în așteptarea aprobării admin.
     */
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY COLUMN status ENUM('active', 'suspended', 'pending') DEFAULT 'active'");
        } elseif ($driver === 'pgsql') {
            // PostgreSQL: drop check constraint dacă există, apoi adaugă noua
            DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'pending'))");
        } else {
            Schema::table('users', function (Blueprint $table) {
                $table->string('status', 20)->default('active')->change();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')->where('status', 'pending')->update(['status' => 'active']);
        
        $driver = Schema::getConnection()->getDriverName();
        
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY COLUMN status ENUM('active', 'suspended') DEFAULT 'active'");
        }
        // pgsql/sqlite: varchar acceptă orice, nu e nevoie de rollback
    }
};
