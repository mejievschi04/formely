<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CourseListingTest extends TestCase
{
    use RefreshDatabase;

    private function defaultCompany(): Company
    {
        Cache::flush();

        return Company::query()->where('slug', 'default')->firstOrFail();
    }

    public function test_guest_sees_only_published_courses_from_default_company(): void
    {
        $default = $this->defaultCompany();
        $other = Company::create([
            'name' => 'Other Academy',
            'slug' => 'other-academy',
            'status' => 'active',
            'plan' => 'academie',
        ]);

        Course::factory()->published()->create([
            'title' => 'Public Course',
            'status' => 'published',
            'company_id' => $default->id,
        ]);
        Course::factory()->create([
            'title' => 'Draft Course',
            'status' => 'draft',
            'company_id' => $default->id,
        ]);
        Course::factory()->published()->create([
            'title' => 'Other Tenant Course',
            'status' => 'published',
            'company_id' => $other->id,
        ]);

        $response = $this->getJson('/api/courses');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonFragment(['title' => 'Public Course']);
        $response->assertJsonMissing(['title' => 'Draft Course']);
        $response->assertJsonMissing(['title' => 'Other Tenant Course']);
    }

    public function test_guest_does_not_see_courses_without_tenant(): void
    {
        Course::factory()->published()->create([
            'title' => 'Orphan Public',
            'status' => 'published',
            'company_id' => null,
        ]);

        $this->getJson('/api/courses')
            ->assertOk()
            ->assertJsonMissing(['title' => 'Orphan Public']);
    }

    public function test_admin_sees_published_and_draft_courses(): void
    {
        $company = $this->defaultCompany();
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'role' => 'admin',
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        Course::factory()->published()->create([
            'title' => 'Public Course',
            'status' => 'published',
            'company_id' => $company->id,
        ]);

        Course::factory()->create([
            'title' => 'Draft Course',
            'status' => 'draft',
            'company_id' => $company->id,
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/courses');

        $response->assertOk();
        $response->assertJsonCount(2);
        $response->assertJsonFragment(['title' => 'Public Course']);
        $response->assertJsonFragment(['title' => 'Draft Course']);
    }

    public function test_company_owner_sees_draft_courses_in_catalog(): void
    {
        $company = $this->defaultCompany();
        $owner = User::factory()->create([
            'email' => 'owner-catalog@example.com',
            'role' => 'company_owner',
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        Course::factory()->create([
            'title' => 'Owner Draft',
            'status' => 'draft',
            'company_id' => $company->id,
        ]);

        $this->actingAs($owner, 'sanctum')
            ->getJson('/api/courses')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Owner Draft']);
    }

    public function test_guest_event_catalog_is_empty_without_events_plan(): void
    {
        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonPath('total', 0)
            ->assertJsonPath('data', []);
    }
}
