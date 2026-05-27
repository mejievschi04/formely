<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Category;
use App\Models\Course;

class CreateRegulamentCategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create "Regulament" category
        $category = Category::firstOrCreate(
            ['name' => 'Regulament'],
            [
                'description' => 'Regulamente și proceduri de securitate',
                'icon' => '📋',
                'order' => 0, // First folder to appear
            ]
        );

        // Move course with ID 1 (securitate) to this category
        $course = Course::find(1);
        if ($course) {
            $course->category_id = $category->id;
            $course->save();
            $this->command->info('Cursul de securitate a fost mutat în folderul Regulament');
        } else {
            $this->command->warn('Cursul cu ID 1 nu există');
        }
    }
}
