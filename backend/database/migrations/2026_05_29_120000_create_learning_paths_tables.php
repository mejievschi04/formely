<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learning_paths', function (Blueprint $table) {
            $table->id();
            if (Schema::hasTable('companies')) {
                $table->unsignedBigInteger('company_id')->nullable()->index();
            }
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status', 20)->default('draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedSmallInteger('order')->default(0);
            if (Schema::hasTable('course_maps')) {
                $table->foreignId('course_map_id')->nullable()->constrained('course_maps')->nullOnDelete();
            }
            $table->json('settings')->nullable();
            $table->timestamps();
        });

        Schema::create('learning_path_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('learning_path_id')->constrained('learning_paths')->cascadeOnDelete();
            $table->unsignedSmallInteger('order')->default(0);
            $table->string('step_type', 20)->default('course');
            $table->foreignId('course_id')->nullable()->constrained('courses')->nullOnDelete();
            $table->foreignId('test_id')->nullable()->constrained('tests')->nullOnDelete();
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->boolean('required')->default(true);
            $table->unsignedTinyInteger('passing_score')->nullable();
            $table->foreignId('unlock_after_step_id')->nullable()->constrained('learning_path_steps')->nullOnDelete();
            $table->timestamps();

            $table->index(['learning_path_id', 'order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learning_path_steps');
        Schema::dropIfExists('learning_paths');
    }
};
