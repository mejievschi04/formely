<?php

namespace App\Support;

/**
 * Rolurile din LMS sunt cele din Volta (admin / instructor / analyst / student),
 * aplicate per academie. Formely adaugă doar operatorul platformei (backoffice).
 */
final class UserRoles
{
    /** Operator Formely — doar backoffice, nu e rol în LMS (company_id = null). */
    public const PLATFORM_OPERATOR = 'platform_operator';

    /** Administratorul academiei (proprietarul contului companiei). */
    public const ADMIN = 'admin';

    public const INSTRUCTOR = 'instructor';

    public const ANALYST = 'analyst';

    public const STUDENT = 'student';

    /** @deprecated Înlocuit de platform_operator (backoffice) */
    public const SUPER_ADMIN = 'super_admin';

    /** Roluri permise la creare/editare utilizator în LMS (fără operatori platformă). */
    public static function assignable(): array
    {
        return [self::ADMIN, self::INSTRUCTOR, self::ANALYST, self::STUDENT];
    }

    public static function label(?string $role): string
    {
        return self::labels()[$role] ?? (string) $role;
    }

    /** @return array<string, string> */
    public static function labels(): array
    {
        return [
            self::PLATFORM_OPERATOR => 'Operator platformă',
            self::ADMIN => 'Administrator',
            self::INSTRUCTOR => 'Instructor',
            self::ANALYST => 'Analist',
            self::STUDENT => 'Cursant',
            self::SUPER_ADMIN => 'Operator platformă',
        ];
    }

    /** Acces la shell + API /admin al academiei */
    public static function staffRoles(): array
    {
        return [self::ADMIN, self::INSTRUCTOR, self::ANALYST];
    }

    public static function learnerRoles(): array
    {
        return [self::STUDENT];
    }

    public static function isPlatformOperator(?string $role): bool
    {
        return in_array($role ?? '', [self::PLATFORM_OPERATOR, self::SUPER_ADMIN], true);
    }
}
