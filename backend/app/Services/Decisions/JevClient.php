<?php

namespace App\Services\Decisions;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\{Cache, Http};

final class JevClient
{
    public const TERMINAL_TIMEOUT = 12;

    /** One paid request. Background advice keeps its short deadline; explicit Auto can wait. */
    public function decide(array $state, array $questions, int $timeoutSeconds = 1): array
    {
        if (config('intelligence.jev_url') !== 'https://openrouter.ai/api/alpha/decisions') {
            throw new \RuntimeException('invalid_provider');
        }
        if (!config('intelligence.jev_key') || Cache::has('jev:circuit')) {
            throw new \RuntimeException('provider_unavailable');
        }
        if (strlen(json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) > 12000) {
            throw new \RuntimeException('input_limit');
        }
        $timeout = max(1, min(self::TERMINAL_TIMEOUT, $timeoutSeconds));
        $usage = null;
        $status = null;
        try {
            $response = Http::withToken(config('intelligence.jev_key'))
                ->acceptJson()->withoutRedirecting()->connectTimeout(min(3, $timeout))->timeout($timeout)
                ->post(config('intelligence.jev_url'), [
                    'model' => config('intelligence.jev_model'), 'state' => $state, 'questions' => $questions,
                ]);
            $status = $response->status();
            // Preserve billing even when status, model version or answer validation fails.
            $usage = JevResponse::usage($response->json('usage.cost'));
            if (!$response->successful()) {
                throw new \UnexpectedValueException('provider_http');
            }

            return JevResponse::parse($response->json(), $questions);
        } catch (\Throwable $error) {
            $reason = match (true) {
                $error instanceof ConnectionException => 'provider_transport',
                $error instanceof \UnexpectedValueException => $error->getMessage(),
                default => 'provider_response',
            };
            Cache::put('jev:circuit', true, 30);
            // Never retain the raw exception: HTTP exceptions may include prompts or credentials.
            throw new DecisionUnavailable($usage, $reason, $status);
        }
    }
}
