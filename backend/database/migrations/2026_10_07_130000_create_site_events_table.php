<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_events', function (Blueprint $table) {
            $table->id();
            $table->string('type', 20);
            $table->char('visitor', 16);
            $table->string('path', 255)->default('/');
            $table->string('source', 100)->nullable();
            $table->string('utm_medium', 100)->nullable();
            $table->string('utm_campaign', 150)->nullable();
            $table->string('device', 10)->nullable();
            $table->string('lang', 5)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['created_at', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_events');
    }
};
