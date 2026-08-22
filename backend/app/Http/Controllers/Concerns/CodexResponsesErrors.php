<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\BillingReservationException;
use Illuminate\Http\JsonResponse;

trait CodexResponsesErrors
{
    private function codexProviderErrorMessage(mixed $payload): string
        {
            $error = is_array($payload) && is_array($payload['error'] ?? null)
                ? $payload['error']
                : [];
            $message = trim((string) ($error['message'] ?? ''));
            $raw = $error['metadata']['raw'] ?? null;
            if (is_string($raw) && trim($raw) !== '') {
                $decodedRaw = json_decode($raw, true);
                $rawMessage = is_array($decodedRaw)
                    ? trim((string) ($decodedRaw['error']['message'] ?? $decodedRaw['message'] ?? ''))
                    : '';
                if ($rawMessage !== '') {
                    return $rawMessage;
                }
            }
            return $message !== '' ? $message : 'OpenRouter rejected the terminal request.';
        }
    private function codexBillingErrorStatus(BillingReservationException $error): int
        {
            // Native Codex retries quota statuses and replaces the useful response
            // with a generic retry-limit error. Keep the billing status in details.
            return $error->status === 401 ? 401 : 400;
        }
    private function codexError(
            string $message,
            int $status,
            ?string $code = null,
            array $details = [],
        ): JsonResponse
        {
            return response()->json([
                'error' => array_filter([
                    'message' => $message,
                    'code' => $code,
                    'details' => $details ?: null,
                ], static fn (mixed $value): bool => $value !== null),
            ], $status);
        }
}
