<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->string('plan', 32)->default('business')->after('status');
            $table->unsignedInteger('max_active_learners')->nullable()->after('plan');
            $table->unsignedInteger('max_staff')->nullable()->after('max_active_learners');
            $table->json('features')->nullable()->after('max_staff');
            $table->timestamp('trial_ends_at')->nullable()->after('features');
            $table->timestamp('contract_ends_at')->nullable()->after('trial_ends_at');
            $table->text('notes')->nullable()->after('contract_ends_at');
        });

        // status was free-string; normalize existing rows and allow trial/suspended
        $business = config('plans.business');
        $featuresJson = json_encode($business['features'] ?? []);

        DB::table('companies')->update([
            'plan' => 'business',
            'max_active_learners' => $business['max_active_learners'] ?? null,
            'max_staff' => $business['max_staff'] ?? 50,
            'features' => $featuresJson,
            'status' => DB::raw("CASE WHEN status = 'active' OR status IS NULL OR status = '' THEN 'active' ELSE status END"),
        ]);
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn([
                'plan',
                'max_active_learners',
                'max_staff',
                'features',
                'trial_ends_at',
                'contract_ends_at',
                'notes',
            ]);
        });
    }
};
