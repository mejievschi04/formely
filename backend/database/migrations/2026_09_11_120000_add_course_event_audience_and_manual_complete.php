<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('course_user') && ! Schema::hasColumn('course_user', 'manually_completed')) {
            Schema::table('course_user', function (Blueprint $table) {
                $table->boolean('manually_completed')->default(false)->after('completed_at');
            });
        }

        if (Schema::hasTable('events') && ! Schema::hasColumn('events', 'audience_type')) {
            Schema::table('events', function (Blueprint $table) {
                $table->string('audience_type', 16)->default('all')->after('access_type');
            });
        }

        if (! Schema::hasTable('event_team')) {
            Schema::create('event_team', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('event_id');
                $table->unsignedBigInteger('team_id');
                $table->timestamps();
                $table->unique(['event_id', 'team_id']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('event_team')) {
            Schema::dropIfExists('event_team');
        }
        if (Schema::hasTable('events') && Schema::hasColumn('events', 'audience_type')) {
            Schema::table('events', function (Blueprint $table) {
                $table->dropColumn('audience_type');
            });
        }
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'manually_completed')) {
            Schema::table('course_user', function (Blueprint $table) {
                $table->dropColumn('manually_completed');
            });
        }
    }
};
