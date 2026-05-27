<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('messages')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->index(
                    ['conversation_id', 'read', 'sender_id'],
                    'messages_conversation_read_sender_idx'
                );
            });
        }

        if (Schema::hasTable('conversations')) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->index(['is_group', 'user1_id'], 'conversations_is_group_user1_idx');
                $table->index(['is_group', 'user2_id'], 'conversations_is_group_user2_idx');
            });
        }

        if (Schema::hasTable('conversation_participants')) {
            Schema::table('conversation_participants', function (Blueprint $table) {
                $table->index(['user_id', 'conversation_id'], 'conv_participants_user_conversation_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('messages')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->dropIndex('messages_conversation_read_sender_idx');
            });
        }

        if (Schema::hasTable('conversations')) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->dropIndex('conversations_is_group_user1_idx');
                $table->dropIndex('conversations_is_group_user2_idx');
            });
        }

        if (Schema::hasTable('conversation_participants')) {
            Schema::table('conversation_participants', function (Blueprint $table) {
                $table->dropIndex('conv_participants_user_conversation_idx');
            });
        }
    }
};

