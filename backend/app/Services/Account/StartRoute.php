<?php
namespace App\Services\Account;

use App\Models\User;
use App\Services\CloudComputer\Computers;
use App\Services\Membership\Entitlements;
use App\Services\Remote\RemoteAccess;

/**
 * Where the phone starts (docs/start-route-contract.md), decided from the account alone:
 * - `connect`: no Mac has ever signed into this account, so the phone can do nothing yet;
 * - `cloud`: Vibyra Cloud is on (Pro or trial) and holds at least one synced project the person allowed;
 * - `mac`: everything else with a Mac; a Free account reaches it on the same Wi-Fi.
 */
final class StartRoute
{
    public function for(User $user): array
    {
        $macs = app(LinkedMacs::class)->list($user->id);
        $plan = app(Entitlements::class)->for($user);
        $cloud = $this->cloud($user);
        $route = $macs === [] ? 'connect' : ($cloud['ready'] ? 'cloud' : 'mac');
        return ['route' => $route, 'macs' => $macs,
            'plan' => ['tier' => $plan['tier'], 'trial' => (bool) ($plan['trial'] ?? false), 'endsAt' => self::iso($plan['paidUntil'] ?? null)],
            'remoteEntitled' => app(RemoteAccess::class)->availability($user)['entitled'], 'cloud' => $cloud];
    }

    /** Only the route, for the session payload; never fails sign-in. */
    public function routeOnly(User $user): ?string
    {
        try { return $this->for($user)['route']; } catch (\Throwable $e) { report($e); return null; }
    }

    private function cloud(User $user): array
    {
        $p = app(Computers::class)->payload($user->id);
        $synced = array_values(array_filter($p['computer']['projects'] ?? [], fn ($x) => ($x['allowed'] ?? false) && ($x['syncedAt'] ?? null) !== null));
        $enabled = (bool) $p['enabled']; $connected = (bool) $p['connected'];
        return ['enabled' => $enabled, 'connected' => $connected, 'ready' => $enabled && $connected && $synced !== [], 'projects' => count($synced)];
    }

    private static function iso($at): ?string
    {
        return $at ? \Illuminate\Support\Carbon::parse($at)->toIso8601String() : null;
    }
}
