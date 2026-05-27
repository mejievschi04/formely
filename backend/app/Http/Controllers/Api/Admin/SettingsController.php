<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\User;
use App\Models\Course;
use App\Models\Team;
use App\Models\Event;
use App\Models\Exam;
use App\Models\ActivityLog;
use App\Models\Module;
use App\Models\Lesson;
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
     * Get a specific setting
     */
    public function show($key)
    {
        $setting = Setting::where('key', $key)->first();

        if (!$setting) {
            return response()->json([
                'message' => 'Setarea nu a fost găsită',
            ], 404);
        }

        return response()->json([
            'key' => $setting->key,
            'value' => $this->castValue($setting->value, $setting->type),
            'type' => $setting->type,
            'description' => $setting->description,
        ]);
    }

    /**
     * Update settings
     */
    public function update(Request $request)
    {
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
            'export_date' => now()->toISOString(),
            'users' => User::with(['teams', 'courses'])->get(),
            'courses' => Course::with(['modules.lessons', 'teacher'])->get(),
            'teams' => Team::with(['users', 'courses', 'owner'])->get(),
            'events' => Event::with(['instructor'])->get(),
            'exams' => Exam::with(['course', 'questions.answers'])->get(),
            'activity_logs' => ActivityLog::with(['user'])->latest()->limit(1000)->get(),
            'settings' => Setting::all(),
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
                'message' => 'Eroare la ștergerea cache-ului: ' . $e->getMessage(),
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

            // Import users (skip if they exist by email)
            if (isset($data['users']) && is_array($data['users'])) {
                foreach ($data['users'] as $userData) {
                    if (isset($userData['email'])) {
                        User::updateOrCreate(
                            ['email' => $userData['email']],
                            array_intersect_key($userData, array_flip(['name', 'email', 'role', 'password']))
                        );
                    }
                }
            }

            // Categories are no longer supported - skip import

            // Import courses
            if (isset($data['courses']) && is_array($data['courses'])) {
                foreach ($data['courses'] as $courseData) {
                    if (isset($courseData['id'])) {
                        $modules = $courseData['modules'] ?? [];
                        unset($courseData['modules']);
                        
                        $course = Course::updateOrCreate(
                            ['id' => $courseData['id']],
                            $courseData
                        );

                        // Import modules and lessons
                        if (!empty($modules)) {
                            foreach ($modules as $moduleData) {
                                if (isset($moduleData['id'])) {
                                    $lessons = $moduleData['lessons'] ?? [];
                                    unset($moduleData['lessons']);
                                    
                                    $module = Module::updateOrCreate(
                                        ['id' => $moduleData['id']],
                                        array_merge($moduleData, ['course_id' => $course->id])
                                    );

                                    // Import lessons
                                    if (!empty($lessons)) {
                                        foreach ($lessons as $lessonData) {
                                            if (isset($lessonData['id'])) {
                                                Lesson::updateOrCreate(
                                                    ['id' => $lessonData['id']],
                                                    array_merge($lessonData, ['module_id' => $module->id])
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
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
                        
                        $team = Team::updateOrCreate(
                            ['id' => $teamData['id']],
                            $teamData
                        );

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

            DB::commit();

            return response()->json([
                'message' => 'Backup-ul a fost importat cu succes',
                'imported_date' => $data['export_date'],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Eroare la importarea backup-ului: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Cast value based on type
     */
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
}

