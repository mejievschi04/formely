<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Category;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // --- Admin User ---
        $admin = User::firstOrCreate(
            ['email' => 'admin@formely.local'],
            [
                'name' => 'Administrator',
                'password' => Hash::make('formely2025'),
                'role' => 'admin',
                'avatar' => null,
                'bio' => 'Administrator al platformei Formely',
            
            ]
        );
        
        // Update password if admin already exists
        if ($admin->wasRecentlyCreated === false) {
            $admin->update(['password' => Hash::make('formely2025')]);
        }

        $this->call(TestUsersSeeder::class);

        // --- Categories (Compartimente) ---
            $categories = [
                [
                    'name' => 'Produse Noi',
                    'description' => 'Cursuri despre produsele noi lansate',
                    'icon' => '🆕',
                    'color' => '#667eea',
                    'order' => 1,
                ],
                [
                    'name' => 'Formare Generală',
                    'description' => 'Cursuri de formare generală',
                    'icon' => '📚',
                    'color' => '#43e97b',
                    'order' => 2,
                ],
                [
                    'name' => 'Tehnologie',
                    'description' => 'Cursuri despre tehnologie și inovații',
                    'icon' => '💻',
                    'color' => '#4facfe',
                    'order' => 3,
                ],
            ];

            foreach ($categories as $categoryData) {
                Category::firstOrCreate(
                    ['name' => $categoryData['name']],
                    $categoryData
                );
            }

        // --- Users ---
        $teachers = collect([
            [
                'email' => 'ana@example.com',
                'name' => 'Profesor Ana',
                'bio' => 'Profesor de dezvoltare web și PHP.',
            ],
            [
                'email' => 'ion@example.com',
                'name' => 'Profesor Ion',
                'bio' => 'Specialist Laravel & API design.',
            ],
            [
                'email' => 'elena@example.com',
                'name' => 'Profesoara Elena',
                'bio' => 'Designer UX și specialistă în cercetare utilizatori.',
            ],
        ])->map(function (array $data) {
            return User::firstOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'password' => Hash::make('password'),
                    'role' => 'instructor',
                    'avatar' => null,
                    'bio' => $data['bio'],
                    'level' => 5,
                    'points' => 1200,
                ]
            );
        })->values();

        // Delete Maria if exists
        User::where('email', 'maria@example.com')->delete();
        
        $students = collect([
            ['email' => 'ion.mejiesvschi@example.com', 'name' => 'Ion Mejiesvschi'],
            ['email' => 'andrei@example.com', 'name' => 'Andrei Student'],
        ])->map(function (array $data) {
            return User::firstOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'password' => Hash::make('password'),
                    'role' => 'student',
                    'avatar' => null,
                    'bio' => 'Pasionat de învățare și tehnologie.',
                    'level' => 2,
                    'points' => 300,
                ]
            );
        })->values();

        // --- Courses & Lessons ---
        $courses = [
            [
                'title' => 'Introducere în PHP',
                'description' => 'Fundamentele PHP pentru a construi primele aplicații web.',
                'teacher' => $teachers[0],
                'reward_points' => 80,
                'lessons' => [
                    ['title' => 'Primul script PHP', 'content' => 'Scrie primul mesaj "Salut lume!" în PHP.'],
                    ['title' => 'Variabile și Tipuri de Date', 'content' => 'Explorăm variabile, array-uri și tipul dynamic al PHP.'],
                    ['title' => 'Controlul Fluxului', 'content' => 'Instrucțiuni if, switch și bucle while/for.'],
                ],
            ],
            [
                'title' => 'Laravel pentru Începători',
                'description' => 'De la instalare la primele rute și controllere.',
                'teacher' => $teachers[1],
                'reward_points' => 120,
                'lessons' => [
                    ['title' => 'Instalare Laravel', 'content' => 'Configurare mediu și instalare folosind Composer.'],
                    ['title' => 'Structura unui Proiect', 'content' => 'Înțelegem folderele esențiale și fluxul MVC.'],
                    ['title' => 'Rute & Controlere', 'content' => 'Construim primele pagini și conectăm controlere.'],
                ],
            ],
            [
                'title' => 'Front-end Modern cu React',
                'description' => 'Construiește interfețe armonioase cu React și hooks.',
                'teacher' => $teachers[0],
                'reward_points' => 150,
                'lessons' => [
                    ['title' => 'Bazele React', 'content' => 'Componentă, JSX și primul render.'],
                    ['title' => 'State & Hooks', 'content' => 'useState, useEffect și organizarea logicii.'],
                    ['title' => 'Routing & API-uri', 'content' => 'Integrarea react-router și fetch de date.'],
                ],
            ],
            [
                'title' => 'Node.js pentru Backend',
                'description' => 'API-uri REST, middleware și conexiuni la baze de date cu Node & Express.',
                'teacher' => $teachers[1],
                'reward_points' => 140,
                'lessons' => [
                    ['title' => 'Setarea mediului Node.js', 'content' => 'Instalăm Node.js și inițializăm un proiect Express.'],
                    ['title' => 'Routing cu Express', 'content' => 'Construim rute REST și middleware-uri personalizate.'],
                    ['title' => 'Persistență de date', 'content' => 'Conectăm aplicația la o bază de date și gestionăm erorile.'],
                ],
            ],
            [
                'title' => 'Design UX & Interfețe',
                'description' => 'Principii vizuale, experiență utilizator și prototipare rapidă.',
                'teacher' => $teachers[2],
                'reward_points' => 90,
                'lessons' => [
                    ['title' => 'Principiile UX', 'content' => 'Analizăm utilizabilitate, accesibilitate și parcursul utilizatorului.'],
                    ['title' => 'Design de Interfață', 'content' => 'Lucrăm cu tipografie, culoare și grile.'],
                    ['title' => 'Prototipare rapidă', 'content' => 'Folosim Figma pentru a testa ideile într-un prototip interactiv.'],
                ],
            ],
            [
                'title' => 'Analiză de Date cu Python',
                'description' => 'Curățare, analiză și vizualizare de dataset-uri cu ecosistemul Python.',
                'teacher' => $teachers[0],
                'reward_points' => 180,
                'lessons' => [
                    ['title' => 'Introducere în Pandas', 'content' => 'Încărcăm și curățăm datele cu DataFrame-uri.'],
                    ['title' => 'Vizualizare de date', 'content' => 'Creăm grafice relevante cu Matplotlib și Seaborn.'],
                    ['title' => 'Analiză statistică', 'content' => 'Aplicăm metode statistice și generăm insight-uri.'],
                ],
            ],
        ];

        foreach ($courses as $courseData) {
            $course = Course::firstOrCreate(
                ['title' => $courseData['title']],
                [
                    'description' => $courseData['description'],
                    'teacher_id' => $courseData['teacher']->id,
                    'reward_points' => $courseData['reward_points'],
                ]
            );

            foreach ($courseData['lessons'] as $index => $lessonData) {
                Lesson::firstOrCreate(
                    ['course_id' => $course->id, 'title' => $lessonData['title']],
                    [
                        'content' => $lessonData['content'],
                        'order' => $index + 1,
                    ]
                );
            }
        }

        // --- Level up some students with bonus points ---
        $students->each(function (User $student, int $index) use ($courses) {
            $student->update([
                'level' => 3 + $index,
                'points' => 400 + ($index * 150),
            ]);
        });
    }
}
