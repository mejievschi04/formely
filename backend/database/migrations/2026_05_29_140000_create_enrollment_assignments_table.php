<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enrollment_assignments', function (Blueprint $table) {
            $table->id();
            if (Schema::hasTable('companies')) {
                $table->unsignedBigInteger('company_id')->nullable()->index();
            }
            $table->string('assignable_type', 30);
            $table->foreignId('course_id')->nullable()->constrained('courses')->cascadeOnDelete();
            $table->foreignId('learning_path_id')->nullable()->constrained('learning_paths')->nullOnDelete();
            $table->string('source_type', 30)->default('manual');
            $table->foreignId('source_team_id')->nullable()->constrained('teams')->nullOnDelete();
            if (Schema::hasTable('departments')) {
                $table->foreignId('source_department_id')->nullable()->constrained('departments')->nullOnDelete();
            } else {
                $table->unsignedBigInteger('source_department_id')->nullable();
            }
            $table->string('source_role', 50)->nullable();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_mandatory')->default(true);
            $table->timestamp('due_at')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->useCurrent();
            $table->string('status', 20)->default('active');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'assignable_type', 'status']);
            $table->index(['course_id', 'user_id']);
            $table->index(['learning_path_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enrollment_assignments');
    }
};
