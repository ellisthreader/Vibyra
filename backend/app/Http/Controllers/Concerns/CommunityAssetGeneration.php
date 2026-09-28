<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\CommunityAssetGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

trait CommunityAssetGeneration
{
    public function generateCommunityAsset(
        Request $request,
        CommunityAssetGenerator $generator,
        ChatCostReservationService $reservations
    ): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $kind = (string) $request->input('kind', 'logo');
        if (! in_array($kind, ['logo', 'screenshot'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose logo or screenshot generation.'], 422);
        }

        $cost = $kind === 'screenshot' ? 20 : 12;
        $title = Str::limit(trim((string) $request->input('title', 'Vibyra project')), 90, '');
        $description = Str::limit(trim((string) $request->input('description', '')), 420, '');
        $prompt = Str::limit(trim((string) $request->input('prompt', '')), 600, '');
        $this->moderation->assertModerationInputAllowed([
            'text' => trim($title.' '.$description.' '.$prompt), 'images' => [],
        ], 'community.asset.generate', false);
        if (! config('services.openrouter.key')) {
            return $this->json([
                'ok' => false,
                'error' => 'OpenRouter image generation is not configured. Set OPENROUTER_API_KEY to generate publish images.',
            ], 502);
        }

        try {
            $reservation = $reservations->reserve(
                $user,
                'community-image:'.Str::uuid()->toString(),
                'community-image',
                $cost,
                (int) ceil((float) config(
                    "billing.openrouter_pricing.community_image_reservation_usd.{$kind}",
                    $kind === 'screenshot' ? 0.25 : 0.15
                ) * 1_000_000),
                ['kind' => $kind],
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
            $result = $generator->generate($kind, $title, $description, $prompt);
        } catch (RuntimeException $error) {
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'provider_error_after_dispatch',
                'charge_reserved_estimate' => true,
            ]]);
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 502);
        }

        $ledger = $reservations->settle($reservation, [[
            'billable' => true,
            'outcome' => 'completed',
            'usage' => (array) ($result['usage'] ?? []),
            'minimum_credits' => $cost,
        ]], ['provider' => $result['provider']]);
        $user->refresh();

        return $this->json([
            'ok' => true,
            'kind' => $kind,
            'imageUrl' => $result['imageUrl'],
            'provider' => $result['provider'],
            'creditCost' => abs((int) $ledger->credits_delta),
            'creditsBalance' => (int) $user->credits_balance,
            'user' => $this->userPayload($user),
        ]);
    }
}
