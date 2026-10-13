<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Course;
use App\Models\CourseMap;
use App\Models\CourseTest;
use App\Models\Event;
use App\Models\Lesson;
use App\Models\LibraryItem;
use App\Models\Module;
use App\Models\QuestionBank;
use App\Models\Team;
use App\Models\Test;
use App\Models\User;
use App\Services\CourseBuilderService;
use App\Services\PlanEntitlementService;
use App\Services\TestBuilderService;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Companie demo plină pentru screenshot-uri marketing / sales demos.
 *
 * php artisan demo:seed-company
 * php artisan demo:seed-company --password='Secret123!' --fresh
 */
class SeedDemoCompanyCommand extends Command
{
    protected $signature = 'demo:seed-company
        {--password=formely-demo : Parola pentru toți utilizatorii demo}
        {--slug=formely-demo : Slug company}
        {--fresh : Șterge cursurile/echipele demo existente și le recreează}';

    protected $description = 'Creează compania Formely Demo cu studenți, cursuri, teste, bănci, echipe, library și progres';

    private const COMPANY_NAME = 'Formely';

    private const EMAIL_DOMAIN = 'demo.formely.local';

    public function handle(
        PlanEntitlementService $entitlements,
        CourseBuilderService $courseBuilder,
        TestBuilderService $testBuilder
    ): int {
        $passwordPlain = (string) $this->option('password');
        $password = Hash::make($passwordPlain);
        $slug = Str::slug((string) $this->option('slug'));

        $company = $this->ensureCompany($entitlements, $slug);
        TenantContext::setCompanyId($company->id);

        $this->info("Tenant #{$company->id} {$company->name} ({$company->plan})");

        $staff = $this->ensureStaff($company, $password);
        $students = $this->ensureStudents($company, $password);
        $teams = $this->ensureTeams($company, $staff, $students);

        if ($this->option('fresh')) {
            $this->purgeDemoContent($company);
        }

        $coursesBundle = $this->seedCourses($company, $staff, $courseBuilder, $testBuilder);
        $banks = $this->seedQuestionBanks($staff['owner'], $testBuilder);
        $map = $this->seedCourseMap($company, $staff['owner'], $coursesBundle['courses']);
        $this->seedLibrary($company, $staff['owner']);
        $this->seedEvents($company, $staff);
        $this->attachTeamsToCourses($teams, $coursesBundle['courses']);
        $this->enrollWithVariedProgress($coursesBundle, $students);
        $resultsCount = $this->seedTestResults($coursesBundle, $students);
        $activityCount = $this->seedActivityFeed($company, $staff, $students, $coursesBundle);
        $eventRegs = $this->seedEventRegistrations($company, $students);

        $this->newLine();
        $this->info('✅ Companie demo gata');
        $this->table(
            ['Element', 'Detalii'],
            [
                ['Company', "{$company->name} / {$company->slug} (plan {$company->plan})"],
                ['Owner', "owner@".self::EMAIL_DOMAIN],
                ['Instructori', 'instructor01@…, instructor02@…'],
                ['Staff', 'hr@…, manager@…, analyst@…'],
                ['Cursanți', count($students).' × studentNN@'.self::EMAIL_DOMAIN],
                ['Echipe', collect($teams)->pluck('name')->implode(', ')],
                ['Cursuri', collect($coursesBundle['courses'])->pluck('title')->implode('; ')],
                ['Bănci', collect($banks)->map(fn (QuestionBank $b) => $b->title.' ('.$b->questions()->count().')')->implode('; ')],
                ['Mapă', $map->name],
                ['Rezultate teste', (string) $resultsCount],
                ['Activity logs', (string) $activityCount],
                ['Înscrieri evenimente', (string) $eventRegs],
                ['Parolă', $passwordPlain],
            ]
        );

        $this->comment('Login: https://academy.formely.org  →  owner@'.self::EMAIL_DOMAIN.' / '.$passwordPlain);

        return self::SUCCESS;
    }

    private function ensureCompany(PlanEntitlementService $entitlements, string $slug): Company
    {
        $defaults = $entitlements->defaultsForPlan(Company::PLAN_BUSINESS);

        return Company::updateOrCreate(
            ['slug' => $slug],
            [
                'name' => self::COMPANY_NAME,
                'status' => Company::STATUS_ACTIVE,
                'plan' => Company::PLAN_BUSINESS,
                'max_active_learners' => $defaults['max_active_learners'] ?? 500,
                'max_staff' => $defaults['max_staff'] ?? 50,
                'features' => $defaults['features'] ?? [],
                'primary_color' => '#0f766e',
                'secondary_color' => '#134e4a',
                'trial_ends_at' => null,
                'notes' => 'Companie demo pentru screenshot-uri website + sales demos.',
            ]
        );
    }

