<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_ai_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->string('period', 7); // YYYY-MM (UTC)
            $table->string('action', 40);
            $table->unsignedInteger('used')->default(0);
            $table->timestamps();

            $table->unique(['company_id', 'period', 'action']);
            $table->index(['company_id', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_ai_usages');
    }
};
