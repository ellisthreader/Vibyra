<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use App\Services\Billing\PlanEntitlements;

trait ChatEndpointHelpers
{
    use ChatReplyGuard;
    use ChatLearningMemory;
    use ChatAttachmentHelpers;
    use ChatOpenRouterHelpers;
    use ChatPreviewAppHelpers;

    private function enforceChatRateLimit(Request $request, int $userId, string $plan): ?JsonResponse
    {
        $perMinute = (int) config("billing.plans.{$plan}.rate_per_minute", 12);
        $perHour = (int) config("billing.plans.{$plan}.rate_per_hour", 200);
        $perIp = self::CHAT_PER_IP_PER_MINUTE;

        $perMinuteKey = "chat:user:{$userId}:1m";
        $perHourKey = "chat:user:{$userId}:1h";
        $perIpKey = 'chat:ip:' . sha1((string) $request->ip()) . ':1m';

        $limits = [
            [$perMinuteKey, $perMinute, 60, 'You are sending messages too fast. Wait a moment and try again.'],
            [$perHourKey, $perHour, 3600, 'Hourly chat limit reached. Try again later.'],
            [$perIpKey, $perIp, 60, 'Too many chat requests from this network. Wait a moment and try again.'],
        ];

        foreach ($limits as [$key, $max, $window, $message]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $retry = RateLimiter::availableIn($key);
                return $this->json([
                    'ok' => false,
                    'error' => $message,
                    'retryAfter' => $retry,
                ], 429);
            }
            RateLimiter::hit($key, $window);
        }

        return null;
    }

    private function contextLimitResponse(string $plan): JsonResponse
    {
        $cap = app(PlanEntitlements::class)->contextTokenCap($plan);

        return $this->json([
            'ok' => false,
            'error' => "This request exceeds your plan's {$cap}-token context limit. Reduce attached context or upgrade your plan.",
            'code' => 'membership_context_limit',
            'contextTokenCap' => $cap,
        ], 413);
    }

}