    /**
     * @return array{owner: User, instructors: array<int, User>, hr: User, manager: User, analyst: User}
     */
    private function ensureStaff(Company $company, string $password): array
    {
        $owner = $this->upsertUser($company, 'owner@'.self::EMAIL_DOMAIN, [
            'name' => 'Alexandra Popa',
            'role' => UserRoles::ADMIN,
            'password' => $password,
            'points' => 420,
            'level' => 5,
        ]);

        $instructors = [
            $this->upsertUser($company, 'instructor01@'.self::EMAIL_DOMAIN, [
                'name' => 'Mihai Dragomir',
                'role' => UserRoles::INSTRUCTOR,
                'password' => $password,
                'points' => 310,
                'level' => 4,
            ]),
            $this->upsertUser($company, 'instructor02@'.self::EMAIL_DOMAIN, [
                'name' => 'Ioana Marinescu',
                'role' => UserRoles::INSTRUCTOR,
                'password' => $password,
                'points' => 280,
                'level' => 3,
            ]),
        ];

        $hr = $this->upsertUser($company, 'hr@'.self::EMAIL_DOMAIN, [
            'name' => 'Andreea Stoica',
            'role' => UserRoles::ADMIN,
            'password' => $password,
        ]);

        $manager = $this->upsertUser($company, 'manager@'.self::EMAIL_DOMAIN, [
            'name' => 'Radu Enache',
            'role' => UserRoles::ANALYST,
            'password' => $password,
        ]);

        $analyst = $this->upsertUser($company, 'analyst@'.self::EMAIL_DOMAIN, [
            'name' => 'Laura Niculescu',
            'role' => UserRoles::ANALYST,
            'password' => $password,
        ]);

        return compact('owner', 'instructors', 'hr', 'manager', 'analyst');
    }

    /**
     * @return array<int, User>
     */
    private function ensureStudents(Company $company, string $password): array
    {
        $roster = [
            ['Ana Popescu', 'Sales Associate'],
            ['Andrei Ionescu', 'Account Executive'],
            ['Elena Dumitrescu', 'Customer Success'],
            ['Mihai Georgescu', 'Support Specialist'],
            ['Ioana Marin', 'Marketing Specialist'],
            ['Cristian Stan', 'Product Designer'],
            ['Maria Radu', 'Backend Engineer'],
            ['Alexandru Enache', 'Frontend Engineer'],
            ['Diana Vasile', 'QA Engineer'],
            ['Gabriel Moldovan', 'Ops Coordinator'],
            ['Roxana Petrescu', 'Finance Analyst'],
            ['Vlad Constantinescu', 'Sales Lead'],
            ['Simona Dobre', 'HR Generalist'],
            ['Florin Negrea', 'DevOps Engineer'],
            ['Bianca Tudor', 'Content Writer'],
            ['Paul Neagu', 'Business Analyst'],
            ['Carmen Iliescu', 'Onboarding Buddy'],
            ['Stefan Munteanu', 'Warehouse Lead'],
        ];

        $students = [];
        foreach ($roster as $index => [$name, $title]) {
            $num = str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
            $students[] = $this->upsertUser($company, "student{$num}@".self::EMAIL_DOMAIN, [
                'name' => $name,
                'role' => UserRoles::STUDENT,
                'password' => $password,
                'points' => random_int(20, 380),
                'level' => random_int(1, 4),
                'last_login_at' => now()->subDays(random_int(0, 12))->subHours(random_int(0, 20)),
            ]);
        }

        // „Utilizatori noi” pe dashboard (ultimele 14 zile) — date de creare în interval
        foreach ($students as $index => $student) {
            $student->forceFill([
                'created_at' => now()->subDays(random_int(1, 13))->subHours(random_int(0, 20)),
            ])->saveQuietly();
        }

        return $students;
    }

    private function upsertUser(Company $company, string $email, array $attrs): User
    {
        $existing = User::withoutGlobalScopes()->where('email', $email)->first();

        $payload = array_merge([
            'company_id' => $company->id,
            'email' => $email,
            'status' => 'active',
            'must_change_password' => false,
            'email_verified_at' => now(),
            'last_activity_at' => now()->subHours(random_int(1, 48)),
        ], $attrs);

        if ($existing) {
            $existing->fill($payload);
            $existing->save();

            return $existing->fresh();
        }

        return User::withoutGlobalScopes()->create($payload);
    }

    /**
     * @param  array{owner: User, instructors: array<int, User>, hr: User, manager: User, analyst: User}  $staff
     * @param  array<int, User>  $students
     * @return array<int, Team>
     */
    private function ensureTeams(Company $company, array $staff, array $students): array
    {
        $chunks = [
            ['Echipa Sales', 'Pipeline Q3 + playbook', '#0891b2', array_slice($students, 0, 5), $staff['manager']],
            ['Echipa Customer Care', 'CS + Support', '#2563eb', array_slice($students, 5, 5), $staff['hr']],
            ['Echipa Product', 'Design & Engineering', '#7c3aed', array_slice($students, 10, 5), $staff['instructors'][0]],
            ['Echipa Ops', 'Finanțe + logistică', '#ea580c', array_slice($students, 15, 3), $staff['owner']],
        ];

        $teams = [];
        foreach ($chunks as $i => [$name, $desc, $color, $members, $owner]) {
            $team = Team::updateOrCreate(
                ['company_id' => $company->id, 'name' => $name],
                [
                    'description' => $desc,
                    'owner_id' => $owner->id,
                    'sort_order' => $i + 1,
                    'accent_color' => $color,
                ]
            );
            $team->users()->sync(collect($members)->pluck('id')->all());
            $teams[] = $team;
        }

        return $teams;
    }

