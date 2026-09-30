<?php
namespace App\Console\Commands;
use App\Services\Remote\RemoteRevocations;
use Illuminate\Console\Command;
class RemoteRevocationsDeliver extends Command {
    protected $signature = 'vibyra:remote-revocations';
    protected $description = 'Retry durable Cloud revocation delivery independently of AI jobs.';
    public function handle(RemoteRevocations $revocations): int {
        $revocations->deliver();
        // Proofs are useful for no more than two minutes; retain one day for diagnostics.
        \Illuminate\Support\Facades\DB::table('remote_identity_challenges')->where('expires_at', '<', now()->subDay())->delete();
        return self::SUCCESS;
    }
}
