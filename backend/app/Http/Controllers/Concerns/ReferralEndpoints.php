<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Referrals\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait ReferralEndpoints
{
    public function referralSummary(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json([
            'ok' => true,
            'referral' => app(ReferralService::class)->summary($user),
        ]);
    }
}
