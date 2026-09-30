<?php

namespace App\Services\AgentRuns;

use Illuminate\Http\Exceptions\HttpResponseException;

/** A typed refusal: `{ok:false, code, error}` so clients branch on `code`, not prose. */
final class ApiError
{
    /** `$extra` adds fields such as `fix` ({action, message}) a client can show next to the refusal. */
    public static function throw(int $status, string $code, string $message, array $extra = []): never
    {
        throw new HttpResponseException(response()->json(['ok' => false, 'code' => $code, 'error' => $message, ...$extra], $status));
    }
}
