<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('courses')) {
            return;
        }
        if (!Schema::hasColumn('courses', 'list_order')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->unsignedInteger('list_order')->default(0)->after('id');
            });
        }

        // Ordine inițială: cele mai recent actualizate primele (ca sortul vechi „recent”).
        if (Schema::hasColumn('courses', 'list_order') && Schema::hasColumn('courses', 'updated_at')) {
            $ids = DB::table('courses')->orderByDesc('updated_at')->orderByDesc('id')->pluck('id');
            foreach ($ids as $i => $id) {
                DB::table('courses')->where('id', $id)->update(['list_order' => (int) $i]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'list_order')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropColumn('list_order');
            });
        }
    }
};
