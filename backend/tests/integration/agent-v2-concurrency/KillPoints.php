<?php
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Support\Facades\{DB, Event};

/**
 * Test-only kill points. A harness process arms one with an environment variable (set by the scenario when it starts that
 * process); the app code has no hook, and a process without the variable is untouched.
 */
final class ConcKill
{
    public static function install(): void
    {
        if (getenv('CONC_KILL_BEFORE_DISPATCH')) self::beforeDispatch();
    }

    /**
     * kill -9 this process in the gap between the approval commit and the dispatch claim. `Approvals::decide` appends
     * `approval.decided` inside its transaction and commits it; the next OUTERMOST transaction to begin (level 1 again, nested
     * ones such as `Events::append` are deeper) is `Approvals::dispatch` opening the claim. The kill lands between the two.
     */
    private static function beforeDispatch(): void
    {
        $decided = false;
        DB::beforeExecuting(function (string $sql, array $bindings) use (&$decided) {
            if (str_starts_with($sql, 'insert into "agent_run_events"') && in_array('approval.decided', $bindings, true)) $decided = true;
        });
        Event::listen(TransactionBeginning::class, function () use (&$decided) {
            if ($decided && DB::transactionLevel() === 1) posix_kill(getmypid(), SIGKILL);
        });
    }
}
