<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CoursesSeeder extends Seeder
{
    public function run(): void
    {
        $courseId = DB::table('courses')->insertGetId([
            'title' => 'Primul Curs',
            'description' => 'Descriere curs de test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('lessons')->insert([
            [
                'course_id' => $courseId,
                'title' => 'Prima lecție',
                'content' => 'Conținut lecție 1',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'course_id' => $courseId,
                'title' => 'A doua lecție',
                'content' => 'Conținut lecție 2',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}
