<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterRequestPolicy;
use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Billing\PlanEntitlements;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

trait NativeTerminalEndpoint
{
    use NativeTerminalProtocol;
    use NativeTerminalStreaming;

    public function anthropicTerminalMessages(Request $request): Response
    {
        return $this->dispatchNativeTerminal(
            $request, 'anthropic', (string) $request->input('model', ''), $request->all()
        );
    }

    public function anthropicTerminalCountTokens(Request $request): JsonResponse
    {
        $this->authenticatedUser($request);
        return response()->json([
            'input_tokens' => max(1, (int) ceil(strlen(json_encode($request->all())) / 4)),
        ]);
    }

    public function geminiTerminalRequest(Request $request, string $model, string $action): Response
    {
        if ($action === 'countTokens') {
            $this->authenticatedUser($request);
            return response()->json([
                'totalTokens' => max(1, (int) ceil(strlen(json_encode($request->all())) / 4)),
            ]);
        }
        if (! in_array($action, ['generateContent', 'streamGenerateContent'], true)) {
            return $this->nativeTerminalError('Unsupported Gemini terminal operation.', 404, 'google');
        }
        return $this->dispatchNativeTerminal(
            $request, 'gemini', $model, $request->all(), $action === 'streamGenerateContent'
        );
    }

    private function dispatchNativeTerminal(
        Request $request,
        string $protocol,
        string $requestedModel,
        array $payload,
        ?bool $forceStream = null,
    ): Response {
        $user = $this->authenticatedUser($request);
        $providerId = $protocol === 'anthropic' ? 'anthropic' : 'google';
        $modelKey = $this->terminalModelKey($requestedModel, $providerId);
        $calc = app(CreditCalculator::class);
        if ($modelKey === null) {
            return $this->nativeTerminalError('Unknown Vibyra terminal model.', 422, $providerId);
        }
        if (! $calc->planAllowsModel($user->plan ?: 'free', $modelKey)) {
            return $this->nativeTerminalError(
                'Your Vibyra plan does not include this terminal model.', 403, $providerId
            );
        }

        $resolvedModel = $calc->resolveSlug($modelKey);
        if (! app(OpenRouterPricingCatalog::class)->supportsTerminalToolCalling($resolvedModel)) {
            return $this->nativeTerminalError(
                'This model does not support terminal tool calling.', 422, $providerId
            );
        }
        $upstreamPayload = $protocol === 'anthropic'
            ? $this->anthropicTerminalPayload($payload, $resolvedModel, $forceStream ?? (($payload['stream'] ?? false) === true))
            : $this->geminiChatPayload($payload, $resolvedModel);
        $inputTokens = max(
            1,
            (int) ceil(strlen(json_encode($payload)) / 4),
            (int) ceil(strlen(json_encode($upstreamPayload)) / 4),
        );
        $maxOutputTokens = max(1, min(8192, (int) (
            $payload['max_tokens'] ?? $payload['generationConfig']['maxOutputTokens'] ?? 2000
        )));
        $maxOutputTokens = app(PlanEntitlements::class)->boundedOutputTokens(
            $user->plan ?: 'free',
            $inputTokens,
            $maxOutputTokens,
        );
        if ($maxOutputTokens === null) {
            $cap = app(PlanEntitlements::class)->contextTokenCap($user->plan ?: 'free');
            return $this->nativeTerminalError(
                "This terminal request exceeds your plan's {$cap}-token context limit.",
                413,
                $providerId,
                'membership_context_limit',
                ['contextTokenCap' => $cap],
            );
        }
        $quotaOutputTokens = min(
            $maxOutputTokens,
            max(1, (int) config('billing.openrouter_pricing.terminal_quota_output_tokens', 256))
        );
        $stream = $forceStream ?? (($payload['stream'] ?? false) === true);
        $upstreamPayload['max_tokens'] = $maxOutputTokens;
        $upstreamPayload['stream'] = $stream;
        $upstreamPayload['provider'] = app(OpenRouterRequestPolicy::class)->provider($modelKey);
        if ($stream && $protocol === 'gemini') {
            $upstreamPayload['stream_options'] = ['include_usage' => true];
        }

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->nativeTerminalError(
                'OpenRouter is not configured on the Vibyra backend.', 500, $providerId
            );
        }
        $reservations = app(ChatCostReservationService::class);
        try {
            $reservation = $reservations->reserve(
                $user,
                'terminal-'.$protocol.':'.Str::uuid(),
                $modelKey,
                $calc->estimateCredits($modelKey, $inputTokens, $maxOutputTokens, true),
                (int) ceil($calc->estimateReservationUsd(
                    $modelKey, $inputTokens, $maxOutputTokens
                ) * 1_000_000),
                ['surface' => 'desktop-terminal', 'agent_mode' => true, 'protocol' => $protocol],
                $calc->estimateUsageCredits(
                    $modelKey,
                    $inputTokens,
                    $quotaOutputTokens,
                    true
                ),
            );
        } catch (BillingReservationException $error) {
            $status = str_starts_with($error->errorCode, 'billing_') ? 400 : $error->status;
            return $this->nativeTerminalError(
                $error->getMessage(),
                $status,
                $providerId,
                $error->errorCode,
                [...$error->details, 'billingStatus' => $error->status],
            );
        }

