<?php

namespace App\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Contracts\Validation\Validator;

/**
 * Standard API response format: always use "message" for user-facing text.
 * Frontend can read response.data.message for errors.
 */
class ApiResponse
{
    public static function success(mixed $data = null, int $status = 200): JsonResponse
    {
        $body = $data !== null ? (is_array($data) ? $data : ['data' => $data]) : [];
        return response()->json($body, $status);
    }

    public static function error(string $message, int $status = 400, array $extra = []): JsonResponse
    {
        return response()->json(array_merge(['message' => $message], $extra), $status);
    }

    public static function validationErrors(Validator $validator, int $status = 422): JsonResponse
    {
        return response()->json([
            'message' => 'Date invalide.',
            'errors' => $validator->errors()->toArray(),
        ], $status);
    }

    /** Use for 500 so message is safe (no leak of exception message in production). */
    public static function serverError(string $publicMessage = 'Eroare internă. Încearcă mai târziu.', int $status = 500): JsonResponse
    {
        return response()->json(['message' => $publicMessage], $status);
    }
}
