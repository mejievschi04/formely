<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->string('group_role', 20)->default('member');
        });

        if (Schema::hasTable('conversations') && Schema::hasTable('conversation_participants')) {
            DB::table('conversation_participants')
                ->whereExists(function ($query) {
                    $query->select(DB::raw(1))
                        ->from('conversations as c')
                        ->whereColumn('c.id', 'conversation_participants.conversation_id')
                        ->where('c.is_group', true)
                        ->whereColumn('c.created_by', 'conversation_participants.user_id');
                })
                ->update(['group_role' => 'owner']);
        }
    }

    public function down(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->dropColumn('group_role');
        });
    }
};
