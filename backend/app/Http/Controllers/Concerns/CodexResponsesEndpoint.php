<?php

namespace App\Http\Controllers\Concerns;

use App\Services\AutoModelRouter;
use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Billing\OpenRouterRequestPolicy;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

trait CodexResponsesEndpoint
{
    use CodexChatCompletionsCompatibility;
    use CodexResponsesStreaming;

    public function codexResponses(Request $request): Response
    {
        $user = $this->authenticatedUser($request);
        $payload = $request->all();
        if (($payload['stream'] ?? null) !== true || ! isset($payload['input'])) {
            return $this->codexError('Vibyra Codex terminals require a streaming Responses API request.', 422);
        }
        $payload['input'] = $this->normalizeCodexFunctionCallIds($payload['input']);
        $payload['tools'] = $this->normalizeCodexToolSchemas($payload['tools'] ?? []);

        $calc = app(CreditCalculator::class);
        $requestedModel = trim((string) ($payload['model'] ?? ''));
        if ($requestedModel === '') {
            return $this->codexError('A concrete terminal model or literal auto is required.', 422);
        }
        $modelKey = $this->codexResponseModel($requestedModel, $payload, $user->id, $user->plan ?: 'free', $calc);
        if ($modelKey === null) {
            return $this->codexError('Unknown Vibyra terminal model.', 422);
        }
        if (! $calc->planAllowsModel($user->plan ?: 'free', $modelKey)) {
            return $this->codexError('Your Vibyra plan does not include this terminal model.', 403);
        }
        $resolvedModel = $calc->resolveSlug($modelKey);
        if (! app(OpenRouterPricingCatalog::class)->supportsTerminalToolCalling($resolvedModel)) {
            return $this->codexError('This model does not support terminal tool calling.', 422);
        }

        $inputTokens = max(1, (int) ceil(strlen(json_encode($payload)) / 4));
        $requestedOutputTokens = (int) ($payload['max_output_tokens'] ?? 2000);
        $maxOutputTokens = max(800, min(2000, $requestedOutputTokens));
        $quotaOutputTokens = min(
            $maxOutputTokens,
            max(1, (int) config('billing.openrouter_pricing.terminal_quota_output_tokens', 256))
        );
        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->codexError('OpenRouter is not configured on the Vibyra backend.', 500);
        }
        $reservationService = app(ChatCostReservationService::class);
        $reference = 'codex:'.Str::uuid();
        $requestCostMultiplier = $this->codexRequestCostMultiplier($payload);
        $quotaCredits = (int) ceil(
            $calc->estimateUsageCredits(
                $modelKey,
                $inputTokens,
                $quotaOutputTokens,
                true
            ) * $requestCostMultiplier
        );
        try {
            $reservation = $reservationService->reserve(
                $user,
                $reference,
                $modelKey,
                (int) ceil(
                    $calc->estimateCredits($modelKey, $inputTokens, $maxOutputTokens, true)
                    * $requestCostMultiplier
                ),
                (int) ceil(
                    $calc->estimateReservationUsd($modelKey, $inputTokens, $maxOutputTokens)
                    * $requestCostMultiplier
                    * 1_000_000
                ),
                [
                    'surface' => 'desktop-terminal',
                    'agent_mode' => true,
                    'request_cost_multiplier' => $requestCostMultiplier,
                ],
                $quotaCredits,
            );
        } catch (BillingReservationException $error) {
            return $this->codexError(
                $error->getMessage(),
                $this->codexBillingErrorStatus($error),
                $error->errorCode,
                [
                    ...$error->details,
                    'billingStatus' => $error->status,
                ],
            );
        }

        $payload['model'] = $resolvedModel;
        $payload['store'] = false;
        $payload['provider'] = app(OpenRouterRequestPolicy::class)->provider(
            $modelKey,
            $requestCostMultiplier
        );
        unset($payload['client_metadata']);

        try {
            $reservationService->markProviderStarted($reservation);
            if ($this->codexUsesChatCompletions($resolvedModel)) {
                return $this->codexChatCompletions(
                    $payload,
                    $reservationService,
                    $reservation,
                    $inputTokens,
                    $maxOutputTokens,
                );
            }
            $client = app()->bound('vibyra.openrouter_responses_client')
                ? app('vibyra.openrouter_responses_client')
                : new GuzzleClient(['timeout' => 300, 'connect_timeout' => 10, 'http_errors' => false]);
            $provider = $client->post((string) config('services.openrouter.responses_url'), [
                'headers' => [
                    'Authorization' => 'Bearer '.$apiKey,
                    'Accept' => 'text/event-stream',
                    'Content-Type' => 'application/json',
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                    'X-OpenRouter-Metadata' => 'enabled',
                ],
                'json' => $payload,
                'stream' => true,
            ]);
        } catch (Throwable $error) {
            $reservationService->settle($reservation, [[
                'billable' => true,
                'outcome' => 'provider_transport_error',
                'charge_reserved_estimate' => true,
            ]], [
                'outcome' => 'error',
                'stream_terminal_type' => 'provider_transport_error',
            ]);

            return $this->codexError('Could not reach OpenRouter: '.$error->getMessage(), 502);
        }

