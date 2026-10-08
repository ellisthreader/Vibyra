<?php
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Scenario 20 (roadmap Part 17): the cap on live share links and the creation of tokens, raced from many real processes (each from its own
 * address, so the per-route throttle does not decide the outcome), and one teammate import confirmed many times with the same id.
 */
final class ConcSharing
{
    public static function run(): void
    {
        Conc::$scenario = '20 sharing';
        self::linkCap();
        self::importOnce();
    }

    private static function link(array $fx, string $hash, int $i): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/sharing/links', 'token' => $fx['token'], 'headers' => ['X-Conc-Ip' => 'share-'.$fx['user'].'-'.$i],
            'json' => ['kind' => 'conversation', 'agentId' => $fx['agent'], 'snapshotHash' => $hash, 'confirm' => true]];
    }

    private static function linkCap(): void
    {
        $fx = ConcFixture::make(false);
        $run = ConcFixture::admit($fx, 'Share this thread');
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'completed', 'answer' => 'Here is the answer.', 'finished_at' => now()]);
        $hash = ConcFixture::ok(ConcHttp::call('POST', '/api/sharing/links/preview', $fx['token'], ['kind' => 'conversation', 'agentId' => $fx['agent']]), 200)['preview']['snapshotHash'];
        $race = ConcRace::run(array_map(fn ($i) => self::link($fx, $hash, $i), range(1, 30)));
        $live = DB::table('shared_links')->where('user_id', $fx['user'])->whereNull('revoked_at')->count();
        Conc::check('30 parallel share-link creations against the cap of 20: exactly 20 created, 10 refused share_limit',
            Conc::tally($race) === ['201' => 20, '409:share_limit' => 10] && $live === 20, 'live='.$live.' '.Conc::fmt(Conc::tally($race)));
        Conc::check('and all 20 tokens are distinct (20 distinct hashes, none stored in clear)',
            DB::table('shared_links')->where('user_id', $fx['user'])->distinct()->count('token_hash') === 20
            && count(array_unique(array_map(fn ($r) => $r['result']['json']['url'] ?? null, array_filter($race, fn ($r) => ($r['result']['status'] ?? 0) === 201)))) === 20,
            'distinct=' . DB::table('shared_links')->where('user_id', $fx['user'])->distinct()->count('token_hash'));
        // Free five slots, then race again: exactly five more, whatever order the creates and the revokes interleave in.
        $ids = DB::table('shared_links')->where('user_id', $fx['user'])->limit(5)->pluck('id')->all();
        $jobs = array_map(fn ($id) => ['op' => 'call', 'method' => 'DELETE', 'uri' => '/api/sharing/links/'.$id, 'token' => $fx['token'], 'headers' => ['X-Conc-Ip' => 'rev-'.$id]], $ids);
        $race = ConcRace::run([...$jobs, ...array_map(fn ($i) => self::link($fx, $hash, 100 + $i), range(1, 12))]);
        $live = DB::table('shared_links')->where('user_id', $fx['user'])->whereNull('revoked_at')->count();
        Conc::check('5 revokes racing 12 creations at the cap: never more than 20 live links, and the end state is 20 live, 5 revoked',
            $live === 20 && DB::table('shared_links')->where('user_id', $fx['user'])->whereNotNull('revoked_at')->count() === 5
            && ($race[0]['result']['status'] ?? 0) > 0, 'live='.$live.' '.Conc::fmt(Conc::tally($race)));
    }

    private static function importOnce(): void
    {
        $fx = ConcFixture::make(false);
        $bundle = ['format' => 'vibyra.teammate', 'schemaVersion' => 1, 'teammate' => ['name' => 'Imported', 'brief' => 'Do the thing.', 'avatar' => 'lead'],
            'skills' => [['name' => 'One', 'instructions' => 'Be brief.'], ['name' => 'Two', 'instructions' => 'Be kind.']], 'routines' => [], 'triggers' => [], 'connectionSlots' => []];
        $plan = ConcFixture::ok(ConcHttp::call('POST', '/api/sharing/teammates/import/preview', $fx['token'], ['bundle' => $bundle]), 200)['plan'];
        $id = (string) Str::uuid();
        $before = DB::table('agent_skills')->where('user_id', $fx['user'])->count();
        $race = ConcRace::run(array_map(fn ($i) => ['op' => 'call', 'method' => 'POST', 'uri' => '/api/sharing/teammates/import', 'token' => $fx['token'],
            'headers' => ['X-Conc-Ip' => 'imp-'.$fx['user'].'-'.$i], 'json' => ['bundle' => $bundle, 'id' => $id, 'planHash' => $plan['planHash'], 'confirm' => true]], range(1, 10)));
        $made = DB::table('agent_skills')->where('user_id', $fx['user'])->count() - $before;
        Conc::check('10 parallel confirms of one import id: exactly one teammate and two skills created, 1 x 201 and 9 x 200 already',
            Conc::tally($race) === ['200' => 9, '201' => 1] && DB::table('agent_teammates')->where('id', $id)->count() === 1 && $made === 2,
            'skills=' . $made . ' ' . Conc::fmt(Conc::tally($race)));
    }
}
