<?php
use Illuminate\Support\Facades\DB;

/** Scenario 8: the same races over a real HTTP socket against `php -S` with 8 worker processes (curl_multi fires them together). */
final class ConcWire
{
    private const PORT = 54391;

    public static function run(): void
    {
        Conc::$scenario = '8 over HTTP';
        $p = proc_open([PHP_BINARY, '-S', '127.0.0.1:'.self::PORT, __DIR__.'/../server.php'], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes,
            dirname(__DIR__, 4).'/public', [...getenv(), 'PHP_CLI_SERVER_WORKERS' => '8', 'CONC_SEND_DELAY_MS' => '150']);
        try {
            if (!self::ready()) { Conc::check('HTTP server started', false); return; }
            self::admission();
            self::approvals();
        } finally {
            proc_terminate($p, SIGKILL);
            exec('pkill -9 -f '.escapeshellarg('php -S 127.0.0.1:'.self::PORT)); // the 8 forked workers outlive their parent
            proc_close($p);
        }
    }

    private static function ready(): bool
    {
        for ($i = 0; $i < 60; $i++) { $c = @fsockopen('127.0.0.1', self::PORT, $e, $s, 0.2); if ($c) { fclose($c); return true; } usleep(100000); }
        return false;
    }

    /** @return list<array{int, ?array}> status and JSON for each request, all in flight together */
    private static function fire(array $requests): array
    {
        $mh = curl_multi_init(); $handles = [];
        foreach ($requests as $i => [$method, $path, $headers, $body]) {
            $ch = curl_init('http://127.0.0.1:'.self::PORT.$path);
            curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_POSTFIELDS => $body !== null ? json_encode($body) : null,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', ...$headers]]);
            curl_multi_add_handle($mh, $ch); $handles[$i] = $ch;
        }
        do { curl_multi_exec($mh, $running); curl_multi_select($mh, 0.05); } while ($running > 0);
        $out = [];
        foreach ($handles as $i => $ch) { $out[$i] = [curl_getinfo($ch, CURLINFO_RESPONSE_CODE), json_decode((string) curl_multi_getcontent($ch), true)]; curl_multi_remove_handle($mh, $ch); }
        return $out;
    }

    private static function tally(array $res): string
    {
        $t = [];
        foreach ($res as [$s, $j]) {
            $k = $s.(isset($j['code']) ? ':'.$j['code'] : '');
            $t[$k] = ($t[$k] ?? 0) + 1;
            if ($s >= 500 || $s === 0) Conc::$crashes[] = 'HTTP '.$s.' '.substr(json_encode($j), 0, 240);
        }
        ksort($t);
        return Conc::fmt($t);
    }

    private static function admission(): void
    {
        $fx = ConcFixture::make(false);
        $key = 'wire-'.bin2hex(random_bytes(6));
        $res = self::fire(array_fill(0, 20, ['POST', '/api/agents/v2/runs', ['Authorization: Bearer '.$fx['token']], ['agentId' => $fx['agent'], 'idempotencyKey' => $key, 'prompt' => 'Over the wire.']]));
        $rows = DB::table('agent_runs')->where('user_id', $fx['user'])->where('idempotency_key', $key)->count();
        Conc::check('20 concurrent HTTP admissions with one idempotency key against 8 server workers: one run, 1×201 + 19×200', $rows === 1 && self::tally($res) === '19×200, 1×201', 'rows='.$rows.' '.self::tally($res));
        $claim = array_fill(0, 10, ['POST', '/api/agents/v2/runner/'.$fx['runtime']['id'].'/claim', ['Authorization: Bearer '.$fx['token'], 'X-Vibyra-Runner-Key: '.$fx['runtime']['runnerKey']], []]);
        $res = self::fire($claim);
        $gen = (int) DB::table('agent_runs')->where('user_id', $fx['user'])->value('lease_generation');
        Conc::check('10 concurrent HTTP runner claims of that run: exactly one 200, nine 204, generation 1', $gen === 1 && self::tally($res) === '1×200, 9×204', self::tally($res).' generation='.$gen);
    }

    private static function approvals(): void
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Email the board.');
        $c = ConcFixture::claim($fx);
        $a = ConcFixture::write($fx, $c, ['to' => 'board@example.com', 'subject' => 'S', 'body' => 'B'], 'send-1');
        $res = self::fire(array_fill(0, 10, ['POST', '/api/agents/v2/actions/'.$a['id'].'/decision', ['Authorization: Bearer '.$fx['token']], ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']]));
        $sends = ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']);
        Conc::check('10 concurrent HTTP approvals of one write: exactly one provider send, action completed, every caller 200', $sends === 1 && self::tally($res) === '10×200'
            && DB::table('agent_tool_actions')->where('id', $a['id'])->value('state') === 'completed', 'sends='.$sends.' '.self::tally($res));
    }
}