        if ($provider->getStatusCode() >= 400) {
            $decoded = json_decode((string) $provider->getBody()->getContents(), true);
            Log::warning('OpenRouter rejected a Codex Responses request.', [
                'status' => $provider->getStatusCode(),
                'model' => $resolvedModel,
                'error' => $decoded['error'] ?? null,
            ]);
            $usage = $this->codexUsage((array) ($decoded['usage'] ?? []), $decoded);
            if ($usage !== []) {
                $reservationService->settle($reservation, [[
                    'billable' => true,
                    'outcome' => 'provider_error',
                    'usage' => $usage,
                ]], ['outcome' => 'provider_error']);
            } else {
                $reservationService->release($reservation, 'provider_error_without_usage');
            }

            return $this->codexError(
                $this->codexProviderErrorMessage($decoded),
                $provider->getStatusCode()
            );
        }

        return $this->streamCodexProviderResponse(
            $provider,
            $reservationService,
            $reservation,
            $inputTokens,
            $maxOutputTokens,
        );
    }

    private function normalizeCodexFunctionCallIds(mixed $input): mixed
    {
        if (! is_array($input)) {
            return $input;
        }

        foreach ($input as $index => $item) {
            if (! is_array($item)
                || ! in_array($item['type'] ?? null, ['function_call', 'function_call_output'], true)
                || trim((string) ($item['call_id'] ?? '')) !== '') {
                continue;
            }
            $id = trim((string) ($item['id'] ?? ''));
            if ($id !== '') {
                $input[$index]['call_id'] = $id;
            }
        }

        return $input;
    }

    private function normalizeCodexToolSchemas(mixed $tools): mixed
    {
        if (! is_array($tools)) {
            return $tools;
        }

        foreach ($tools as $index => $tool) {
            if (! is_array($tool) || ($tool['type'] ?? null) !== 'function') {
                continue;
            }
            $tools[$index]['parameters'] = $this->normalizeCodexSchemaValue(
                $tool['parameters'] ?? []
            );
        }

        return $tools;
    }

    private function normalizeCodexSchemaValue(mixed $value, ?string $key = null): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if ($value === [] && in_array($key, [
            'parameters',
            'properties',
            'patternProperties',
            'definitions',
            '$defs',
            'dependentSchemas',
        ], true)) {
            return (object) [];
        }

        foreach ($value as $childKey => $childValue) {
            $value[$childKey] = $this->normalizeCodexSchemaValue(
                $childValue,
                is_string($childKey) ? $childKey : null
            );
        }

        return $value;
    }

    private function codexResponseModel(string $requested, array $payload, int $userId, string $plan, CreditCalculator $calc): ?string
    {
        if ($requested !== 'auto') {
            return $calc->modelConfig($requested) ? $requested : null;
        }
        $thread = preg_replace('/[^a-zA-Z0-9._-]/', '', (string) ($payload['prompt_cache_key'] ?? ''));
        $cacheKey = 'codex:auto:'.$userId.':'.($thread ?: hash('sha256', json_encode($payload['input'])));
        $modelKey = Cache::remember($cacheKey, now()->addHours(6), function () use ($payload, $plan, $calc) {
            return app(AutoModelRouter::class)->route($this->codexUserPrompt($payload['input']), $plan, $calc)['modelKey'];
        });

        return is_string($modelKey) && $modelKey !== 'auto' && $calc->modelConfig($modelKey)
            ? $modelKey
            : null;
    }

    private function codexUserPrompt(mixed $input): string
    {
        $text = '';
        foreach (is_array($input) ? $input : [$input] as $item) {
            if (is_string($item)) {
                $text = $item;
            }
            if (! is_array($item) || ($item['role'] ?? '') !== 'user') {
                continue;
            }
            foreach (is_array($item['content'] ?? null) ? $item['content'] : [] as $content) {
                if (is_array($content) && isset($content['text'])) {
                    $text = (string) $content['text'];
                }
            }
        }

        return Str::limit(trim($text) ?: 'General coding task', 8000, '');
    }

    private function codexRequestCostMultiplier(array $payload): float
    {
        $multiplier = 1.0;
        if (($payload['service_tier'] ?? null) === 'priority') {
            $multiplier = max(
                $multiplier,
                (float) config(
                    'billing.openrouter_pricing.request_cost_multipliers.priority_service_tier',
                    3.0
                )
            );
        }
        if (($payload['speed'] ?? null) === 'fast') {
            $multiplier = max(
                $multiplier,
                (float) config(
                    'billing.openrouter_pricing.request_cost_multipliers.fast_speed',
                    6.0
                )
            );
        }

        return $multiplier;
    }

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
