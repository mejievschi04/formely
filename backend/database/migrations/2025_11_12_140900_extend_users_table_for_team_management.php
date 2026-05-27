<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Status: active / suspended
            if (!Schema::hasColumn('users', 'status')) {
                $table->enum('status', ['active', 'suspended'])->default('active')->after('role');
            }
            
            // Permissions (JSON field for configurable permissions per role)
            if (!Schema::hasColumn('users', 'permissions')) {
                $table->json('permissions')->nullable()->after('status');
            }
            
            // Last login timestamp
            if (!Schema::hasColumn('users', 'last_login_at')) {
                $table->timestamp('last_login_at')->nullable()->after('permissions');
            }
            
            // Last activity timestamp
            if (!Schema::hasColumn('users', 'last_activity_at')) {
                $table->timestamp('last_activity_at')->nullable()->after('last_login_at');
            }
            
            // Suspended reason (if suspended)
            if (!Schema::hasColumn('users', 'suspended_reason')) {
                $table->text('suspended_reason')->nullable()->after('last_activity_at');
            }
            
            // Suspended until (temporary suspension)
            if (!Schema::hasColumn('users', 'suspended_until')) {
                $table->timestamp('suspended_until')->nullable()->after('suspended_reason');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $columns = [
                'status', 'permissions', 'last_login_at', 
                'last_activity_at', 'suspended_reason', 'suspended_until'
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

