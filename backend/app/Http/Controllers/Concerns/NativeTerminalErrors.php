<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;

trait NativeTerminalErrors
{
    private function nativeTerminalError(
            string $message,
            int $status,
            string $provider,
            ?string $code = null,
            array $details = [],
        ): JsonResponse {
            if ($provider === 'google') {
                return response()->json(['error' => [
                    'code' => $status,
                    'message' => $message,
                    'status' => $status === 429 ? 'RESOURCE_EXHAUSTED' : 'FAILED_PRECONDITION',
                    ...($code || $details !== [] ? ['details' => [[
                        ...($code ? ['code' => $code] : []),
                        ...$details,
                    ]]] : []),
                ]], $status);
            }
            return response()->json(['type' => 'error', 'error' => [
                'type' => $status === 429 ? 'rate_limit_error' : 'invalid_request_error',
                'message' => $message,
                ...($code ? ['code' => $code] : []),
                ...($details !== [] ? ['details' => $details] : []),
            ]], $status);
        }
}
