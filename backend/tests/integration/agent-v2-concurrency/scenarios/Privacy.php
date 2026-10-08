<?php
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Scenario 19 (roadmap Part 19): "Download my data" admission (one export per account per day under racing requests), deleting a
 * run's history from many processes at once, and an account deletion racing live journal appends (no event or receipt may be
 * left behind once the user row cascades the runs away).
 */
final class ConcPrivacy
{
    public static function run(): void
    {
        Conc::$scenario = '19 privacy';
        self::exportAdmission();
        self::historyDelete();
        self::deletionVersusAppends();
    }

    private static function post(array $fx, int $i): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/account/export', 'token' => $fx['token'], 'headers' => ['X-Conc-Ip' => 'exp-'.$fx['user'].'-'.$i]];
    }

    private static function exportAdmission(): void
    {
        $a = ConcFixture::make(false);
        $b = ConcFixture::make(false);
        // Two accounts at once, eight requests each (a double click, two devices, a retrying client): one admitted per account.
        $race = ConcRace::run(array_merge(array_map(fn ($i) => self::post($a, $i), range(1, 8)), array_map(fn ($i) => self::post($b, $i), range(1, 8))));
        Conc::check('16 racing export requests from two accounts: exactly one admitted each (2 x 202), the other 14 refused export_rate_limited',
            Conc::tally($race) === ['202' => 2, '429:export_rate_limited' => 14], Conc::fmt(Conc::tally($race)));
        Conc::check('and exactly one export row exists per account, each recorded once in the activity log',
            DB::table('account_exports')->where('user_id', $a['user'])->count() === 1 && DB::table('account_exports')->where('user_id', $b['user'])->count() === 1
            && DB::table('account_audit_events')->where('event', 'data_export.requested')->whereIn('user_id', [$a['user'], $b['user']])->count() === 2,
            'rows='.DB::table('account_exports')->whereIn('user_id', [$a['user'], $b['user']])->count());
        // A build that failed does not use up the day: racing again admits exactly one more.
        DB::table('account_exports')->where('user_id', $a['user'])->update(['status' => 'failed', 'error' => 'build_failed']);
        $race = ConcRace::run(array_map(fn ($i) => self::post($a, 20 + $i), range(1, 8)));
        Conc::check('after that build failed, 8 more racing requests admit exactly one (the failed one never counted)',
            Conc::tally($race) === ['202' => 1, '429:export_rate_limited' => 7] && DB::table('account_exports')->where('user_id', $a['user'])->count() === 2, Conc::fmt(Conc::tally($race)));
        // Past the day, the same account may ask again.
        DB::table('account_exports')->where('user_id', $b['user'])->update(['requested_at' => now()->subHours(25)]);
        $race = ConcRace::run(array_map(fn ($i) => self::post($b, 40 + $i), range(1, 8)));
        Conc::check('a day later, 8 racing requests admit exactly one again', Conc::tally($race) === ['202' => 1, '429:export_rate_limited' => 7], Conc::fmt(Conc::tally($race)));
    }

    /** A finished run with $events journal rows and one receipt. */
    private static function finished(array $fx, int $events): string
    {
        $run = ConcFixture::admit($fx, 'History '.Str::random(5));
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'completed', 'finished_at' => now()]);
        DB::table('agent_run_events')->insert(array_map(fn ($i) => ['run_id' => $run['id'], 'seq' => 1000 + $i, 'type' => 'run.note', 'payload' => '{}',
            'source' => 'server', 'created_at' => now()], range(1, $events)));
        $action = (string) Str::uuid();
        DB::table('agent_tool_actions')->insert(['id' => $action, 'run_id' => $run['id'], 'user_id' => $fx['user'], 'call_id' => 'c1', 'tool' => 'gmail_read', 'kind' => 'read',
            'connection_id' => (string) Str::uuid(), 'connection_generation' => 1, 'grant_id' => (string) Str::uuid(), 'grant_revision' => 1, 'arguments' => '{"q":"x"}',
            'args_hash' => str_repeat('a', 64), 'schema_revision' => '1', 'state' => 'done', 'result' => '{"r":1}', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_receipts')->insert(['id' => (string) Str::uuid(), 'run_id' => $run['id'], 'action_id' => $action, 'status' => 'confirmed', 'created_at' => now(), 'updated_at' => now()]);
        return $run['id'];
    }

    private static function historyDelete(): void
    {
        $fx = ConcFixture::make(false);
        $id = self::finished($fx, 60);
        $before = DB::table('agent_run_events')->where('run_id', $id)->count();
        $race = ConcRace::run(array_map(fn ($i) => ['op' => 'call', 'method' => 'DELETE', 'uri' => '/api/account/runs/'.$id.'/history', 'token' => $fx['token'],
            'headers' => ['X-Conc-Ip' => 'del-'.$i]], range(1, 8)));
        $events = array_sum(array_map(fn ($r) => (int) ($r['result']['json']['events'] ?? 0), $race));
        $receipts = array_sum(array_map(fn ($r) => (int) ($r['result']['json']['receipts'] ?? 0), $race));
        Conc::check('8 racing deletes of one run\'s history: all answer 200 and the rows are removed exactly once between them (no double count, no error)',
            Conc::tally($race) === ['200' => 8] && $events === $before && $receipts === 1, 'before='.$before.' removed='.$events.'/'.$receipts.' '.Conc::fmt(Conc::tally($race)));
        Conc::check('afterwards no journal row, receipt or tool argument is left, and the run itself stays',
            DB::table('agent_run_events')->where('run_id', $id)->count() === 0 && DB::table('agent_receipts')->where('run_id', $id)->count() === 0
            && DB::table('agent_tool_actions')->where('run_id', $id)->value('arguments') === '{}' && DB::table('agent_runs')->where('id', $id)->exists());
    }

    private static function deletionVersusAppends(): void
    {
        $fx = ConcFixture::make(false);
        $runs = [ConcFixture::admit($fx, 'Live one')['id'], ConcFixture::admit($fx, 'Live two', null, ConcFixture::teammate($fx, null))['id']];
        $finished = self::finished($fx, 5);
        $jobs = array_map(fn ($i) => ['op' => 'privacy_append', 'runs' => $runs, 'count' => 300], range(1, 4));
        $jobs[] = ['op' => 'account_delete', 'user' => $fx['user'], 'delayMs' => 60];
        $race = ConcRace::run($jobs, 0, 180);
        $all = [...$runs, $finished];
        $orphans = DB::table('agent_run_events')->whereIn('run_id', $all)->count() + DB::table('agent_receipts')->whereIn('run_id', $all)->count();
        $deleted = (bool) ($race[4]['result']['deleted'] ?? false);
        Conc::check('an account deleted while 4 processes append to its live runs: the deletion succeeds and the user, runs, journals and receipts are all gone',
            $deleted && !DB::table('users')->where('id', $fx['user'])->exists() && DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 0 && $orphans === 0,
            'deleted='.($deleted ? 'yes' : 'no').' orphan rows='.$orphans.' appended='.implode('/', array_map(fn ($r) => $r['result']['appended'] ?? '?', array_slice($race, 0, 4))));
    }
}
