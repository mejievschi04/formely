<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('progression_rules');

        if (Schema::hasColumn('courses', 'progression_rules')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropColumn('progression_rules');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('courses', 'progression_rules')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->json('progression_rules')->nullable()->after('sequential_unlock');
            });
        }

        if (!Schema::hasTable('progression_rules')) {
            Schema::create('progression_rules', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('course_id');
                $table->foreign('course_id')->references('id')->on('courses')->onDelete('cascade');
                $table->enum('type', [
                    'lesson_completion',
                    'test_passing',
                    'minimum_score',
                    'order_constraint',
                    'time_requirement',
                    'prerequisite',
                ]);
                $table->enum('target_type', ['lesson', 'module', 'test', 'course'])->nullable();
                $table->unsignedBigInteger('target_id')->nullable();
                $table->enum('condition_type', ['lesson', 'module', 'test', 'score', 'time'])->nullable();
                $table->unsignedBigInteger('condition_id')->nullable();
                $table->string('condition_value')->nullable();
                $table->enum('action', ['unlock', 'lock', 'require', 'optional'])->default('unlock');
                $table->integer('priority')->default(100);
                $table->boolean('active')->default(true);
                $table->timestamps();
                $table->index(['course_id', 'type', 'active']);
                $table->index(['target_type', 'target_id']);
            });
        }
    }
};
