<?php

namespace Tests\Feature;

use App\Models\AiChunk;
use App\Models\Company;
use App\Models\Course;
use App\Models\RegistrationInvitation;
use App\Models\Team;
use App\Models\User;
use App\Services\AIKnowledgeService;
use App\Services\RegistrationInvitationService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** O academie nu vede și nu atinge datele alteia, nici prin query-urile raw venite din Volta. */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Company $other;

    private User $otherAdmin;

    private Course $otherCourse;

    protected function setUp(): void
    {
        parent::setUp();

        $this->other = Company::create([
            'name' => 'Alta Academie',
            'slug' => 'alta-academie',
            'status' => 'active',
            'plan' => 'business',
        ]);
        $this->otherAdmin = User::factory()->create(['role' => 'admin', 'company_id' => $this->other->id]);
        $this->otherCourse = Course::factory()->create([
            'title' => 'Curs din altă academie',
            'status' => 'published',
            'company_id' => $this->other->id,
        ]);
    }

    public function test_admin_and_student_do_not_see_courses_of_another_academy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $this->assertNotSame($this->other->id, $admin->company_id);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/courses/{$this->otherCourse->id}")
            ->assertNotFound();

        $titles = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/courses')->json('data')
            ?? $this->actingAs($admin, 'sanctum')->getJson('/api/admin/courses')->json())
            ->flatten()->filter(fn ($v) => is_string($v));
        $this->assertFalse($titles->contains($this->otherCourse->title));

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$this->otherCourse->id}")
            ->assertNotFound();

        $this->getJson("/api/courses/{$this->otherCourse->id}")->assertNotFound();
    }

    public function test_validation_rejects_ids_from_another_academy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $foreignTeam = Team::create(['name' => 'Echipa străină', 'company_id' => $this->other->id, 'owner_id' => $this->otherAdmin->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/users', [
                'name' => 'Cursant Nou',
                'email' => 'nou@example.test',
                'role' => 'student',
                'team_id' => $foreignTeam->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('team_id');
    }

    public function test_dashboard_enrollments_count_only_own_academy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $foreignStudent = User::factory()->create(['role' => 'student', 'company_id' => $this->other->id]);
        DB::table('course_user')->insert([
            'course_id' => $this->otherCourse->id,
            'user_id' => $foreignStudent->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        TenantContext::setFromUser($admin);
        try {
            $count = DB::table('course_user')
                ->join('users', 'users.id', '=', 'course_user.user_id')
                ->tap(fn ($q) => \App\Support\TenantQuery::constrainUsers($q))
                ->count();
        } finally {
            TenantContext::clear();
        }

        $this->assertSame(0, $count);
    }

    public function test_tutor_knowledge_never_returns_chunks_of_another_academy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        AiChunk::create([
            'course_id' => $this->otherCourse->id,
            'source_type' => 'lesson',
            'chunk_index' => 0,
            'token_count' => 5,
            'content' => str_repeat('Procedura internă de facturare a altei academii: facturare lunară, facturare anuală. ', 4),
            'content_hash' => hash('sha256', 'x'),
            'visible' => true,
        ]);

        TenantContext::setFromUser($admin);
        try {
            $chunks = app(AIKnowledgeService::class)->getRankedChunksForTutor('facturare', null, null, true);
        } finally {
            TenantContext::clear();
        }

        $this->assertSame([], $chunks);
    }

    public function test_owner_invitation_creates_admin_inside_the_invited_academy(): void
    {
        $operator = User::factory()->create(['role' => 'platform_operator', 'company_id' => null]);
        $this->assertNull($operator->fresh()->company_id);

        $result = app(RegistrationInvitationService::class)->createAndSend(
            'owner@alta.example',
            $operator,
            'Owner',
            'admin',
            null,
            7,
            null,
            (int) $this->other->id
        );
        $this->assertSame($this->other->id, (int) $result['invitation']->company_id);

        $token = basename((string) parse_url($result['invite_url'], PHP_URL_PATH));
        $this->postJson("/api/auth/invitations/{$token}/accept", [
            'name' => 'Owner Alta',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
        ])->assertCreated();

        $owner = User::withoutGlobalScopes()->where('email', 'owner@alta.example')->firstOrFail();
        $this->assertSame($this->other->id, (int) $owner->company_id);
        $this->assertSame('admin', $owner->role);
        $this->assertNotNull(RegistrationInvitation::withoutGlobalScopes()->find($result['invitation']->id)->accepted_at);
    }

    public function test_invitation_rejects_team_of_another_academy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $foreignTeam = Team::create(['name' => 'Echipa străină', 'company_id' => $this->other->id, 'owner_id' => $this->otherAdmin->id]);
        $ownTeam = Team::create(['name' => 'Echipa mea', 'company_id' => $admin->company_id, 'owner_id' => $admin->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/users/invitations', [
                'email' => 'invitat@example.test',
                'role' => 'student',
                'team_id' => $foreignTeam->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('team_id');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/users/invitations', [
                'email' => 'invitat@example.test',
                'role' => 'student',
                'team_id' => $ownTeam->id,
            ])
            ->assertCreated();
    }
}
