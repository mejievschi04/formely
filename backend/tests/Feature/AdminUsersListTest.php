<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUsersListTest extends TestCase
{
    use RefreshDatabase;

    public function test_all_users_can_be_loaded_with_filters_and_trash_scope(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->count(20)->create(['role' => 'student', 'status' => 'active']);
        $deleted = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $deleted->delete();

        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/admin/users?all=1')->assertOk()->assertJsonCount(21);
        $this->getJson('/api/admin/users?all=1&role=student&status=active')->assertOk()->assertJsonCount(20);
        $this->getJson('/api/admin/users?all=1&trashed=1')->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $deleted->id);
        $this->getJson('/api/admin/users')->assertOk()->assertJsonCount(15, 'data')->assertJsonPath('total', 21);
    }

    public function test_search_finds_users_without_a_team_by_given_name_surname_or_email(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'name' => 'Admin Root',
            'email' => 'admin-root@example.test',
        ]);
        $withoutTeam = User::factory()->create([
            'role' => 'student',
            'status' => 'active',
            'name' => 'Ștefan Popescu',
            'email' => 'stefan.popescu@example.test',
        ]);
        User::factory()->create([
            'role' => 'student',
            'status' => 'active',
            'name' => 'Maria Ionescu',
            'email' => 'maria.ionescu@example.test',
        ]);

        $this->actingAs($admin, 'sanctum');

        $this->assertSame(0, $withoutTeam->teams()->count());

        $bySurname = $this->getJson('/api/admin/users?all=1&search=popescu')->assertOk()->json();
        $this->assertSame([$withoutTeam->id], collect($bySurname)->pluck('id')->all());

        $byGivenName = $this->getJson('/api/admin/users?all=1&search=stefan')->assertOk()->json();
        $this->assertSame([$withoutTeam->id], collect($byGivenName)->pluck('id')->all());

        $byReversedName = $this->getJson('/api/admin/users?all=1&search=POPESCU stefan')->assertOk()->json();
        $this->assertSame([$withoutTeam->id], collect($byReversedName)->pluck('id')->all());

        $byEmail = $this->getJson('/api/admin/users?all=1&search=stefan.popescu@example.test')->assertOk()->json();
        $this->assertSame([$withoutTeam->id], collect($byEmail)->pluck('id')->all());
    }

    public function test_brief_directory_lists_users_without_a_team_for_member_search(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'name' => 'Admin Root',
            'email' => 'admin-root@example.test',
        ]);
        $withoutTeam = User::factory()->create([
            'role' => 'student',
            'name' => 'Ioana Georgescu',
            'email' => 'ioana.georgescu@example.test',
        ]);

        $this->actingAs($admin, 'sanctum');

        $response = $this->getJson('/api/admin/users?brief=1&search=georgescu')->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $withoutTeam->id);
        $response->assertJsonPath('0.email', 'ioana.georgescu@example.test');
        $response->assertJsonMissingPath('0.teams');
    }
}
