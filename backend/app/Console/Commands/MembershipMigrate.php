<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Membership\Enrollment;
use App\Services\Vibes\Wallet;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MembershipMigrate extends Command
{
    protected $signature = 'vibyra:membership-migrate {user} {--legacy= : Reconciled independent legacy balance} {--apply}';
    protected $description = 'Report or migrate one reconciled account to precise token accounting.';
    public function handle(): int
    {
        $u = User::findOrFail($this->argument('user'));
        $w = DB::table('vibes_wallets')->where('user_id', $u->id)->first();
        $this->line(json_encode(['user' => $u->id, 'version' => $w?->billing_version ?? 1,
            'legacyBalance' => $u->credits_balance, 'walletBalance' => app(Wallet::class)->available($u->id),
            'pendingTurns' => DB::table('vibes_turns')->where('user_id', $u->id)->whereNull('settled_at')->count()]));
        if (!$this->option('apply')) return self::SUCCESS;
        if ($this->option('legacy') === null || !ctype_digit($this->option('legacy'))) {
            $this->error('Reconcile independent legacy value and pass --legacy=N. No change made.'); return self::FAILURE;
        }
        app(Enrollment::class)->migrate($u, (int) $this->option('legacy'));
        $this->info('Migrated. Paid and existing wallet value preserved.'); return self::SUCCESS;
    }
}