    private function purgeDemoContent(Company $company): void
    {
        $userIds = User::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->pluck('id');

        if ($userIds->isNotEmpty()) {
            DB::table('test_results')->whereIn('user_id', $userIds)->delete();
            if (Schema::hasTable('activity_logs')) {
                DB::table('activity_logs')->whereIn('user_id', $userIds)->delete();
            }
            if (Schema::hasTable('event_user')) {
                DB::table('event_user')->whereIn('user_id', $userIds)->delete();
            }
        }

        $courseIds = Course::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->pluck('id');

        if ($courseIds->isEmpty()) {
            return;
        }

        $lessonIds = Lesson::whereIn('course_id', $courseIds)->pluck('id');
        if ($lessonIds->isNotEmpty()) {
            DB::table('lesson_progress')->whereIn('lesson_id', $lessonIds)->delete();
            Lesson::whereIn('id', $lessonIds)->delete();
        }

        Module::whereIn('course_id', $courseIds)->delete();
        CourseTest::whereIn('course_id', $courseIds)->delete();
        DB::table('course_user')->whereIn('course_id', $courseIds)->delete();
        DB::table('course_team')->whereIn('course_id', $courseIds)->delete();
        DB::table('course_map_course')->whereIn('course_id', $courseIds)->delete();

        Course::withoutGlobalScopes()->whereIn('id', $courseIds)->delete();

        QuestionBank::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->get()
            ->each(function (QuestionBank $bank) {
                $bank->questions()->delete();
                $bank->delete();
            });

        Test::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->where('title', 'like', 'Formely ·%')
            ->get()
            ->each(function (Test $test) {
                $test->questions()->delete();
                $test->delete();
            });

        LibraryItem::withoutGlobalScopes()->where('company_id', $company->id)->delete();
        Event::withoutGlobalScopes()->where('company_id', $company->id)->delete();
        CourseMap::withoutGlobalScopes()->where('company_id', $company->id)->delete();
    }

    /**
     * @param  array{owner: User, instructors: array<int, User>}  $staff
     * @return array{courses: array<int, Course>, lessonsByCourse: array<int, array<int, Lesson>>}
     */
    private function seedCourses(
        Company $company,
        array $staff,
        CourseBuilderService $courseBuilder,
        TestBuilderService $testBuilder
    ): array {
        $catalog = [
            [
                'title' => 'Onboarding Formely — Primul lună',
                'description' => 'Parcursul de acomodare: cultură, tool-uri, procese și primul deliverable.',
                'level' => 'beginner',
                'color' => '#0f766e',
                'teacher' => $staff['instructors'][0],
                'modules' => [
                    'Bine ai venit la Formely' => ['Cultura noastră', 'Tool-uri zilnice', 'Cum ceri ajutor'],
                    'Rolul tău în echipă' => ['Așteptări & ritm', 'Ritualuri de sync'],
                    'Primul deliverable' => ['Checklist de calitate', 'Feedback loop'],
                ],
            ],
            [
                'title' => 'Compliance & Securitate 2026',
                'description' => 'Politici GDPR, phishing, date sensibile și raportare incidente.',
                'level' => 'intermediate',
                'color' => '#b45309',
                'teacher' => $staff['instructors'][1],
                'modules' => [
                    'Fundamente GDPR' => ['Date personale', 'Consimțământ & retenție'],
                    'Securitate operațională' => ['Parole & MFA', 'Phishing real'],
                    'Raportare' => ['Cum semnalezi un incident'],
                ],
            ],
            [
                'title' => 'Sales Playbook Q3',
                'description' => 'Discovery, demo, objection handling și handoff către CS.',
                'level' => 'intermediate',
                'color' => '#2563eb',
                'teacher' => $staff['instructors'][0],
                'modules' => [
                    'Discovery' => ['Întrebări de calificare', 'ICP & personas'],
                    'Demo & POV' => ['Structura demo-ului', 'Storytelling cu ROI'],
                    'Închidere' => ['Objections', 'Handoff CS'],
                ],
            ],
            [
                'title' => 'Leadership pentru manageri',
                'description' => '1:1, feedback, coaching și ritm de performanță.',
                'level' => 'advanced',
                'color' => '#7c3aed',
                'teacher' => $staff['owner'],
                'modules' => [
                    'Ritmul de leadership' => ['1:1 eficient', 'Agenda săptămânală'],
                    'Feedback & coaching' => ['Model SBI', 'Plan de creștere'],
                ],
            ],
            [
                'title' => 'Customer Success Essentials',
                'description' => 'Onboarding clienți, health score și expansion.',
                'level' => 'beginner',
                'color' => '#db2777',
                'teacher' => $staff['instructors'][1],
                'modules' => [
                    'Onboarding client' => ['Kickoff', 'Time-to-value'],
                    'Retention' => ['Health score', 'QBR & expansion'],
                ],
            ],
        ];

        $courses = [];
        $lessonsByCourse = [];

        foreach ($catalog as $courseIndex => $def) {
            $course = Course::withoutEvents(function () use ($company, $def, $courseIndex) {
                return Course::updateOrCreate(
                    [
                        'company_id' => $company->id,
                        'title' => $def['title'],
                    ],
                    [
                        'description' => $def['description'],
                        'level' => $def['level'],
                        'status' => 'published',
                        'workflow_status' => 'published',
                        'teacher_id' => $def['teacher']->id,
                        'reward_points' => 150 + ($courseIndex * 25),
                        'card_color' => $def['color'],
                        'sequential_unlock' => false,
                        'min_completion_percentage' => 80,
                    ]
                );
            });

            // Rebuild modules/lessons if empty or --fresh already wiped them
            $existingLessons = Lesson::where('course_id', $course->id)->count();
            if ($existingLessons === 0) {
                $allLessons = [];
                $moduleOrder = 0;
                foreach ($def['modules'] as $moduleTitle => $lessonTitles) {
                    $module = Module::withoutEvents(function () use ($courseBuilder, $course, $moduleTitle, $moduleOrder) {
                        return $courseBuilder->createModule($course, [
                            'title' => $moduleTitle,
                            'description' => "Modul: {$moduleTitle}",
                            'order' => $moduleOrder,
                            'status' => 'published',
                        ]);
                    });

                    foreach ($lessonTitles as $lessonOrder => $lessonTitle) {
                        $lesson = Lesson::withoutEvents(function () use ($courseBuilder, $module, $lessonTitle, $lessonOrder, $moduleTitle) {
                            return $courseBuilder->createLesson($module, [
                                'title' => $lessonTitle,
                                'content' => $this->lessonHtml($moduleTitle, $lessonTitle),
                                'type' => 'text',
                                'duration_minutes' => 12 + $lessonOrder * 3,
                                'order' => $lessonOrder,
                                'status' => 'published',
                            ]);
                        });
                        $allLessons[] = $lesson;
                    }

                    $test = $testBuilder->createTest([
                        'title' => "Formely · Test — {$moduleTitle}",
                        'description' => "Evaluare pentru {$moduleTitle}",
                        'status' => 'published',
                        'time_limit_minutes' => 15,
                        'max_attempts' => 3,
                        'passing_score' => 70,
                        'randomize_questions' => true,
                        'randomize_answers' => true,
                        'show_results_immediately' => true,
                        'show_correct_answers' => true,
                        'question_source' => 'direct',
                        'questions' => $this->moduleQuestions($moduleTitle),
                    ], $def['teacher']);

                    CourseTest::create([
                        'course_id' => $course->id,
                        'test_id' => $test->id,
                        'scope' => 'module',
                        'scope_id' => $module->id,
                        'required' => true,
                        'passing_score' => 70,
                        'order' => $moduleOrder + 1,
                    ]);

                    $moduleOrder++;
                }
                $lessonsByCourse[$course->id] = $allLessons;
            } else {
                $lessonsByCourse[$course->id] = Lesson::where('course_id', $course->id)->orderBy('order')->get()->all();
            }

            $courses[] = $course;
        }

        return ['courses' => $courses, 'lessonsByCourse' => $lessonsByCourse];
    }

