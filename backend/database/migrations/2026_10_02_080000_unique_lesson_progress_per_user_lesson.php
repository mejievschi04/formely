<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('lesson_progress')) {
            return;
        }

        $dupes = DB::table('lesson_progress')
            ->select('user_id', 'lesson_id')
            ->groupBy('user_id', 'lesson_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($dupes as $dupe) {
            $rows = DB::table('lesson_progress')
                ->where('user_id', $dupe->user_id)
                ->where('lesson_id', $dupe->lesson_id)
                ->orderByDesc('id')
                ->get();

            $keeper = $rows->first(function ($row) {
                return (bool) $row->completed || (int) $row->progress_percentage >= 100;
            }) ?? $rows->first();

            $dropIds = $rows->pluck('id')->filter(fn ($id) => (int) $id !== (int) $keeper->id)->values();
            if ($dropIds->isNotEmpty()) {
                DB::table('lesson_progress')->whereIn('id', $dropIds->all())->delete();
            }

            if ($rows->contains(fn ($row) => (bool) $row->completed || (int) $row->progress_percentage >= 100)) {
                DB::table('lesson_progress')->where('id', $keeper->id)->update([
                    'completed' => true,
                    'progress_percentage' => 100,
                    'updated_at' => now(),
                ]);
            }
        }

        $hasUnique = collect(Schema::getIndexes('lesson_progress'))
            ->contains(function ($index) {
                $columns = $index['columns'] ?? [];

                return ($index['unique'] ?? false)
                    && in_array('user_id', $columns, true)
                    && in_array('lesson_id', $columns, true);
            });

        if (! $hasUnique) {
            Schema::table('lesson_progress', function (Blueprint $table) {
                $table->unique(['user_id', 'lesson_id']);
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('lesson_progress')) {
            return;
        }

        $hasUnique = collect(Schema::getIndexes('lesson_progress'))
            ->contains(function ($index) {
                $columns = $index['columns'] ?? [];

                return ($index['unique'] ?? false)
                    && in_array('user_id', $columns, true)
                    && in_array('lesson_id', $columns, true);
            });

        if ($hasUnique) {
            Schema::table('lesson_progress', function (Blueprint $table) {
                $table->dropUnique(['user_id', 'lesson_id']);
            });
        }
    }
};