        try {
            $client = app()->bound('vibyra.openrouter_native_terminal_client')
                ? app('vibyra.openrouter_native_terminal_client')
                : new GuzzleClient([
                    'timeout' => 300, 'connect_timeout' => 10, 'http_errors' => false,
                ]);
            $reservations->markProviderStarted($reservation);
            $response = $client->post(
                $protocol === 'anthropic'
                    ? (string) config('services.openrouter.anthropic_url')
                    : (string) config('services.openrouter.url'),
                [
                    'headers' => $this->nativeTerminalHeaders($apiKey, $protocol, $payload),
                    'json' => $upstreamPayload,
                    'stream' => $stream,
                ]
            );
        } catch (Throwable $error) {
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'provider_transport_error',
                'charge_reserved_estimate' => true,
            ]], ['outcome' => 'error']);
            return $this->nativeTerminalError(
                'Could not reach OpenRouter: '.$error->getMessage(), 502, $providerId
            );
        }

        if ($response->getStatusCode() >= 400) {
            $decoded = json_decode((string) $response->getBody()->getContents(), true);
            $usage = is_array($decoded) ? (array) ($decoded['usage'] ?? []) : [];
            if ($usage !== []) {
                $reservations->settle($reservation, [[
                    'billable' => true,
                    'outcome' => 'provider_error',
                    'usage' => $this->terminalUsage($usage),
                ]], ['outcome' => 'provider_error']);
            } else {
                $reservations->release($reservation, 'provider_error_without_usage');
            }
            return $this->nativeTerminalError(
                (string) ($decoded['error']['message'] ?? 'OpenRouter rejected the terminal request.'),
                $response->getStatusCode(),
                $providerId
            );
        }

        if ($stream) {
            return $this->streamNativeTerminalResponse(
                $response, $protocol, $reservations, $reservation, $inputTokens, $maxOutputTokens
            );
        }
        return $this->finishNativeTerminalResponse(
            $response, $protocol, $reservations, $reservation, $inputTokens, $maxOutputTokens, $providerId
        );
    }

    private function finishNativeTerminalResponse(
        $response,
        string $protocol,
        ChatCostReservationService $reservations,
        $reservation,
        int $inputTokens,
        int $maxOutputTokens,
        string $providerId,
    ): Response {
        $decoded = json_decode((string) $response->getBody()->getContents(), true);
        if (! is_array($decoded)) {
            $reservations->settle($reservation, [[
                'billable' => true, 'outcome' => 'unreadable_response',
                'charge_reserved_estimate' => true,
            ]], ['outcome' => 'error']);
            return $this->nativeTerminalError(
                'OpenRouter returned an unreadable response.', 502, $providerId
            );
        }
        $reservations->settle($reservation, [[
            'billable' => true,
            'outcome' => 'completed',
            'usage' => $this->terminalUsage((array) ($decoded['usage'] ?? [])),
            'estimated_input_tokens' => $inputTokens,
            'estimated_output_tokens' => $maxOutputTokens,
        ]], ['outcome' => 'success']);
        return response()->json(
            $protocol === 'gemini' ? $this->geminiNonStreamResponse($decoded) : $decoded
        );
    }

    private function anthropicTerminalPayload(array $payload, string $model, bool $stream): array
    {
        unset($payload['_vibyraHeaders']);
        $payload['model'] = $model;
        $payload['stream'] = $stream;
        return $payload;
    }

    private function nativeTerminalHeaders(string $apiKey, string $protocol, array $payload): array
    {
        $headers = [
            'Authorization' => 'Bearer '.$apiKey,
            'Content-Type' => 'application/json',
            'Accept' => ($payload['stream'] ?? false) ? 'text/event-stream' : 'application/json',
            'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
            'X-Title' => 'Vibyra',
        ];
        if ($protocol === 'anthropic') {
            $headers['anthropic-version'] = (string) (
                $payload['_vibyraHeaders']['anthropic-version'] ?? '2023-06-01'
            );
            $beta = trim((string) ($payload['_vibyraHeaders']['anthropic-beta'] ?? ''));
            if ($beta !== '') {
                $headers['anthropic-beta'] = $beta;
            }
        }
        return $headers;
    }

    private function geminiNonStreamResponse(array $decoded): array
    {
        $message = (array) ($decoded['choices'][0]['message'] ?? []);
        $parts = [];
        if (is_string($message['content'] ?? null) && $message['content'] !== '') {
            $parts[] = ['text' => $message['content']];
        }
        foreach ((array) ($message['tool_calls'] ?? []) as $call) {
            $arguments = json_decode((string) ($call['function']['arguments'] ?? ''), true);
            $parts[] = ['functionCall' => [
                'id' => (string) ($call['id'] ?? ''),
                'name' => (string) ($call['function']['name'] ?? ''),
                'args' => is_array($arguments) ? $arguments : (object) [],
            ]];
        }
        return [
            'candidates' => [[
                'content' => ['role' => 'model', 'parts' => $parts],
                'finishReason' => 'STOP',
            ]],
            'usageMetadata' => $this->geminiUsage((array) ($decoded['usage'] ?? [])),
        ];
    }

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
