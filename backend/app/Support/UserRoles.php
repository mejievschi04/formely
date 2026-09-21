<?php

namespace App\Support;

final class UserRoles
{
    /** Operator Formely — doar backoffice, nu e rol în LMS. */
    public const PLATFORM_OPERATOR = 'platform_operator';

    public const COMPANY_OWNER = 'company_owner';

    public const HR_ADMIN = 'hr_admin';

    public const MANAGER = 'manager';

    public const EMPLOYEE = 'employee';

    public const INSTRUCTOR = 'instructor';

    public const ANALYST = 'analyst';

    /** @deprecated Alias vechi pentru company_owner */
    public const LEGACY_ADMIN = 'admin';

    /** @deprecated Alias vechi pentru employee */
    public const LEGACY_STUDENT = 'student';

    /** @deprecated Înlocuit de platform_operator (backoffice) */
    public const SUPER_ADMIN = 'super_admin';

    public static function normalize(?string $role): string
    {
        return match ($role) {
            self::LEGACY_ADMIN, self::SUPER_ADMIN => self::COMPANY_OWNER,
            self::LEGACY_STUDENT => self::EMPLOYEE,
            default => $role ?? self::EMPLOYEE,
        };
    }

    /** Roluri permise la creare/editare utilizator în LMS (fără operatori platformă). */
    public static function assignable(): array
    {
        return [
            self::COMPANY_OWNER,
            self::HR_ADMIN,
            self::MANAGER,
            self::EMPLOYEE,
            self::INSTRUCTOR,
            self::ANALYST,
            self::LEGACY_ADMIN,
            self::LEGACY_STUDENT,
        ];
    }

    public static function label(?string $role): string
    {
        return self::labels()[$role] ?? self::labels()[self::normalize($role)] ?? (string) $role;
    }

    /** @return array<string, string> */
    public static function labels(): array
    {
        return [
            self::PLATFORM_OPERATOR => 'Operator platformă',
            self::COMPANY_OWNER => 'Proprietar companie',
            self::HR_ADMIN => 'Administrator HR',
            self::MANAGER => 'Manager',
            self::EMPLOYEE => 'Cursant',
            self::INSTRUCTOR => 'Instructor',
            self::ANALYST => 'Analist',
            self::LEGACY_ADMIN => 'Administrator',
            self::LEGACY_STUDENT => 'Cursant',
            self::SUPER_ADMIN => 'Operator platformă',
        ];
    }

    /** Acces la shell + API /admin al academiei */
    public static function staffRoles(): array
    {
        return [
            self::COMPANY_OWNER,
            self::HR_ADMIN,
            self::MANAGER,
            self::INSTRUCTOR,
            self::ANALYST,
            self::LEGACY_ADMIN,
        ];
    }

    public static function learnerRoles(): array
    {
        return [
            self::EMPLOYEE,
            self::LEGACY_STUDENT,
        ];
    }

    public static function isPlatformOperator(?string $role): bool
    {
        return in_array($role ?? '', [self::PLATFORM_OPERATOR, self::SUPER_ADMIN], true);
    }
}