    /**
     * @return array<int, QuestionBank>
     */
    private function seedQuestionBanks(User $owner, TestBuilderService $testBuilder): array
    {
        $defs = [
            ['Banca Compliance Formely', 'Întrebări GDPR & securitate', 'compliance'],
            ['Banca Sales Discovery', 'Calificare și demo', 'sales'],
            ['Banca Leadership', '1:1, feedback, coaching', 'leadership'],
        ];

        $banks = [];
        foreach ($defs as $i => [$title, $desc, $topic]) {
            $existing = QuestionBank::where('title', $title)->first();
            if ($existing && ! $this->option('fresh')) {
                $banks[] = $existing;
                continue;
            }

            if ($existing) {
                $existing->questions()->delete();
                $existing->delete();
            }

            $banks[] = $testBuilder->createQuestionBank([
                'title' => $title,
                'description' => $desc,
                'status' => 'published',
                'questions' => $this->bankQuestions($topic, 14 + $i),
            ], $owner);
        }

        return $banks;
    }

    /**
     * @param  array<int, Course>  $courses
     */
    private function seedCourseMap(Company $company, User $owner, array $courses): CourseMap
    {
        $map = CourseMap::updateOrCreate(
            ['company_id' => $company->id, 'name' => 'Parcursul Formely 2026'],
            [
                'description' => 'Harta oficială de învățare — onboarding, compliance, sales și leadership.',
                'visibility' => 'public',
                'created_by' => $owner->id,
                'order' => 1,
                'accent_color' => '#0f766e',
                'header_bg_color' => '#042f2e',
                'header_text_color' => '#ecfdf5',
            ]
        );

        $sync = [];
        foreach ($courses as $i => $course) {
            $sync[$course->id] = ['order' => $i];
        }
        $map->courses()->sync($sync);

        return $map;
    }

    private function seedLibrary(Company $company, User $owner): void
    {
        $items = [
            [
                'title' => 'Ghidul angajatului Formely',
                'description' => 'Politici, beneficii și ritualuri de echipă.',
                'body' => '<h2>Bine ai venit</h2><p>Acest ghid acoperă beneficiile, zilele libere și canalul #help.</p><div data-callout-box="info"><p>Actualizat pentru 2026.</p></div>',
            ],
            [
                'title' => 'Playbook Discovery Calls',
                'description' => 'Script + checklist pentru primul call.',
                'body' => '<h2>Structură 30 min</h2><ol><li>Context</li><li>Probleme</li><li>Impact</li><li>Next steps</li></ol>',
            ],
            [
                'title' => 'Checklist securitate laptop',
                'description' => 'Pașii obligatorii înainte de first day.',
                'body' => '<ul><li>FileVault / BitLocker</li><li>MFA pe email</li><li>VPN configurat</li></ul>',
            ],
            [
                'title' => 'Template QBR Customer Success',
                'description' => 'Slide outline pentru QBR lunar.',
                'body' => '<p>Health score, adoption, riscuri, oportunități de expansion.</p>',
            ],
        ];

        foreach ($items as $item) {
            LibraryItem::updateOrCreate(
                [
                    'company_id' => $company->id,
                    'title' => $item['title'],
                ],
                [
                    'user_id' => $owner->id,
                    'description' => $item['description'],
                    'content_type' => 'text',
                    'body' => $item['body'],
                ]
            );
        }
    }

