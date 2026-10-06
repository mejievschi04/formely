<?php

namespace App\Support;

final class RegistrationInvitationUrl
{
    public static function build(string $plainToken): string
    {
        $base = rtrim((string) config('volta.frontend_url', 'http://localhost:5173'), '/');

        return $base.'/register/invite/'.$plainToken;
    }
}
