<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use App\Support\StudentSessionLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class StudentSessionLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_session_started_is_recorded_once_per_browser_session(): void
    {
        Cache::flush();

        $student = User::factory()->create([
            'role' => 'student',
            'status' => 'active',
        ]);

        $request = Request::create('/api/auth/me', 'GET');
        $session = app('session.store');
        $session->setId('test-session-fixed');
        $session->start();
        $request->setLaravelSession($session);

        StudentSessionLogger::recordOpened($student, $request);
        StudentSessionLogger::recordOpened($student, $request);

        $this->assertSame(
            1,
            ActivityLog::where('user_id', $student->id)->where('action', 'session_started')->count()
        );
    }

    public function test_login_records_session_started_for_student(): void
    {
        Cache::flush();

        $student = User::factory()->create([
            'role' => 'student',
            'status' => 'active',
            'password' => bcrypt('Password1'),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $student->email,
            'password' => 'Password1',
        ])->assertOk();

        $this->assertTrue(
            ActivityLog::where('user_id', $student->id)->where('action', 'session_started')->exists()
        );
    }
}
