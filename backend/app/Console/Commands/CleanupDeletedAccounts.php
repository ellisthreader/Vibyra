<?php

namespace App\Console\Commands;

use App\Services\Account\AccountDeletion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class CleanupDeletedAccounts extends Command
{
    protected $signature = 'vibyra:cleanup-deleted-accounts {--limit=50}';

    protected $description = 'Retry deleted-account storage and Stripe cancellation';

    public function handle(AccountDeletion $deletion): int
    {
        $limit = max(1, min(500, (int) $this->option('limit')));
        $rows = DB::table('account_deletion_cleanups')->where('status', 'pending')
            ->where(fn ($query) => $query->whereNull('next_attempt_at')
                ->orWhere('next_attempt_at', '<=', now()))
            ->orderBy('id')->limit($limit)->pluck('user_id');
        foreach ($rows as $userId) {
            $deletion->cleanPending((int) $userId);
        }

        return self::SUCCESS;
    }
}
