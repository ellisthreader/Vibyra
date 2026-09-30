<?php
use Illuminate\Support\Facades\DB;

/** Scenario 1: duplicate and conflicting admissions, and serial conversation numbering under parallel sends. */
final class ConcAdmission
{
    public static function run(): void
    {
        Conc::$scenario = '1 admission';
        self::sameKeySameBody();
        self::sameKeyDifferentBody();
        self::distinctKeys();
    }

    private static function post(array $fx, string $key, string $prompt): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs', 'token' => $fx['token'],
            'json' => ['agentId' => $fx['agent'], 'idempotencyKey' => $key, 'prompt' => $prompt]];
    }

    private static function sameKeySameBody(): void
    {
        $fx = ConcFixture::make(false);
        $key = 'dup-'.bin2hex(random_bytes(6));
        $race = ConcRace::run(array_fill(0, 20, self::post($fx, $key, 'Summarize my inbox.')), 0);
        $t = Conc::tally($race);
        $runs = DB::table('agent_runs')->where('user_id', $fx['user'])->where('idempotency_key', $key)->get();
        $ids = array_unique(array_map(fn ($r) => $r['result']['json']['run']['id'] ?? '?', $race));
        Conc::check('20 parallel admissions, same key + body: exactly one run row', $runs->count() === 1, 'rows='.$runs->count().' responses: '.Conc::fmt($t));
        Conc::check('…one 201 created, nineteen 200 replays, all name the same run', ($t['201'] ?? 0) === 1 && ($t['200'] ?? 0) === 19 && count($ids) === 1, 'distinct run ids='.count($ids));
        $events = DB::table('agent_run_events')->where('run_id', $runs[0]->id)->where('type', 'run.admitted')->count();
        Conc::check('…journal has exactly one run.admitted and event_seq=1', $events === 1 && (int) $runs[0]->event_seq === 1, 'admitted events='.$events.' event_seq='.$runs[0]->event_seq);
    }

    private static function sameKeyDifferentBody(): void
    {
        $wins = ['A' => 0, 'B' => 0];
        $ok = true;
        $detail = [];
        for ($round = 0; $round < 6; $round++) {
            $fx = ConcFixture::make(false);
            $key = 'conflict-'.bin2hex(random_bytes(6));
            $jobs = array_map(fn ($i) => self::post($fx, $key, $i < 10 ? 'Body A: summarize mail.' : 'Body B: draft a reply.'), range(0, 19));
            shuffle($jobs);
            $race = ConcRace::run($jobs, 3);
            $runs = DB::table('agent_runs')->where('user_id', $fx['user'])->where('idempotency_key', $key)->get();
            $winner = str_starts_with($runs[0]->prompt ?? '', 'Body A') ? 'A' : 'B';
            $wins[$winner]++;
            $t = Conc::tally($race);
            $expect409 = 10;
            $ok = $ok && $runs->count() === 1 && ($t['201'] ?? 0) === 1 && ($t['200'] ?? 0) === 9 && ($t['409:idempotency_conflict'] ?? 0) === $expect409 && count($t) === 3;
            $detail[] = $winner.': '.Conc::fmt($t);
        }
        Conc::check('6 rounds of 10×body A + 10×body B on one key: one run, winner\'s body replays, the other body always 409 idempotency_conflict',
            $ok, 'winners A='.$wins['A'].' B='.$wins['B'].'; '.implode(' | ', array_slice($detail, 0, 2)));
    }

    private static function distinctKeys(): void
    {
        $fx = ConcFixture::make(false);
        $jobs = array_map(fn ($i) => self::post($fx, 'serial-'.$i.'-'.bin2hex(random_bytes(4)), 'Task '.$i), range(0, 19));
        $race = ConcRace::run($jobs, 0);
        $seqs = DB::table('agent_runs')->where('agent_id', $fx['agent'])->orderBy('conversation_seq')->pluck('conversation_seq')->map(fn ($s) => (int) $s)->all();
        Conc::check('20 parallel sends with distinct keys on one teammate: 20 runs, conversation_seq exactly 1..20 (no gap, no duplicate)',
            $seqs === range(1, 20) && ($t = Conc::tally($race)) === ['201' => 20], 'seqs='.count($seqs).' '.Conc::fmt(Conc::tally($race)));
    }
}
