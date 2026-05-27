<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            if (!Schema::hasColumn('courses', 'workflow_status')) {
                $table->string('workflow_status', 32)->default('draft')->after('status');
                $table->index('workflow_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            if (Schema::hasColumn('courses', 'workflow_status')) {
                $table->dropIndex(['workflow_status']);
                $table->dropColumn('workflow_status');
            }
        });
    }
};

