<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('conversation_participants')) {
            return;
        }

        Schema::table('conversation_participants', function (Blueprint $table) {
            if (! Schema::hasColumn('conversation_participants', 'last_read_at')) {
                $table->timestamp('last_read_at')->nullable()->after('group_role');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('conversation_participants')) {
            return;
        }

        Schema::table('conversation_participants', function (Blueprint $table) {
            if (Schema::hasColumn('conversation_participants', 'last_read_at')) {
                $table->dropColumn('last_read_at');
            }
        });
    }
};