    /**
     * @param  array{owner: User, instructors: array<int, User>}  $staff
     */
    private function seedEvents(Company $company, array $staff): void
    {
        $defs = [
            [
                'title' => 'Kickoff Onboarding — Septembrie',
                'type' => 'live_online',
                'status' => 'upcoming',
                'start' => now()->addDays(5)->setTime(10, 0)->format('Y-m-d H:i:s'),
                'end' => now()->addDays(5)->setTime(11, 0)->format('Y-m-d H:i:s'),
                'instructor' => $staff['instructors'][0],
            ],
            [
                'title' => 'Workshop Objection Handling',
                'type' => 'workshop',
                'status' => 'upcoming',
                'start' => now()->addDays(12)->setTime(14, 0)->format('Y-m-d H:i:s'),
                'end' => now()->addDays(12)->setTime(16, 0)->format('Y-m-d H:i:s'),
                'instructor' => $staff['instructors'][0],
            ],
            [
                'title' => 'Webinar Compliance Refresh',
                'type' => 'webinar',
                'status' => 'published',
                'start' => now()->subDays(3)->setTime(11, 0)->format('Y-m-d H:i:s'),
                'end' => now()->subDays(3)->setTime(12, 0)->format('Y-m-d H:i:s'),
                'instructor' => $staff['instructors'][1],
            ],
        ];

        foreach ($defs as $def) {
            Event::updateOrCreate(
                [
                    'company_id' => $company->id,
                    'title' => $def['title'],
                ],
                [
                    'description' => $def['title'].' — eveniment demo Formely.',
                    'short_description' => 'Sesiune live pentru echipa Formely.',
                    'type' => $def['type'],
                    'status' => $def['status'],
                    'start_date' => $def['start'],
                    'end_date' => $def['end'],
                    'timezone' => 'Europe/Bucharest',
                    'live_link' => 'https://meet.formely.local/demo',
                    'max_capacity' => 40,
                    'instructor_id' => $def['instructor']->id,
                    'access_type' => 'free',
                    'audience_type' => 'all',
                    'registrations_count' => random_int(8, 28),
                    'attendance_count' => random_int(5, 20),
                ]
            );
        }
    }

    /**
     * @param  array<int, Team>  $teams
     * @param  array<int, Course>  $courses
     */
    private function attachTeamsToCourses(array $teams, array $courses): void
    {
        // Sales → Sales Playbook + Onboarding
        $teams[0]->courses()->syncWithoutDetaching([$courses[0]->id, $courses[2]->id]);
        // Customer Care → CS + Compliance + Onboarding
        $teams[1]->courses()->syncWithoutDetaching([$courses[0]->id, $courses[1]->id, $courses[4]->id]);
        // Product → Onboarding + Leadership
        $teams[2]->courses()->syncWithoutDetaching([$courses[0]->id, $courses[3]->id]);
        // Ops → Compliance + Onboarding
        $teams[3]->courses()->syncWithoutDetaching([$courses[0]->id, $courses[1]->id]);
    }

    /**
     * @param  array{courses: array<int, Course>, lessonsByCourse: array<int, array<int, Lesson>>}  $bundle
     * @param  array<int, User>  $students
     */
    private function enrollWithVariedProgress(array $bundle, array $students): void
    {
        $now = now();
        $courses = $bundle['courses'];

        foreach ($students as $index => $student) {
            // Fiecare student pe 2–4 cursuri, progres variat pentru analytics/UI
            $assigned = match (true) {
                $index < 4 => [$courses[0], $courses[2], $courses[1]],
                $index < 8 => [$courses[0], $courses[4], $courses[1]],
                $index < 12 => [$courses[0], $courses[3]],
                $index < 15 => [$courses[0], $courses[1], $courses[2], $courses[4]],
                default => [$courses[0], $courses[1]],
            };

            $progressTier = $index % 5; // 0 empty → 4 almost done

            foreach ($assigned as $course) {
                $lessons = $bundle['lessonsByCourse'][$course->id] ?? [];
                $lessonCount = count($lessons);
                if ($lessonCount === 0) {
                    continue;
                }

                $completeCount = match ($progressTier) {
                    0 => 0,
                    1 => max(1, (int) floor($lessonCount * 0.25)),
                    2 => (int) floor($lessonCount * 0.5),
                    3 => (int) floor($lessonCount * 0.75),
                    default => $lessonCount,
                };

                $pct = (int) round(($completeCount / $lessonCount) * 100);
                $started = $completeCount > 0;
                $completed = $completeCount === $lessonCount;

                DB::table('course_user')->updateOrInsert(
                    ['course_id' => $course->id, 'user_id' => $student->id],
                    [
                        'enrolled' => true,
                        'enrolled_at' => $now->copy()->subDays(14 - ($index % 10)),
                        'started_at' => $started ? $now->copy()->subDays(10 - ($index % 7)) : null,
                        'completed_at' => $completed ? $now->copy()->subDays($index % 4) : null,
                        'progress_percentage' => $pct,
                        'is_mandatory' => $course->title === 'Compliance & Securitate 2026',
                        'assigned_at' => $now->copy()->subDays(14),
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]
                );

                foreach ($lessons as $lessonIndex => $lesson) {
                    $done = $lessonIndex < $completeCount;
                    if (! $done && $progressTier === 0) {
                        continue;
                    }

                    DB::table('lesson_progress')->updateOrInsert(
                        ['lesson_id' => $lesson->id, 'user_id' => $student->id],
                        [
                            'completed' => $done,
                            'time_spent_seconds' => $done ? random_int(480, 1400) : random_int(60, 300),
                            'progress_percentage' => $done ? 100 : random_int(10, 40),
                            'started_at' => $now->copy()->subDays(9 - min(8, $lessonIndex)),
                            'completed_at' => $done ? $now->copy()->subDays(max(0, 8 - $lessonIndex)) : null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]
                    );
                }
            }
        }
    }

