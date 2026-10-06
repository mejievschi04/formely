<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Notificările email se pornesc / opresc per academie (setarea globală rămâne comutatorul platformei). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'email_notifications')) {
            Schema::table('companies', function (Blueprint $table) {
                $table->boolean('email_notifications')->default(true)->after('features');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('companies', 'email_notifications')) {
            Schema::table('companies', function (Blueprint $table) {
                $table->dropColumn('email_notifications');
            });
        }
    }
};
