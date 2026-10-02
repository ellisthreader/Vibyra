<?php

namespace App\Services\Membership;

use App\Models\User;
use App\Services\Vibes\Plans;
use Illuminate\Support\Facades\DB;

final class Snapshot
{
    public function adapt(int $userId, array $payload): array
    {
        if (!Units::modern($userId)) return $payload;
        $w = DB::table('vibes_wallets')->where('user_id', $userId)->first();
        $membership = app(Entitlements::class)->for(User::findOrFail($userId));
        $scale = Units::SCALE;
        $amounts = ['available' => $payload['available'], 'held' => $payload['held'],
            'paidAvailable' => $payload['paidAvailable'], 'total' => $payload['available'] + $payload['held']];
        foreach ($amounts as $key => $value) {
            $payload[$key.'Units'] = (string) $value;
            $payload[$key] = $value / $scale;
        }
        $payload['version'] = 2; $payload['unitScale'] = $scale;
        $payload['accountScope'] = $w->account_token;
        $payload['revision'] = (string) (DB::table('vibes_ledger')->where('user_id', $userId)->max('id') ?? 0);
        $payload['serverTime'] = now()->toIso8601String();
        $payload['promotionalAvailableUnits'] = (string) ($amounts['available'] - $amounts['paidAvailable']);
        $payload['plan'] = $membership['plan']; $payload['paidUntil'] = $membership['paidUntil'];
        $payload['membership'] = $membership;
        $payload['entitlements'] = app(Plans::class)->for($membership['plan']);
        $payload['planEntitlements']['pro_v2'] = app(Plans::class)->for('pro_v2');
        // The app sells through the App Store, so it only sees offers with a product there.
        $payload['products'] = array_values(array_filter(app(Offers::class)->all(), fn ($o) => $o['id'] !== null));
        $payload['purchasesEnabled'] = !$payload['guest'] && config('membership.enabled') && config('membership.apple_enabled')
            && (bool) config('vibes.apple_private_key') && (bool) config('vibes.apple_issuer') && (bool) config('vibes.apple_key_id');
        $payload['salesCapabilities'] = ['apple' => (bool) $payload['purchasesEnabled'],
            'stripe' => (bool) config('legal.paid_sales_enabled') && !$payload['guest'] && (bool) config('membership.enabled') && (bool) config('membership.stripe_enabled')
                && (bool) config('membership.stripe_portal_configuration') && (bool) config('services.stripe.secret') && (bool) config('services.stripe.webhook_secret') && app(Offers::class)->stripeEnvironmentReady()];
        $payload['freeAllowance'] = ['eligible' => $w->free_enrolled_at !== null,
            'tokens' => config('membership.free_tokens'), 'nextAt' => $w->free_next_at,
            'expiresAt' => DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->where('kind', 'trial')->where('remaining', '>', 0)->min('expires_at')];
        $payload['activeProjectKey'] = $w->active_project_key;
        if ($membership['plan'] === 'free') $payload['usedProjects'] = min(1, $payload['usedProjects']);
        $payload['spendPolicy'] = 'balance'; $payload['limits'] = null;
        $payload['trialChatsRemaining'] = 0;
        $payload['trialCredits'] = null; $payload['trialChats'] = null; $payload['trialChatCredits'] = null;
        return $payload;
    }
}