    /**
     * Umple panourile de statistici / progres cu rezultate de teste (passed / failed / review).
     *
     * @param  array{courses: array<int, Course>, lessonsByCourse: array<int, array<int, Lesson>>}  $bundle
     * @param  array<int, User>  $students
     */
    private function seedTestResults(array $bundle, array $students): int
    {
        $now = now();
        $created = 0;
        $studentIds = collect($students)->pluck('id')->all();
        if ($studentIds !== []) {
            DB::table('test_results')->whereIn('user_id', $studentIds)->delete();
        }

        foreach ($students as $index => $student) {
            $progressTier = $index % 5;
            if ($progressTier === 0) {
                continue; // abia înscriși — fără rezultate încă
            }

            $enrolledCourseIds = DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('enrolled', true)
                ->pluck('course_id');

            foreach ($enrolledCourseIds as $courseId) {
                $courseTests = CourseTest::where('course_id', $courseId)->orderBy('order')->get();
                if ($courseTests->isEmpty()) {
                    continue;
                }

                // Câți teste din curs au rezultat, după progres
                $take = match ($progressTier) {
                    1 => max(1, (int) ceil($courseTests->count() * 0.35)),
                    2 => max(1, (int) ceil($courseTests->count() * 0.6)),
                    3 => max(1, (int) ceil($courseTests->count() * 0.85)),
                    default => $courseTests->count(),
                };

                foreach ($courseTests->take($take) as $ctIndex => $courseTest) {
                    $test = Test::withoutGlobalScopes()->find($courseTest->test_id);
                    if (! $test) {
                        continue;
                    }

                    $questionCount = max(4, (int) $test->questions()->count());
                    $maxScore = $questionCount * 10;
                    $passing = (int) ($courseTest->passing_score ?: $test->passing_score ?: 70);

                    // Primul attempt: uneori picat, al doilea: trecut
                    $failFirst = $progressTier <= 2 && ($index + $ctIndex) % 3 === 0;
                    $attempts = $failFirst ? 2 : 1;

                    for ($attempt = 1; $attempt <= $attempts; $attempt++) {
                        $isRetry = $attempt > 1;
                        $needsReview = ! $isRetry && $progressTier >= 3 && ($index + $ctIndex) % 7 === 0;

                        if ($failFirst && ! $isRetry) {
                            $pct = random_int(42, max(43, $passing - 8));
                            $passed = false;
                        } elseif ($needsReview) {
                            $pct = random_int(68, 92);
                            $passed = $pct >= $passing;
                        } else {
                            $pct = match ($progressTier) {
                                1 => random_int(max(50, $passing - 5), 82),
                                2 => random_int($passing, 88),
                                3 => random_int($passing + 2, 94),
                                default => random_int(78, 98),
                            };
                            $passed = $pct >= $passing;
                        }

                        $score = (int) round(($pct / 100) * $maxScore);
                        $correct = (int) round(($pct / 100) * $questionCount);
                        $completedAt = $now->copy()
                            ->subDays(max(0, 12 - ($index % 10) - $ctIndex))
                            ->subHours(random_int(1, 20))
                            ->addMinutes($attempt * 15);

                        $payload = [
                            'score' => $score,
                            'max_score' => $maxScore,
                            'correct_answers_count' => $correct,
                            'total_questions' => $questionCount,
                            'percentage' => $pct,
                            'passed' => $passed,
                            'time_taken_minutes' => random_int(6, 18),
                            'answers' => json_encode([]),
                            'started_at' => $completedAt->copy()->subMinutes(random_int(8, 22)),
                            'completed_at' => $completedAt,
                            'reviewed_at' => $needsReview ? null : $completedAt,
                            'status' => 'completed',
                            'needs_manual_review' => $needsReview,
                            'passing_score_applied' => $passing,
                            'attempt_token' => (string) Str::uuid(),
                            'attempt_scope' => $student->id.':'.$test->id.':'.$courseId.':done:'.$attempt,
                            'updated_at' => $now,
                        ];

                        $existing = DB::table('test_results')
                            ->where('user_id', $student->id)
                            ->where('test_id', $test->id)
                            ->where('course_id', $courseId)
                            ->where('attempt_number', $attempt)
                            ->first();

                        if ($existing) {
                            DB::table('test_results')->where('id', $existing->id)->update($payload);
                        } else {
                            DB::table('test_results')->insert(array_merge($payload, [
                                'user_id' => $student->id,
                                'test_id' => $test->id,
                                'course_id' => $courseId,
                                'attempt_number' => $attempt,
                                'created_at' => $completedAt,
                            ]));
                            $created++;
                        }
                    }
                }
            }
        }

        return $created;
    }

