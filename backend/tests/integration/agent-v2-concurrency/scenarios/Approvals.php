<?php
use Illuminate\Support\Facades\DB;

/** Scenario 4: parallel approvals, a racing revoke, allow-vs-decline, and what an approval executes at the provider. */
final class ConcApprovals
{
    private const SEND = ['to' => 'board@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];

    public static function run(): void
    {
        Conc::$scenario = '4 approvals';
        self::tenApprovals();
        self::revokeFirst();
        self::revokeRaces();
        self::allowVersusDecline();
        self::cancelRaces();
    }

    /** A run waiting on one exact gmail_send approval. */
    private static function pending(): array
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Email the board.');
        $c = ConcFixture::claim($fx);
        return [$fx, $c, ConcFixture::write($fx, $c, self::SEND, 'send-1')];
    }

    private static function decide(array $fx, array $action, string $decision = 'allow', int $jitter = 0): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$action['id'].'/decision', 'token' => $fx['token'],
            'json' => ['fingerprint' => $action['fingerprint'], 'decision' => $decision], 'jitterMs' => $jitter];
    }

    private static function revoke(array $fx, int $jitter): array
    {
        return ['op' => 'revoke', 'connection' => $fx['gmail'], 'user' => $fx['user'], 'token' => $fx['token'], 'jitterMs' => $jitter];
    }

    /** send-state facts for one account: provider calls, action state, receipts, journal events. */
    private static function facts(array $fx, array $action): array
    {
        $sends = DB::table('conc_calls')->where('kind', 'GMAIL_SEND')->where('ckey', 'tok-'.$fx['user'])->get();
        $done = DB::table('conc_calls')->where('kind', 'REVOKE_DONE')->where('ckey', 'tok-'.$fx['user'])->value(DB::raw('extract(epoch from started_at)'));
        $late = $done === null ? [] : $sends->map(fn ($s) => (DB::table('conc_calls')->where('id', $s->id)->value(DB::raw('extract(epoch from started_at)')) - $done) * 1000)->filter(fn ($ms) => $ms > 0)->all();
        return ['sends' => $sends->count(), 'afterRevoke' => $sends->filter(fn ($s) => json_decode($s->note, true)['revokedAtCall'] ?? false)->count(), 'lateMs' => $late ? round(max($late), 1) : null,
            'state' => DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'),
            'receipts' => DB::table('agent_receipts')->where('action_id', $action['id'])->count(),
            'results' => DB::table('agent_run_events')->where('run_id', $action['runId'] ?? DB::table('agent_tool_actions')->where('id', $action['id'])->value('run_id'))->where('type', 'tool.result')->count()];
    }

    /** One undisturbed approval, end to end, in ms. Race offsets are fractions of it so both outcomes occur on a fast or a loaded machine. */
    private static function approvalMs(): int
    {
        [$fx, , $a] = self::pending();
        $t = microtime(true);
        ConcHttp::call('POST', '/api/agents/v2/actions/'.$a['id'].'/decision', $fx['token'], ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']);
        return max(8, (int) round((microtime(true) - $t) * 1000));
    }

    private static function tenApprovals(): void
    {
        [$fx, , $a] = self::pending();
        $race = ConcRace::start(array_map(fn () => self::decide($fx, $a), range(1, 10)), 0, ['CONC_SEND_DELAY_MS' => '200'])->release()->results();
        $f = self::facts($fx, $a);
        $t = Conc::tally($race);
        Conc::check('10 parallel identical approvals: exactly one provider send; action completed; one receipt; one tool.result; every caller got 200',
            $f['sends'] === 1 && $f['state'] === 'completed' && $f['receipts'] === 1 && $f['results'] === 1 && $t === ['200' => 10], Conc::fmt($t).' '.json_encode($f));
        $again = ConcRace::run(array_map(fn () => self::decide($fx, $a), range(1, 5)));
        Conc::check('5 more approvals after completion are no-ops (still one send, one receipt)', self::facts($fx, $a)['sends'] === 1 && self::facts($fx, $a)['receipts'] === 1 && Conc::tally($again) === ['200' => 5]);
    }

    private static function revokeFirst(): void
    {
        [$fx, , $a] = self::pending();
        ConcHttp::call('DELETE', '/api/agents/v2/connections/'.$fx['gmail'], $fx['token']); // lands first, deterministically
        $race = ConcRace::run(array_map(fn () => self::decide($fx, $a), range(1, 10)));
        $f = self::facts($fx, $a);
        Conc::check('connection revoked BEFORE 10 parallel approvals: zero provider sends, action refused, no receipt', $f['sends'] === 0 && $f['state'] === 'refused' && $f['receipts'] === 0,
            Conc::fmt(Conc::tally($race)).' '.json_encode($f));
    }

    private static function revokeRaces(): void
    {
        $rounds = 24; $sent = 0; $zero = 0; $after = 0; $bad = []; $codes = []; $lateMs = []; $ms = self::approvalMs();
        foreach (range(0, $rounds - 1) as $i) {
            [$fx, , $a] = self::pending();
            $jobs = array_map(fn () => self::decide($fx, $a), range(1, 10));
            $jobs[] = self::revoke($fx, (int) round([0, .2, .5, 1, 1.5, 2, 3, 4, 5, 6.5, 8, 10][$i % 12] * $ms));
            $race = ConcRace::start($jobs, 0, ['CONC_SEND_DELAY_MS' => '60'])->release()->results();
            $f = self::facts($fx, $a);
            foreach (Conc::tally($race) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $f['sends'] === 1 ? $sent++ : $zero++;
            $after += $f['afterRevoke'];
            if ($f['lateMs'] !== null) $lateMs[] = $f['lateMs'];
            $ok = $f['sends'] <= 1 && ($f['sends'] === 1 ? ($f['state'] === 'completed' && $f['receipts'] === 1 && $f['results'] === 1) : in_array($f['state'], ['refused', 'failed'], true));
            if (!$ok) $bad[] = 'round '.$i.' '.json_encode($f);
        }
        ksort($codes);
        Conc::check($rounds.' rounds of 10 approvals + a concurrent connection revoke at varying offsets: never more than one send; one send ⇒ completed with exactly one receipt; zero sends ⇒ refused',
            !$bad, 'one undisturbed approval takes '.$ms.' ms here; sent in '.$sent.' rounds, zero in '.$zero.'; HTTP outcomes: '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', $bad) : ''));
        // A write whose credential was read before the revoke committed is already on its way; the revoke cannot recall it.
        // Measured, not asserted: the window depends on machine load (single-digit ms idle, tens of ms when the host is saturated).
        Conc::info('measured window: '.$after.' round(s) had the install row already gone at the provider call; '.count($lateMs).' send(s) started after the revoke returned'.($lateMs ? ', the latest +'.max($lateMs).' ms' : ''));
        Conc::check('…no approval or revoke answered 5xx or crashed (deadlock/serialization errors would surface here)', !array_intersect_key($codes, array_flip(['500', '503', 'crash', '500:'])), json_encode($codes));
    }

    /** Approvals racing the person cancelling the task: lock order run→action in one path and action→run in the other would deadlock. */
    private static function cancelRaces(): void
    {
        $rounds = 20; $sent = 0; $codes = []; $bad = []; $deadlocks0 = ConcPg::count('deadlock detected'); $ms = self::approvalMs();
        foreach (range(0, $rounds - 1) as $i) {
            [$fx, $c, $a] = self::pending();
            $jobs = array_map(fn ($n) => self::decide($fx, $a, 'allow', $n % 3), range(1, 8));
            $jobs[] = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$c['id'].'/cancel', 'token' => $fx['token'], 'jitterMs' => (int) round([0, .2, .5, 1, 1.6, 2.4, 3.5, 5, 7, 10][$i % 10] * $ms)];
            $race = ConcRace::start($jobs, 0, ['CONC_SEND_DELAY_MS' => '40'])->release()->results();
            foreach (Conc::tally($race) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $f = self::facts($fx, $a);
            $run = DB::table('agent_runs')->find($c['id']);
            $f['sends'] === 1 ? $sent++ : null;
            $ok = $f['sends'] <= 1 && $run->state === 'cancelled' && ($f['sends'] === 1 ? $f['state'] === 'completed' && $f['receipts'] === 1 : in_array($f['state'], ['cancelled', 'refused'], true));
            if (!$ok) $bad[] = 'round '.$i.' '.json_encode($f).' run='.$run->state;
        }
        ksort($codes);
        $deadlocks = ConcPg::count('deadlock detected') - $deadlocks0;
        Conc::check($rounds.' rounds of 8 approvals + a concurrent cancel: never more than one send; the run always ends cancelled; one send ⇒ completed with one receipt; none ⇒ cancelled/refused',
            !$bad, 'approval ≈ '.$ms.' ms; sent in '.$sent.' rounds; HTTP outcomes: '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', array_slice($bad, 0, 3)) : ''));
        Conc::check('…no deadlock and no 5xx between approve/dispatch and cancel', $deadlocks === 0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash', '500:'])), 'Postgres deadlocks='.$deadlocks.' '.json_encode($codes));
    }

    private static function allowVersusDecline(): void
    {
        $allowWon = 0; $declineWon = 0; $bad = [];
        foreach (range(0, 9) as $i) {
            [$fx, , $a] = self::pending();
            $jobs = [];
            foreach (range(1, 5) as $n) { $jobs[] = self::decide($fx, $a, 'allow', $n); $jobs[] = self::decide($fx, $a, 'decline', 6 - $n); }
            $race = ConcRace::start($jobs, 0, ['CONC_SEND_DELAY_MS' => '40'])->release()->results();
            $f = self::facts($fx, $a);
            $t = Conc::tally($race);
            $f['state'] === 'completed' ? $allowWon++ : $declineWon++;
            $allowed = $f['state'] === 'completed' && $f['sends'] === 1 && ($t['409:already_decided'] ?? 0) === 5 && ($t['200'] ?? 0) === 5;
            $declined = $f['state'] === 'declined' && $f['sends'] === 0 && ($t['409:already_decided'] ?? 0) === 5 && ($t['200'] ?? 0) === 5;
            if (!$allowed && !$declined) $bad[] = 'round '.$i.' '.json_encode($f).' '.Conc::fmt($t);
        }
        Conc::check('10 rounds of 5 allow + 5 decline at once: exactly one decision wins; allow ⇒ one send, decline ⇒ none; the losing decision always gets 409 already_decided',
            !$bad, 'allow won '.$allowWon.', decline won '.$declineWon.($bad ? ' BAD: '.implode('; ', $bad) : ''));
    }
}
