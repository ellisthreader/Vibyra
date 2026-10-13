<?php

namespace App\Console\Commands;

use App\Services\Account\AppleRevocationQueue;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class RevokeDeletedAppleAccounts extends Command
{
    protected $signature = 'vibyra:revoke-deleted-apple-accounts {--limit=20}';
    protected $description = 'Retry encrypted Sign in with Apple revocations after committed account deletion';

    public function handle(AppleRevocationQueue $queue): int
    {
        $ids = DB::table('apple_account_revocations')->where('status', 'pending')
            ->where('next_attempt_at', '<=', now())->orderBy('id')
            ->limit(max(1, min(100, (int) $this->option('limit'))))->pluck('user_id');
        foreach ($ids as $id) $queue->process((int) $id);
        return self::SUCCESS;
    }
}
