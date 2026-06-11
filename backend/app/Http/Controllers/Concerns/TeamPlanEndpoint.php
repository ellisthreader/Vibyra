<?php

namespace App\Http\Controllers\Concerns;

use App\Services\AI\TeamAssignmentPlanner;
use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterRequestPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use InvalidArgumentException;
use LengthException;
use Throwable;

trait TeamPlanEndpoint
{
    public function chatTeamPlan(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $planner = app(TeamAssignmentPlanner::class);

        try {
            $plannerRequest = $planner->normalizeRequest($request->all());
        } catch (LengthException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 413);
        } catch (InvalidArgumentException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 422);
        }

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $calculator = app(CreditCalculator::class);
        $reservations = app(ChatCostReservationService::class);
        $modelSlug = $calculator->resolveSlug('team-plan');
        $payload = $planner->payload($plannerRequest, $modelSlug);
        $inputTokens = $planner->estimatedInputTokens($payload);
        $estimatedCredits = max(1, $calculator->estimateCredits(
            'team-plan',
            $inputTokens,
            TeamAssignmentPlanner::MAX_OUTPUT_TOKENS
        ));
        $estimatedMicroUsd = (int) ceil($calculator->estimateReservationUsd(
            'team-plan',
            $inputTokens,
            TeamAssignmentPlanner::MAX_OUTPUT_TOKENS
        ) * 1_000_000);

        try {
            $reservation = $reservations->reserve(
                $user,
                'team-plan:'.Str::uuid()->toString(),
                'team-plan',
                $estimatedCredits,
                $estimatedMicroUsd,
                [
                    'operation' => 'team-plan',
                    'preferred_model' => TeamAssignmentPlanner::MODEL_KEY,
                    'selected_model' => $modelSlug,
                    'schema_version' => 'vibyra.team-plan.v1',
                ],
            );
        } catch (BillingReservationException $error) {
            return $this->json([
                'ok' => false,
                'error' => $error->getMessage(),
                'code' => $error->errorCode,
            ], $error->status);
        }

        try {
            $reservations->markProviderStarted($reservation);
            $response = Http::timeout(6)
                ->acceptJson()
                ->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                ])
                ->post((string) config('services.openrouter.url'), [
                    ...$payload,
                    'provider' => app(OpenRouterRequestPolicy::class)->provider('team-plan'),
                ]);
        } catch (Throwable) {
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'transport_error_after_dispatch',
                'charge_reserved_estimate' => true,
            ]], ['operation' => 'team-plan', 'validation_error' => 'transport']);

            return $this->json([
                'ok' => false,
                'error' => 'Could not create the Team plan.',
                'code' => 'team_plan_transport_error',
            ], 502);
        }

        $usage = (array) ($response->json('usage') ?? []);
        if (! $response->successful()) {
            if ($usage === []) {
                $reservations->release($reservation, 'provider_error_without_usage');
            } else {
                $reservations->settle($reservation, [[
                    'billable' => true,
                    'outcome' => 'provider_error',
                    'usage' => $usage,
                ]], ['operation' => 'team-plan']);
            }

            return $this->json([
                'ok' => false,
                'error' => 'The Team planner provider rejected the request.',
                'code' => 'team_plan_provider_error',
            ], $response->status() >= 400 ? $response->status() : 502);
        }

        $content = $this->openRouterCompletionContent($response->json() ?? []);
        try {
            $proposal = $planner->normalizeProposal($content, $plannerRequest['roles']);
        } catch (InvalidArgumentException $error) {
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'invalid_schema',
                'usage' => $usage,
                'estimated_input_tokens' => $inputTokens,
                'estimated_output_tokens' => TeamAssignmentPlanner::MAX_OUTPUT_TOKENS,
                'minimum_credits' => 1,
            ]], [
                'operation' => 'team-plan',
                'validation_error' => 'invalid_schema',
            ]);

            return $this->json([
                'ok' => false,
                'error' => 'The Team planner returned an invalid proposal.',
                'code' => 'invalid_team_plan',
            ], 502);
        }

        $ledger = $reservations->settle($reservation, [[
            'billable' => true,
            'outcome' => 'completed',
            'usage' => $usage,
            'estimated_input_tokens' => $inputTokens,
            'estimated_output_tokens' => TeamAssignmentPlanner::MAX_OUTPUT_TOKENS,
            'minimum_credits' => 1,
        ]], [
            'operation' => 'team-plan',
            'attempt_count' => 1,
            'schema_version' => $proposal['schemaVersion'],
        ]);

        return $this->json([
            'ok' => true,
            'untrusted' => true,
            'proposal' => $proposal,
            'model' => TeamAssignmentPlanner::MODEL_KEY,
            'creditCost' => abs((int) $ledger->credits_delta),
        ]);
    }
}
