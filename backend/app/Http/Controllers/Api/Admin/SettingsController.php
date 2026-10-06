<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Setting;
use App\Models\User;
use App\Models\Course;
use App\Models\Team;
use App\Models\Event;
use App\Models\Exam;
use App\Models\Test;
use App\Models\ActivityLog;
use App\Models\Module;
use App\Models\Lesson;
use App\Models\ContentBlock;
use App\Models\Question;
use App\Models\CourseTest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class SettingsController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot accesa setările.');
        }
    }

    /**
     * Get all settings
     */
    public function index()
    {
        if ($company = $this->tenantCompany()) {
            return response()->json($this->tenantSettings($company));
        }

        $settings = Setting::all()->mapWithKeys(function ($setting) {
            return [$setting->key => [
                'value' => $this->castValue($setting->value, $setting->type),
                'type' => $setting->type,
                'description' => $setting->description,
            ]];
        });

        return response()->json($settings);
    }

    /**
     * Update settings
     */
    public function update(Request $request)
    {
        if ($company = $this->tenantCompany()) {
            return $this->updateTenantSettings($request, $company);
        }

        $validator = Validator::make($request->all(), [
            'default_currency' => 'nullable|in:MDL,RON,USD,EUR',
            'maintenance_mode' => 'nullable|boolean',
            'registration_enabled' => 'nullable|boolean',
            'email_notifications' => 'nullable|boolean',
            'backup_enabled' => 'nullable|boolean',
            'backup_frequency' => 'nullable|in:daily,weekly,monthly',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Date invalide',
                'errors' => $validator->errors(),
            ], 422);
        }

        $updated = [];

        if ($request->has('default_currency')) {
            Setting::set('default_currency', $request->default_currency, 'string', 'Valuta implicită pentru prețuri');
            $updated['default_currency'] = $request->default_currency;
        }

        if ($request->has('maintenance_mode')) {
            Setting::set('maintenance_mode', $request->maintenance_mode ? '1' : '0', 'boolean', 'Mod mentenanță activat');
            $updated['maintenance_mode'] = $request->maintenance_mode;
        }

        if ($request->has('registration_enabled')) {
            Setting::set('registration_enabled', $request->registration_enabled ? '1' : '0', 'boolean', 'Înregistrări active');
            $updated['registration_enabled'] = $request->registration_enabled;
        }

        if ($request->has('email_notifications')) {
            Setting::set('email_notifications', $request->email_notifications ? '1' : '0', 'boolean', 'Notificări email active');
            $updated['email_notifications'] = $request->email_notifications;
        }

        if ($request->has('backup_enabled')) {
            Setting::set('backup_enabled', $request->backup_enabled ? '1' : '0', 'boolean', 'Backup automat activat');
            $updated['backup_enabled'] = $request->backup_enabled;
        }

        if ($request->has('backup_frequency')) {
            Setting::set('backup_frequency', $request->backup_frequency, 'string', 'Frecvență backup');
            $updated['backup_frequency'] = $request->backup_frequency;
        }

        return response()->json([
            'message' => 'Setările au fost actualizate',
            'updated' => $updated,
        ]);
    }

    /**
     * Export all data
     */
    public function export()
    {
        $data = [
            'format_version' => 2,
            'backup_complete' => false,
            'backup_scope' => 'partial_settings_export',
            'missing' => [
                'storage_files',
                'media_binaries',
                'full_test_results',
                'message_threads',
            ],
            'warning' => 'Acest export nu este un backup LMS complet. Pentru recuperare folosiți dump-ul bazei de date și copia storage.',
            'export_date' => now()->toISOString(),
            'users' => User::with(['teams', 'courses'])->get(),
            'courses' => Course::with(['modules.lessons.contentBlocks', 'lessons.contentBlocks', 'teacher', 'courseTests.test.questions'])->get(),
            'teams' => Team::with(['users', 'courses', 'owner'])->get(),
            'events' => Event::with(['instructor'])->get(),
            'exams' => Exam::with(['course', 'questions.answers'])->get(),
            'tests' => Test::with(['questions'])->get(),
            'activity_logs' => ActivityLog::with(['user'])->latest()->limit(1000)->get(),
            'settings' => ($company = $this->tenantCompany()) ? $this->tenantSettings($company) : Setting::all(),
        ];

        return response()->json($data);
    }

    /**
     * Clear application cache
     */
    public function clearCache()
    {
        try {
            \Illuminate\Support\Facades\Artisan::call('cache:clear');
            \Illuminate\Support\Facades\Artisan::call('config:clear');
            \Illuminate\Support\Facades\Artisan::call('route:clear');
            \Illuminate\Support\Facades\Artisan::call('view:clear');

            return response()->json([
                'message' => 'Cache-ul a fost șters cu succes',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Eroare la ștergerea cache-ului.' . (config('app.debug') ? ' ' . $e->getMessage() : ''),
            ], 500);
        }
    }

    /**
     * Import/restore backup
     */
    public function importBackup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'backup_file' => 'required|file|mimes:json|max:10240', // Max 10MB
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Fișier invalid',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $file = $request->file('backup_file');
            $content = file_get_contents($file->getRealPath());
            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'message' => 'Fișierul JSON este invalid: ' . json_last_error_msg(),
                ], 422);
            }

            if (!isset($data['export_date'])) {
                return response()->json([
                    'message' => 'Fișierul nu pare să fie un backup valid',
                ], 422);
            }

            DB::beginTransaction();
            \Illuminate\Database\Eloquent\Model::unguard();

            // Import settings
            if (isset($data['settings']) && is_array($data['settings'])) {
                foreach ($data['settings'] as $setting) {
                    if (isset($setting['key']) && isset($setting['value'])) {
                        Setting::updateOrCreate(
                            ['key' => $setting['key']],
                            [
                                'value' => $setting['value'],
                                'type' => $setting['type'] ?? 'string',
                                'description' => $setting['description'] ?? null,
                            ]
                        );
                    }
                }
            }

            if (isset($data['users']) && is_array($data['users'])) {
                foreach ($data['users'] as $userData) {
                    if (! isset($userData['email'])) {
                        continue;
                    }
                    $attrs = $this->scalarAttributes($userData, ['password', 'remember_token']);
                    $attrs['email'] = $userData['email'];
                    $user = User::firstOrNew(['email' => $userData['email']]);
                    $user->fill($attrs);
                    if (! $user->exists) {
                        // Exportul nu conține parole: contul restaurat primește una aleatorie și trebuie schimbată.
                        $user->password = \Illuminate\Support\Facades\Hash::make(\Illuminate\Support\Str::random(40));
                        $user->must_change_password = true;
                    }
                    $user->save();
                }
            }

            if (isset($data['courses']) && is_array($data['courses'])) {
                foreach ($data['courses'] as $courseData) {
                    if (! isset($courseData['id'])) {
                        continue;
                    }
                    $modules = $courseData['modules'] ?? [];
                    $rootLessons = $courseData['lessons'] ?? [];
                    $course = $this->persistById(Course::class, $courseData['id'], $this->scalarAttributes($courseData));

                    foreach ($modules as $moduleData) {
                        if (! is_array($moduleData) || ! isset($moduleData['id'])) {
                            continue;
                        }
                        $lessons = $moduleData['lessons'] ?? [];
                        $module = $this->persistById(
                            Module::class,
                            $moduleData['id'],
                            array_merge($this->scalarAttributes($moduleData), ['course_id' => $course->id])
                        );
                        foreach ($lessons as $lessonData) {
                            if (is_array($lessonData) && isset($lessonData['id'])) {
                                $this->importLessonRecord($lessonData, $course->id, $module->id);
                            }
                        }
                    }

                    foreach ($rootLessons as $lessonData) {
                        if (! is_array($lessonData) || ! isset($lessonData['id'])) {
                            continue;
                        }
                        if (! empty($lessonData['module_id'])) {
                            continue;
                        }
                        $this->importLessonRecord($lessonData, $course->id, null);
                    }

                    $courseTests = $courseData['course_tests'] ?? $courseData['courseTests'] ?? [];
                    foreach ($courseTests as $link) {
                        if (! is_array($link) || ! isset($link['id'])) {
                            continue;
                        }
                        $this->persistById(
                            CourseTest::class,
                            $link['id'],
                            array_merge($this->scalarAttributes($link), [
                                'course_id' => $course->id,
                            ])
                        );
                    }
                }
            }

            // Import teams
            if (isset($data['teams']) && is_array($data['teams'])) {
                foreach ($data['teams'] as $teamData) {
                    if (isset($teamData['id'])) {
                        $users = $teamData['users'] ?? [];
                        $courses = $teamData['courses'] ?? [];
                        unset($teamData['users'], $teamData['courses']);
                        
                        $team = $this->persistById(Team::class, $teamData['id'], $this->scalarAttributes($teamData));

                        // Attach users
                        if (!empty($users)) {
                            $userIds = collect($users)->pluck('id')->filter()->toArray();
                            if (!empty($userIds)) {
                                $team->users()->sync($userIds);
                            }
                        }

                        // Attach courses
                        if (!empty($courses)) {
                            $courseIds = collect($courses)->pluck('id')->filter()->toArray();
                            if (!empty($courseIds)) {
                                $team->courses()->sync($courseIds);
                            }
                        }
                    }
                }
            }

            if (isset($data['tests']) && is_array($data['tests'])) {
                foreach ($data['tests'] as $testData) {
                    if (! is_array($testData) || ! isset($testData['id'])) {
                        continue;
                    }
                    $questions = $testData['questions'] ?? [];
                    $attrs = $this->scalarAttributes($testData);
                    if (empty($attrs['created_by'])) {
                        $attrs['created_by'] = auth()->id();
                    }
                    $this->persistById(Test::class, $testData['id'], $attrs);
                    foreach ($questions as $questionData) {
                        if (! is_array($questionData) || ! isset($questionData['id'])) {
                            continue;
                        }
                        $this->persistById(
                            Question::class,
                            $questionData['id'],
                            array_merge($this->scalarAttributes($questionData), [
                                'test_id' => $testData['id'],
                            ])
                        );
                    }
                }
            }

            if (isset($data['events']) && is_array($data['events'])) {
                foreach ($data['events'] as $eventData) {
                    if (! is_array($eventData) || ! isset($eventData['id'])) {
                        continue;
                    }
                    $this->persistById(Event::class, $eventData['id'], $this->scalarAttributes($eventData));
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'Backup-ul a fost importat cu succes',
                'imported_date' => $data['export_date'],
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Eroare la importarea backup-ului.' . (config('app.debug') ? ' ' . $e->getMessage() : ''),
            ], 500);
        } finally {
            // Și la erori neprevăzute (TypeError etc.): protecția mass-assignment revine pentru restul procesului.
            \Illuminate\Database\Eloquent\Model::reguard();
        }
    }

    private function importLessonRecord(array $lessonData, int $courseId, ?int $moduleId): void
    {
        $blocks = $lessonData['content_blocks'] ?? $lessonData['contentBlocks'] ?? [];
        $lesson = $this->persistById(
            Lesson::class,
            $lessonData['id'],
            array_merge($this->scalarAttributes($lessonData), [
                'course_id' => $courseId,
                'module_id' => $moduleId,
            ])
        );

        foreach ($blocks as $blockData) {
            if (! is_array($blockData) || ! isset($blockData['id'])) {
                continue;
            }
            $this->persistById(
                ContentBlock::class,
                $blockData['id'],
                array_merge($this->scalarAttributes($blockData), [
                    'lesson_id' => $lesson->id,
                ])
            );
        }
    }

    private function persistById(string $class, $id, array $attrs)
    {
        $attrs['id'] = $id;

        return $class::updateOrCreate(['id' => $id], $attrs);
    }

    private function scalarAttributes(array $row, array $deny = []): array
    {
        unset($row['id']);
        foreach ($row as $key => $value) {
            if (is_array($value) || is_object($value)) {
                unset($row[$key]);
            }
        }
        foreach ($deny as $key) {
            unset($row[$key]);
        }

        return $row;
    }

    private function castValue($value, $type)
    {
        switch ($type) {
            case 'integer':
            case 'int':
                return (int) $value;
            case 'boolean':
            case 'bool':
                return filter_var($value, FILTER_VALIDATE_BOOLEAN);
            case 'json':
                return json_decode($value, true);
            default:
                return $value;
        }
    }

    /**
     * Formely: academia își vede și își schimbă doar setările proprii;
     * setările globale (backup, mentenanță, register) aparțin platformei.
     */
    private function tenantCompany(): ?Company
    {
        $companyId = auth()->user()?->company_id;

        return $companyId ? Company::query()->find($companyId) : null;
    }

    /** @return array<string, array{value: mixed, type: string, description: string}> */
    private function tenantSettings(Company $company): array
    {
        return [
            'email_notifications' => [
                'value' => (bool) ($company->email_notifications ?? true),
                'type' => 'boolean',
                'description' => 'Notificări email trimise utilizatorilor academiei',
            ],
        ];
    }

    private function updateTenantSettings(Request $request, Company $company)
    {
        $platformKeys = array_diff(array_keys($request->all()), ['email_notifications']);
        if ($platformKeys !== []) {
            return response()->json([
                'message' => 'Aceste setări afectează toată platforma și sunt gestionate de echipa Formely.',
                'errors' => ['settings' => array_values($platformKeys)],
            ], 403);
        }

        $validated = $request->validate(['email_notifications' => 'required|boolean']);
        $company->update(['email_notifications' => (bool) $validated['email_notifications']]);

        return response()->json([
            'message' => 'Setările au fost actualizate',
            'updated' => ['email_notifications' => (bool) $validated['email_notifications']],
        ]);
    }
}
