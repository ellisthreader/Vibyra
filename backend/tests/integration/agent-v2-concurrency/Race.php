<?php
/**
 * N real OS processes (`php child.php`) booted and connected first, released together on a shared
 * timestamp. start() returns at once so a scenario can kill a child or poke the database mid-flight.
 */
final class ConcRace
{
    private array $procs = [];
    private string $dir;

    public static function start(array $jobs, int $jitterMs = 0, ?array $env = null): self
    {
        $r = new self;
        $r->dir = sys_get_temp_dir().'/conc-race-'.bin2hex(random_bytes(4));
        mkdir($r->dir);
        foreach (array_values($jobs) as $i => $job) {
            $job['jitterMs'] ??= $jitterMs;
            $cmd = [PHP_BINARY, __DIR__.'/child.php', $r->dir, (string) $i, $job['op'], json_encode($job)];
            $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['file', $r->dir.'/err.'.$i, 'w']], $pipes, null, $env ? [...getenv(), ...$env] : null);
            stream_set_blocking($pipes[1], false);
            $r->procs[$i] = ['proc' => $proc, 'out' => $pipes[1], 'buf' => '', 'done' => false, 'pid' => proc_get_status($proc)['pid']];
        }
        return $r;
    }

    /** Wait until every child has booted and opened its connection, then release them together. */
    public function release(int $bootTimeout = 40): self
    {
        $until = microtime(true) + $bootTimeout;
        while (count(glob($this->dir.'/ready.*')) < count($this->procs)) {
            if (microtime(true) > $until) { $this->killAll(); throw new RuntimeException('Race children did not boot: '.$this->errors()); }
            usleep(5000);
        }
        file_put_contents($this->dir.'/go.tmp', sprintf('%.6f', microtime(true) + 0.05));
        rename($this->dir.'/go.tmp', $this->dir.'/go');
        return $this;
    }

    public function pid(int $i): int { return $this->procs[$i]['pid']; }

    public function kill(int $i): void { posix_kill($this->procs[$i]['pid'], SIGKILL); }

    /** @return array<int, array> one decoded result per child (or a crash record) */
    public function results(int $timeout = 150): array
    {
        $until = microtime(true) + $timeout;
        while (array_filter($this->procs, fn ($p) => !$p['done'])) {
            foreach ($this->procs as $i => &$p) {
                if ($p['done']) continue;
                $p['buf'] .= (string) stream_get_contents($p['out']);
                if (!proc_get_status($p['proc'])['running']) {
                    $p['buf'] .= (string) stream_get_contents($p['out']);
                    $p['exit'] = proc_close($p['proc']);
                    $p['done'] = true;
                }
            }
            unset($p);
            if (microtime(true) > $until) { $this->killAll(); break; }
            usleep(3000);
        }
        $out = [];
        foreach ($this->procs as $i => $p) {
            $line = collect(explode("\n", $p['buf']))->first(fn ($l) => str_starts_with($l, '@@RESULT@@'));
            $out[$i] = $line ? json_decode(substr($line, 10), true) : ['crash' => 'no result (exit '.($p['exit'] ?? 'timeout').')',
                'stderr' => substr((string) @file_get_contents($this->dir.'/err.'.$i), -400), 'killed' => true];
        }
        array_map('unlink', glob($this->dir.'/*'));
        rmdir($this->dir);
        return $out;
    }

    private function killAll(): void { foreach ($this->procs as $i => $p) if (!$p['done']) posix_kill($p['pid'], SIGKILL); }

    private function errors(): string
    {
        return implode(' | ', array_map(fn ($f) => substr((string) @file_get_contents($f), -200), glob($this->dir.'/err.*')));
    }

    /**
     * N real `php artisan` processes (the harness wrapper, so outbound HTTP stays faked) started back to back.
     * @return array<int, array{exit: int, out: string}>
     */
    public static function artisans(int $n, array $args, array $env = [], int $timeout = 120): array
    {
        $procs = [];
        for ($i = 0; $i < $n; $i++) {
            $p = proc_open([PHP_BINARY, __DIR__.'/artisan.php', ...$args], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env ? [...getenv(), ...$env] : null);
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);
            $procs[] = ['p' => $p, 'pipes' => $pipes, 'out' => '', 'exit' => null];
        }
        $until = microtime(true) + $timeout;
        while (array_filter($procs, fn ($x) => $x['exit'] === null) && microtime(true) < $until) {
            foreach ($procs as &$x) {
                if ($x['exit'] !== null) continue;
                $x['out'] .= stream_get_contents($x['pipes'][1]).stream_get_contents($x['pipes'][2]);
                $st = proc_get_status($x['p']);
                if (!$st['running']) { $x['out'] .= stream_get_contents($x['pipes'][1]).stream_get_contents($x['pipes'][2]); $x['exit'] = $st['exitcode']; proc_close($x['p']); }
            }
            unset($x);
            usleep(3000);
        }
        return array_map(fn ($x) => ['exit' => $x['exit'] ?? -1, 'out' => trim($x['out'])], $procs);
    }

    /** Convenience: start, release, collect. */
    public static function run(array $jobs, int $jitterMs = 0, int $timeout = 150): array
    {
        return self::start($jobs, $jitterMs)->release()->results($timeout);
    }
}
