<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterRequestPolicy;
use App\Services\Billing\PlanEntitlements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

trait ChatResearchPlan
{
    private const RESEARCH_PLAN_MODEL = 'google/gemini-2.5-flash-lite';
    private const RESEARCH_PLAN_MAX_CHARS = 2000;
    private const RESEARCH_PLAN_MAX_TOKENS = 260;

    public function chatResearchPlan(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        $prompt = trim((string) $request->input('prompt', ''));
        if ($prompt === '') {
            return $this->json(['ok' => false, 'error' => 'Ask Vibyra what to research first.'], 422);
        }
        if (mb_strlen($prompt) > self::RESEARCH_PLAN_MAX_CHARS) {
            return $this->json(['ok' => false, 'error' => 'That research prompt is too long. Trim it before planning.'], 413);
        }

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $calculator = app(CreditCalculator::class);
        $reservations = app(ChatCostReservationService::class);
        $inputTokens = max(1, (int) ceil(mb_strlen($prompt) / 4));
        $maxOutputTokens = app(PlanEntitlements::class)->boundedOutputTokens(
            $user->plan ?: 'free',
            $inputTokens,
            self::RESEARCH_PLAN_MAX_TOKENS,
        );
        if ($maxOutputTokens === null) {
            $cap = app(PlanEntitlements::class)->contextTokenCap($user->plan ?: 'free');
            return $this->json([
                'ok' => false,
                'error' => "This research plan exceeds your plan's {$cap}-token context limit.",
                'code' => 'membership_context_limit',
                'contextTokenCap' => $cap,
            ], 413);
        }
        try {
            $reservation = $reservations->reserve(
                $user,
                'research-plan:'.Str::uuid()->toString(),
                'tool-deep-research',
                max(1, $calculator->estimateCredits(
                    'tool-deep-research',
                    $inputTokens,
                    $maxOutputTokens
                )),
                (int) ceil($calculator->estimateReservationUsd(
                    'tool-deep-research',
                    $inputTokens,
                    $maxOutputTokens
                ) * 1_000_000),
                ['tool' => 'research-plan'],
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
            $response = Http::timeout(20)
                ->acceptJson()
                ->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                ])
                ->post((string) config('services.openrouter.url'), [
                    ...$this->researchPlanPayload($prompt, $maxOutputTokens),
                    'provider' => app(OpenRouterRequestPolicy::class)->provider('tool-deep-research'),
                ]);
        } catch (Throwable) {
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'transport_error_after_dispatch',
                'charge_reserved_estimate' => true,
            ]]);
            return $this->json(['ok' => false, 'error' => 'Could not create a Deep Research plan.'], 502);
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
                ]]);
            }
            $message = $response->json('error.message') ?: $response->json('message') ?: 'OpenRouter could not create a Deep Research plan.';
            return $this->json(['ok' => false, 'error' => $message], $response->status() >= 400 ? $response->status() : 502);
        }

        $content = $this->openRouterCompletionContent($response->json() ?? []);
        $plan = $this->parseResearchPlan($content);
        $ledger = $reservations->settle($reservation, [[
            'billable' => true,
            'outcome' => $plan === null ? 'malformed_response' : 'completed',
            'usage' => $usage,
            'estimated_input_tokens' => $inputTokens,
            'estimated_output_tokens' => $maxOutputTokens,
            'minimum_credits' => 1,
        ]]);
        if ($plan === null) {
            return $this->json(['ok' => false, 'error' => 'OpenRouter returned a malformed Deep Research plan.'], 502);
        }

        return $this->json([
            'ok' => true,
            'title' => $plan['title'],
            'steps' => $plan['steps'],
            'model' => self::RESEARCH_PLAN_MODEL,
            'creditCost' => abs((int) $ledger->credits_delta),
        ]);
    }

    private function researchPlanPayload(string $prompt, int $maxOutputTokens): array
    {
        return [
            'model' => self::RESEARCH_PLAN_MODEL,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => implode(' ', [
                        'Create a concise Deep Research plan for the user request.',
                        'Return only valid JSON with keys title and steps.',
                        'steps must contain exactly five strings.',
                        'The strings must start exactly with Collect, Extract, Analyse, Correlate, and Summarise in that order.',
                        'Every step must be specific to the actual research topic, not generic keyword stuffing.',
                        'Use UK context when the user asks for UK research.',
                        'Each step must be 10 to 22 words.',
                    ]),
                ],
                [
                    'role' => 'user',
                    'content' => Str::limit($prompt, self::RESEARCH_PLAN_MAX_CHARS, ''),
                ],
            ],
            'max_completion_tokens' => $maxOutputTokens,
            'reasoning' => ['exclude' => true],
            'temperature' => 0.2,
            'usage' => ['include' => true],
        ];
    }

    private function parseResearchPlan(string $content): ?array
    {
        $json = trim($content);
        $start = strpos($json, '{');
        $end = strrpos($json, '}');
        if ($start === false || $end === false || $end <= $start) {
            return null;
        }

        $decoded = json_decode(substr($json, $start, $end - $start + 1), true);
        if (! is_array($decoded) || ! is_array($decoded['steps'] ?? null)) {
            return null;
        }

        $steps = $this->normalizeResearchPlanSteps($decoded['steps']);
        if ($steps === null) {
            return null;
        }

        $title = trim((string) ($decoded['title'] ?? 'Deep Research'));
        $title = Str::limit(preg_replace('/\s+/', ' ', $title) ?: 'Deep Research', 80, '');

        return ['title' => $title, 'steps' => $steps];
    }

    private function normalizeResearchPlanSteps(array $rawSteps): ?array
    {
        $verbs = ['Collect', 'Extract', 'Analyse', 'Correlate', 'Summarise'];
        $steps = [];

        foreach ($verbs as $index => $verb) {
            $step = trim((string) ($rawSteps[$index] ?? ''));
            if ($step === '') {
                return null;
            }
            $step = preg_replace('/\s+/', ' ', $step) ?: '';
            $step = preg_replace('/^(Collect|Extract|Analyse|Analyze|Correlate|Summarise|Summarize)\b[:,]?\s*/i', '', $step) ?: $step;
            $step = $verb.' '.$step;
            $step = rtrim($step, " \t\n\r\0\x0B.");
            $steps[] = Str::limit($step, 170, '').'.';
        }

        return $steps;
    }
}
