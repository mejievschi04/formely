<?php

namespace App\Http\Middleware;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken as Middleware;

/**
 * Sanctum trimite tokenul criptat în X-XSRF-TOKEN. Dacă decriptarea eșuează
 * (plus transformat în spațiu, URL-encoding), comparăm și valoarea plain cu tokenul din sesiune.
 * La 419 punem cookie-ul XSRF actual, ca retry-ul din SPA să nu retrimită tokenul vechi.
 */
class ValidateCsrfToken extends Middleware
{
    public function handle($request, \Closure $next)
    {
        if (
            $this->isReading($request) ||
            $this->runningUnitTests() ||
            $this->inExceptArray($request) ||
            $this->tokensMatch($request)
        ) {
            return parent::handle($request, $next);
        }

        $token = $request->hasSession() ? $request->session()->token() : null;

        $response = response()->json([
            'message' => 'CSRF token mismatch.',
            'csrf_token' => $token,
        ], 419);

        if (is_string($token) && $token !== '') {
            $response->headers->set('X-CSRF-TOKEN', $token);
        }

        if ($request->hasSession()) {
            $this->addCookieToResponse($request, $response);
        }

        return $response;
    }

    protected function getTokenFromRequest($request)
    {
        $sessionToken = $request->hasSession() ? $request->session()->token() : null;

        $plain = $request->input('_token') ?: $request->header('X-CSRF-TOKEN');
        if (is_string($plain) && $plain !== '') {
            if (! is_string($sessionToken) || hash_equals($sessionToken, $plain)) {
                return $plain;
            }
        }

        $header = $request->header('X-XSRF-TOKEN');
        if (! is_string($header) || $header === '') {
            return is_string($plain) ? $plain : null;
        }

        foreach ($this->xsrfHeaderCandidates($header) as $candidate) {
            if (is_string($sessionToken) && hash_equals($sessionToken, $candidate)) {
                return $sessionToken;
            }

            try {
                $decrypted = CookieValuePrefix::remove(
                    $this->encrypter->decrypt($candidate, static::serialized())
                );
            } catch (DecryptException) {
                continue;
            }

            if (! is_string($decrypted) || $decrypted === '') {
                continue;
            }

            if (! is_string($sessionToken) || hash_equals($sessionToken, $decrypted)) {
                return $decrypted;
            }
        }

        return '';
    }

    /**
     * @return list<string>
     */
    private function xsrfHeaderCandidates(string $header): array
    {
        $withPlus = str_replace(' ', '+', $header);

        return array_values(array_unique(array_filter([
            $header,
            rawurldecode($header),
            $withPlus,
            rawurldecode($withPlus),
        ], 'is_string')));
    }
}
