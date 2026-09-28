<?php

namespace App\Console\Commands;

use App\Models\{RemoteSession, User};
use App\Services\Membership\{Entitlements, Units};
use App\Services\Remote\RelayGateway;
use Illuminate\Console\Command;

class MembershipRemoteLeases extends Command
{
    protected $signature = 'vibyra:membership-remote-leases';
    protected $description = 'End only remote client sessions whose membership no longer permits access.';
    public function handle(): int
    {
        RemoteSession::whereNull('ended_at')->whereNotNull('relay_client_id')->with('host')->chunkById(100, function ($sessions) {
            foreach ($sessions as $session) {
                if (!Units::modern($session->user_id)) continue;
                $user = User::find($session->user_id);
                if (!$user || app(Entitlements::class)->for($user)['tier'] !== 'free') continue;
                if ($session->host && app(RelayGateway::class)->disconnect($session->host->host_id, $session->relay_client_id)) {
                    $session->forceFill(['ended_at' => now()])->save();
                }
            }
        });
        return self::SUCCESS;
    }
}
