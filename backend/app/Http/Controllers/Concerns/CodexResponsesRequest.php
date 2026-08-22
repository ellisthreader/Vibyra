<?php
namespace App\Http\Controllers\Concerns;

use App\Services\Billing\{BillingReservationException, ChatCostReservationService, CreditCalculator, OpenRouterPricingCatalog, OpenRouterRequestPolicy, PlanEntitlements, TerminalOutputBudget};
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

trait CodexResponsesRequest {
    public function codexResponses(Request $request): Response {
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
            $requestedOutputTokens = max(800, min(2000, $requestedOutputTokens));
            $requestedOutputTokens = app(PlanEntitlements::class)->boundedOutputTokens(
                $user->plan ?: 'free',
                $inputTokens,
                $requestedOutputTokens,
                800,
            );
            if ($requestedOutputTokens === null) {
                $cap = app(PlanEntitlements::class)->contextTokenCap($user->plan ?: 'free');
                return $this->codexError(
                    "This terminal request exceeds your plan's {$cap}-token context limit.",
                    413,
                    'membership_context_limit',
                    ['contextTokenCap' => $cap],
                );
            }
            $requestCostMultiplier = $this->codexRequestCostMultiplier($payload);
            $maxOutputTokens = app(TerminalOutputBudget::class)->affordableOutputTokens(
                $calc,
                $modelKey,
                $inputTokens,
                $requestedOutputTokens,
                800,
                (int) $user->credits_balance,
                $requestCostMultiplier,
            );
            $payload['max_output_tokens'] = $maxOutputTokens;
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
            $quotaCredits = (int) ceil(
                $calc->estimateTerminalUsageCredits(
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
                        $calc->estimateTerminalReservationCredits(
                            $modelKey,
                            $inputTokens,
                            $maxOutputTokens,
                            true
                        )
                        * $requestCostMultiplier
                    ),
                    (int) ceil(
                        $calc->estimateTerminalReservationUsd(
                            $modelKey,
                            $inputTokens,
                            $maxOutputTokens
                        )
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
}
