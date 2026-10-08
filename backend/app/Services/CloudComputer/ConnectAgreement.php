<?php
namespace App\Services\CloudComputer;

use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Serialize complete agreements with account withdrawal and wake; no partially kept consent or choices. */
final class ConnectAgreement
{
    public function checkVersion(int $version): void
    {
        $current = app(ConnectConsent::class)->current();
        if ($version !== $current) Computers::fail('consent_outdated',
            'The cloud terms changed. Read them again to connect.', 409, ['current' => $current]);
    }

    public function accept(int $user, int $version, string $source, Request $request, ConnectSelections $choices, ?callable $proof = null): object
    {
        return DB::transaction(function () use ($user, $version, $source, $request, $choices, $proof) {
            app(Wallet::class)->lock($user);
            $this->checkVersion($version);
            if ($proof) $proof();
            // Entitlement and spend guards run before keeping any agreement or choices.
            $w = app(Computers::class)->create($user, (string) Str::uuid(), 'Cloud');
            app(ConnectConsent::class)->record($user, $version, $source, $request);
            $choices->apply($user, $source);
            DB::table('cloud_workspaces')->where('id', $w->id)->whereNull('terms_accepted_at')
                ->update(['terms_accepted_at' => now(), 'updated_at' => now()]);
            DB::table('cloud_workspaces')->where('id', $w->id)->whereIn('state', ['stopped', 'archived', 'expired'])
                ->whereIn('stop_reason', Computers::START_FAILED)->update(['stop_reason' => null, 'updated_at' => now()]);
            return $w;
        }, 5);
    }
}
