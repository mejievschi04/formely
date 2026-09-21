<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MediaAsset;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaAssetTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
    }

    public function test_admin_media_index_is_scoped_to_company(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('academie');

        $companyA = Company::create([
            'name' => 'Academia A',
            'slug' => 'academia-a',
            'status' => 'active',
            'plan' => 'academie',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $companyB = Company::create([
            'name' => 'Academia B',
            'slug' => 'academia-b',
            'status' => 'active',
            'plan' => 'academie',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);

        $adminA = User::factory()->create([
            'email' => 'admin-a@example.com',
            'password' => Hash::make('Password1'),
            'role' => 'admin',
            'company_id' => $companyA->id,
            'status' => 'active',
        ]);
        $adminB = User::factory()->create([
            'email' => 'admin-b@example.com',
            'password' => Hash::make('Password1'),
            'role' => 'admin',
            'company_id' => $companyB->id,
            'status' => 'active',
        ]);

        TenantContext::setCompanyId($companyA->id);
        $assetA = MediaAsset::create([
            'company_id' => $companyA->id,
            'uploaded_by_user_id' => $adminA->id,
            'disk' => 'public',
            'type' => 'image',
            'path' => 'content-blocks/image/a.png',
            'filename' => 'a.png',
            'mime_type' => 'image/png',
            'size' => 10,
        ]);
        TenantContext::clear();

        TenantContext::setCompanyId($companyB->id);
        $assetB = MediaAsset::create([
            'company_id' => $companyB->id,
            'uploaded_by_user_id' => $adminB->id,
            'disk' => 'public',
            'type' => 'image',
            'path' => 'content-blocks/image/b.png',
            'filename' => 'b.png',
            'mime_type' => 'image/png',
            'size' => 20,
        ]);
        TenantContext::clear();

        Sanctum::actingAs($adminA);
        TenantContext::setFromUser($adminA);

        $response = $this->getJson('/api/admin/media');
        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($assetA->id, $ids);
        $this->assertNotContains($assetB->id, $ids);

        $this->deleteJson('/api/admin/media/'.$assetB->id)->assertNotFound();
    }
}