    /**
     * @param  array{owner: User, instructors: array<int, User>, hr: User, manager: User, analyst: User}  $staff
     * @param  array<int, User>  $students
     * @param  array{courses: array<int, Course>, lessonsByCourse: array<int, array<int, Lesson>>}  $bundle
     */
    private function seedActivityFeed(Company $company, array $staff, array $students, array $bundle): int
    {
        if (! Schema::hasTable('activity_logs')) {
            return 0;
        }

        $now = now();
        $userIds = collect($students)->pluck('id')->merge([
            $staff['owner']->id,
            $staff['instructors'][0]->id,
            $staff['instructors'][1]->id,
            $staff['hr']->id,
        ])->all();

        // Re-seed feed: șterge doar logurile demo anterioare (description marker)
        DB::table('activity_logs')
            ->whereIn('user_id', $userIds)
            ->where('description', 'like', '%[demo]%')
            ->delete();

        $rows = [];
        $push = function (array $row) use (&$rows, $now) {
            $rows[] = array_merge([
                'model_type' => null,
                'model_id' => null,
                'old_values' => null,
                'new_values' => null,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'FormelyDemoSeed/1.0',
                'created_at' => $now,
                'updated_at' => $now,
            ], $row);
        };

        foreach ($students as $index => $student) {
            for ($d = 0; $d < 10; $d++) {
                if (($index + $d) % 3 === 0) {
                    continue;
                }
                $hour = [9, 10, 11, 12, 14, 15, 16, 17, 18][($index + $d) % 9];
                $at = $now->copy()->subDays($d)->setTime($hour, random_int(0, 59));
                $push([
                    'user_id' => $student->id,
                    'action' => 'logged_in',
                    'model_type' => 'User',
                    'model_id' => $student->id,
                    'description' => "[demo] {$student->name} s-a autentificat",
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
                // Dashboard „Popularitate pe ore” citește session_started
                $push([
                    'user_id' => $student->id,
                    'action' => 'session_started',
                    'model_type' => 'User',
                    'model_id' => $student->id,
                    'description' => "[demo] {$student->name} a deschis o sesiune",
                    'new_values' => json_encode(['session_ref' => 'demo:'.$student->id.':'.$d, 'source' => 'demo-seed']),
                    'created_at' => $at->copy()->addMinute(),
                    'updated_at' => $at,
                ]);
                $push([
                    'user_id' => $student->id,
                    'action' => 'telemetry.learner_focus_seconds',
                    'description' => '[demo] Focus pe lecție',
                    'new_values' => json_encode(['seconds' => random_int(120, 2400), 'day' => $at->toDateString()]),
                    'created_at' => $at->copy()->addMinutes(random_int(5, 90)),
                    'updated_at' => $at,
                ]);
            }

            $progress = DB::table('lesson_progress')
                ->where('user_id', $student->id)
                ->where('completed', true)
                ->orderByDesc('completed_at')
                ->limit(6)
                ->get();

            foreach ($progress as $lp) {
                $at = $lp->completed_at ? \Carbon\Carbon::parse($lp->completed_at) : $now->copy()->subDays(random_int(1, 10));
                $push([
                    'user_id' => $student->id,
                    'action' => 'completed_lesson',
                    'model_type' => 'Lesson',
                    'model_id' => $lp->lesson_id,
                    'description' => "[demo] {$student->name} a terminat o lecție",
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
            }

            $results = DB::table('test_results')
                ->where('user_id', $student->id)
                ->where('status', 'completed')
                ->orderByDesc('completed_at')
                ->limit(8)
                ->get();

            foreach ($results as $tr) {
                $at = $tr->completed_at ? \Carbon\Carbon::parse($tr->completed_at) : $now;
                $push([
                    'user_id' => $student->id,
                    'action' => 'telemetry.learner_attempt_submitted',
                    'model_type' => 'Test',
                    'model_id' => $tr->test_id,
                    'description' => "[demo] {$student->name} a trimis un test ({$tr->percentage}%)",
                    'new_values' => json_encode([
                        'percentage' => $tr->percentage,
                        'passed' => (bool) $tr->passed,
                        'course_id' => $tr->course_id,
                    ]),
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
                if ($tr->passed) {
                    $push([
                        'user_id' => $student->id,
                        'action' => 'completed_exam',
                        'model_type' => 'Test',
                        'model_id' => $tr->test_id,
                        'description' => "[demo] {$student->name} a trecut un test",
                        'created_at' => $at->copy()->addMinute(),
                        'updated_at' => $at,
                    ]);
                }
            }

            foreach (DB::table('course_user')->where('user_id', $student->id)->whereNotNull('completed_at')->get() as $cu) {
                $at = \Carbon\Carbon::parse($cu->completed_at);
                $push([
                    'user_id' => $student->id,
                    'action' => 'completed_course',
                    'model_type' => 'Course',
                    'model_id' => $cu->course_id,
                    'description' => "[demo] {$student->name} a finalizat un curs",
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
            }
        }

        // Admin / instructor telemetry — dashboard „activitate recentă”
        foreach ([$staff['owner'], $staff['instructors'][0], $staff['hr']] as $adminUser) {
            foreach (range(0, 8) as $d) {
                $at = $now->copy()->subDays($d)->setTime(random_int(9, 17), random_int(0, 59));
                $push([
                    'user_id' => $adminUser->id,
                    'action' => 'logged_in',
                    'model_type' => 'User',
                    'model_id' => $adminUser->id,
                    'description' => "[demo] {$adminUser->name} s-a autentificat",
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
            }
        }

        foreach ($bundle['courses'] as $i => $course) {
            $at = $now->copy()->subDays(20 - $i)->setTime(10, 0);
            $push([
                'user_id' => $staff['instructors'][$i % 2]->id,
                'action' => 'telemetry.admin_course_created',
                'model_type' => 'Course',
                'model_id' => $course->id,
                'description' => "[demo] Curs creat: {$course->title}",
                'created_at' => $at,
                'updated_at' => $at,
            ]);
            $push([
                'user_id' => $staff['owner']->id,
                'action' => 'telemetry.admin_course_version_published',
                'model_type' => 'Course',
                'model_id' => $course->id,
                'description' => "[demo] Curs publicat: {$course->title}",
                'created_at' => $at->copy()->addHours(2),
                'updated_at' => $at,
            ]);
        }

        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('activity_logs')->insert($chunk);
        }

        return count($rows);
    }

    /**
     * @param  array<int, User>  $students
     */
    private function seedEventRegistrations(Company $company, array $students): int
    {
        if (! Schema::hasTable('event_user')) {
            return 0;
        }

        $events = Event::withoutGlobalScopes()->where('company_id', $company->id)->get();
        if ($events->isEmpty()) {
            return 0;
        }

        $count = 0;
        $now = now();
        foreach ($events as $eIndex => $event) {
            $slice = array_slice($students, $eIndex * 3, 8 + $eIndex);
            foreach ($slice as $sIndex => $student) {
                $attended = $event->status === 'published' || ($sIndex % 3 !== 0);
                DB::table('event_user')->updateOrInsert(
                    ['event_id' => $event->id, 'user_id' => $student->id],
                    [
                        'registered' => true,
                        'attended' => $attended,
                        'watched_replay' => ! $attended && ($sIndex % 2 === 0),
                        'registered_at' => $now->copy()->subDays(random_int(2, 14)),
                        'attended_at' => $attended ? $now->copy()->subDays(random_int(0, 5)) : null,
                        'replay_watched_at' => null,
                        'notes' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]
                );
                $count++;
            }
            if (method_exists($event, 'updateKPIs')) {
                $event->updateKPIs();
            } else {
                $event->forceFill([
                    'registrations_count' => DB::table('event_user')->where('event_id', $event->id)->where('registered', true)->count(),
                    'attendance_count' => DB::table('event_user')->where('event_id', $event->id)->where('attended', true)->count(),
                ])->save();
            }
        }

        return $count;
    }

    private function lessonHtml(string $moduleTitle, string $lessonTitle): string
    {
        return <<<HTML
<h2>{$lessonTitle}</h2>
<p>Material din modulul <strong>{$moduleTitle}</strong> — conținut demonstrativ Formely pentru screenshot-uri și demouri.</p>
<div data-callout-box="tip"><p><strong>Tip:</strong> Notează 2 acțiuni pe care le aplici săptămâna asta.</p></div>
<ul>
  <li>Obiectivul lecției în contextul rolului tău</li>
  <li>Exemplu din practica Formely</li>
  <li>Checkpoint înainte de testul de modul</li>
</ul>
<div data-callout-box="info"><p>După ce termini lecția, marchează progresul — analytics-ul se actualizează automat.</p></div>
HTML;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function moduleQuestions(string $moduleTitle): array
    {
        return collect(range(1, 4))->map(function (int $n) use ($moduleTitle) {
            return [
                'type' => 'multiple_choice',
                'content' => "[{$moduleTitle}] Întrebarea {$n}: care afirmație este corectă?",
                'points' => 10,
                'order' => $n - 1,
                'answers' => [
                    ['text' => "Răspuns corect #{$n}", 'is_correct' => true],
                    ['text' => 'Variantă greșită A', 'is_correct' => false],
                    ['text' => 'Variantă greșită B', 'is_correct' => false],
                    ['text' => 'Variantă greșită C', 'is_correct' => false],
                ],
                'explanation' => 'Răspunsul marcat este cel corect pentru modulul demo.',
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function bankQuestions(string $topic, int $count): array
    {
        $labels = [
            'compliance' => ['GDPR', 'phishing', 'MFA', 'retenție date', 'incident'],
            'sales' => ['ICP', 'discovery', 'demo', 'objection', 'ROI'],
            'leadership' => ['1:1', 'SBI', 'coaching', 'delegare', 'ritm'],
        ][$topic] ?? ['LMS', 'progres', 'echipă'];

        return collect(range(1, $count))->map(function (int $n) use ($labels, $topic) {
            $term = $labels[($n - 1) % count($labels)];

            return [
                'type' => $n % 5 === 0 ? 'true_false' : 'multiple_choice',
                'content' => "[Bank {$topic}] #{$n}: Ce este esențial despre {$term}?",
                'points' => $n % 5 === 0 ? 5 : 10,
                'order' => $n - 1,
                'answers' => $n % 5 === 0
                    ? [
                        ['text' => 'Adevărat', 'is_correct' => true],
                        ['text' => 'Fals', 'is_correct' => false],
                    ]
                    : [
                        ['text' => "Definiție corectă: {$term}", 'is_correct' => true],
                        ['text' => 'Afirmație greșită 1', 'is_correct' => false],
                        ['text' => 'Afirmație greșită 2', 'is_correct' => false],
                        ['text' => 'Afirmație greșită 3', 'is_correct' => false],
                    ],
            ];
        })->all();
    }
}
