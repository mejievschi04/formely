<?php

namespace Database\Seeders;

use App\Models\User;
use App\Support\UserRoles;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Safe for production: creates/updates the platform operator only.
 * Password comes from FORMELY_PLATFORM_OPERATOR_PASSWORD (required in production).
 * Never seeds demo academies or hardcoded passwords.
 */
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) env('FORMELY_PLATFORM_OPERATOR_EMAIL', 'platform@formely.local')));
        $password = (string) env('FORMELY_PLATFORM_OPERATOR_PASSWORD', '');

        if ($password === '') {
            if (app()->environment('production')) {
                $this->command?->error('Set FORMELY_PLATFORM_OPERATOR_PASSWORD before seeding production.');

                return;
            }
            $password = Str::password(24);
            $this->command?->warn("Generated temporary platform password (save it): {$password}");
        }

        $name = (string) env('FORMELY_PLATFORM_OPERATOR_NAME', 'Platform Admin');

        User::withoutGlobalScopes()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => UserRoles::PLATFORM_OPERATOR,
                'company_id' => null,
                'status' => 'active',
                'must_change_password' => true,
            ]
        );

        User::withoutGlobalScopes()
            ->where('email', $email)
            ->update([
                'company_id' => null,
                'role' => UserRoles::PLATFORM_OPERATOR,
            ]);

        $this->command?->info("Platform operator ready: {$email}");
    }
}
