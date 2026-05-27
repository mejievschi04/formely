<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('courses')->onDelete('cascade');
            $table->unsignedInteger('version');
            $table->string('status', 32)->default('draft'); // draft|review|published
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['course_id', 'version']);
            $table->index(['course_id', 'status']);
        });

        Schema::create('course_version_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_version_id')->constrained('course_versions')->onDelete('cascade');
            $table->json('snapshot_json');
            $table->timestamps();

            $table->index('course_version_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_version_snapshots');
        Schema::dropIfExists('course_versions');
    }
};

