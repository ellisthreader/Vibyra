<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\CreditDeductor;
use App\Services\CommunityAssetGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

trait CommunityAssetGeneration
{
    public function generateCommunityAsset(Request $request, CommunityAssetGenerator $generator, CreditDeductor $credits): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $kind = (string) $request->input('kind', 'logo');
        if (! in_array($kind, ['logo', 'screenshot'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose logo or screenshot generation.'], 422);
        }

        $cost = $kind === 'screenshot' ? 4 : 2;
        $title = Str::limit(trim((string) $request->input('title', 'Vibyra project')), 90, '');
        $description = Str::limit(trim((string) $request->input('description', '')), 420, '');
        $prompt = Str::limit(trim((string) $request->input('prompt', '')), 600, '');
        $this->moderation->assertModerationInputAllowed([
            'text' => trim($title.' '.$description.' '.$prompt), 'images' => [],
        ], 'community.asset.generate', false);

        $credits->maybeResetDaily($user);
        if ((int) $user->credits_balance < $cost) {
            return $this->json(['ok' => false, 'error' => "Generating this {$kind} costs {$cost} credits."], 402);
        }
        if ((int) $user->daily_credits_used + $cost > $credits->dailyCap($user)) {
            return $this->json(['ok' => false, 'error' => 'Daily credit cap reached. Try again tomorrow.'], 429);
        }

        try {
            $result = $generator->generate($kind, $title, $description, $prompt);
        } catch (RuntimeException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 502);
        }

        $ledger = $credits->spend($user, $cost, 'image_generate', 'community-image:'.(string) Str::uuid(), [
            'kind' => $kind,
            'provider' => $result['provider'],
        ]);

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
