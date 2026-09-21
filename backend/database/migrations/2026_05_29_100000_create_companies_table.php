<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('logo_path')->nullable();
            $table->string('primary_color', 32)->default('#0891b2');
            $table->string('secondary_color', 32)->default('#22d3ee');
            $table->string('status')->default('active');
            $table->timestamps();
        });

        $now = now();
        $defaultName = config('app.name', 'Formely');
        DB::table('companies')->insert([
            'name' => $defaultName,
            'slug' => 'default',
            'primary_color' => '#0891b2',
            'secondary_color' => '#22d3ee',
            'status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
