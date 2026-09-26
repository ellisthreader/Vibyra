<?php

namespace App\Console\Commands;

use App\Services\Vibes\{AppleStore, Purchases};
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReconcileVibesPurchases extends Command
{
    protected $signature = 'vibyra:reconcile-vibes-purchases';
    protected $description = 'Recover Apple renewals and refunds from the authoritative store API';

    public function handle(AppleStore $apple, Purchases $purchases): int
    {
        $failed = 0;
        // History v2 includes missed renewals and finished consumables. One scan per
        // account avoids repeating its full history for every purchased transaction.
        DB::table('vibes_purchases')->selectRaw('user_id, MIN(transaction_id) as transaction_id')->groupBy('user_id')
            ->orderBy('user_id')->chunk(100, function ($rows) use ($apple, $purchases, &$failed) {
            foreach ($rows as $row) {
                try {
                    $wallet = DB::table('vibes_wallets')->where('user_id', $row->user_id)->firstOrFail();
                    foreach ($apple->history($row->transaction_id) as $t) {
                        if (isset(config('vibes.products')[$t['productId'] ?? ''])
                            && strtolower($t['appAccountToken'] ?? '') === strtolower($wallet->account_token)) $purchases->apply($row->user_id, $t);
                    }
                } catch (Throwable) { $failed++; }
            }
        });
        $this->info('Purchase reconciliation completed; retryable failures: '.$failed);
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
