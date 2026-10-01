<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Membership\ComplimentaryGrant;
use Illuminate\Console\Command;

/**
 * Operator-only (CLI, never a route): give an existing account a clearly labelled complimentary Pro period.
 * Idempotent: an account with an active complimentary or paid period is never granted again.
 */
final class GrantMembership extends Command
{
    protected $signature = 'vibyra:grant-membership {email : An existing account}
        {--days=365 : Length of the complimentary period}
        {--tokens= : Tokens to add (default: Pro monthly tokens for each month)}
        {--note= : Why (kept in the audit row)}
        {--migrate-legacy-wallet : Move a legacy wallet to tokens first (needed once for old accounts)}
        {--dry-run : Show what would happen and write nothing}';
    protected $description = 'Grant an existing account a complimentary Pro membership period (CLI only, audited, never double-grants)';

    public function handle(ComplimentaryGrant $grants): int
    {
        $days = (int) $this->option('days');
        if ($days < 1 || $days > 730) { $this->error('--days must be between 1 and 730.'); return self::FAILURE; }
        $tokens = $this->option('tokens') === null ? null : (int) $this->option('tokens');
        if ($tokens !== null && ($tokens < 0 || $tokens > 20000)) { $this->error('--tokens must be between 0 and 20000.'); return self::FAILURE; }
        $user = User::query()->whereRaw('lower(email) = ?', [mb_strtolower(trim((string) $this->argument('email')))])->first();
        if (! $user) { $this->error('No account with that email.'); return self::FAILURE; }
        $this->line('USER_ID='.$user->id);
        $dry = (bool) $this->option('dry-run');
        $result = $dry ? $grants->plan($user, $days, $tokens)
            : $grants->apply($user, $days, $tokens, (string) $this->option('note'), (bool) $this->option('migrate-legacy-wallet'));
        $this->line(sprintf('%swallet=%s days=%d tokens=%s until=%s', $dry ? '[dry-run] ' : '', $result['walletModern'] ? 'tokens' : 'legacy', $days, $result['tokens'], $result['endsAt']));
        if ($result['refusal'] === 'already_granted') { $this->info('Already granted until '.$result['existing'].'. Nothing changed.'); $this->printState($grants, $user); return self::SUCCESS; }
        if ($result['refusal']) { $this->error('Refused: '.$result['refusal'].($result['existing'] ? ' ('.$result['existing'].')' : '').'.'); return self::FAILURE; }
        if ($dry && ! $result['walletModern']) $this->warn('Legacy wallet: a real run needs --migrate-legacy-wallet.');
        $this->info($dry ? 'Would grant a complimentary Pro period.' : 'Granted. Reference '.$result['reference']);
        if (! $dry) $this->printState($grants, $user);
        return self::SUCCESS;
    }

    private function printState(ComplimentaryGrant $grants, User $user): void
    {
        $s = $grants->state($user);
        $this->line(sprintf('STATE plan=%s tier=%s provider=%s paidUntil=%s tokens=%s', $s['plan'], $s['tier'], $s['provider'], $s['paidUntil'], $s['availableTokens']));
    }
}
