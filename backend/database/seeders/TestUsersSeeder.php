<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Utilizatori de test: 1 instructor + 10 studenți.
 *
 * Parolă comună: password
 *
 * Rulare: php artisan db:seed --class=TestUsersSeeder
 */
class TestUsersSeeder extends Seeder
{
    public const TEST_PASSWORD = 'password';

    public function run(): void
    {
        $password = Hash::make(self::TEST_PASSWORD);

        $instructor = User::updateOrCreate(
            ['email' => 'instructor@formely.local'],
            [
                'name' => 'Instructor Test',
                'password' => $password,
                'role' => 'instructor',
                'status' => 'active',
                'bio' => 'Cont instructor pentru testare locală.',
                'level' => 5,
                'points' => 500,
            ]
        );

        $students = [
            'Ana Popescu',
            'Andrei Ionescu',
            'Elena Dumitrescu',
            'Mihai Georgescu',
            'Ioana Marin',
            'Cristian Stan',
            'Maria Radu',
            'Alexandru Enache',
            'Diana Vasile',
            'Gabriel Moldovan',
        ];

        foreach ($students as $index => $name) {
            $num = str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
            User::updateOrCreate(
                ['email' => "student{$num}@formely.local"],
                [
                    'name' => $name,
                    'password' => $password,
                    'role' => 'student',
                    'status' => 'active',
                    'bio' => 'Student de test Formely.',
                    'level' => 1 + ($index % 3),
                    'points' => 100 + ($index * 25),
                ]
            );
        }

        $this->command?->info('Test users seeded (password: '.self::TEST_PASSWORD.')');
        $this->command?->info('Instructor: instructor@formely.local');
        $this->command?->info('Students:  student01@formely.local … student10@formely.local');
        $this->command?->info("Instructor id: {$instructor->id}");
    }
}
