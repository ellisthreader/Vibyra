<?php
/** Collects PASS/FAIL lines with exact counts; the driver writes them to results.json for the evidence doc. */
final class Conc
{
    public static array $results = [];
    /** Why racing children died or were refused, attached to the next failing check so a FAIL explains itself. */
    public static array $crashes = [];
    public static string $scenario = '';

    public static function check(string $name, bool $pass, string $detail = ''): bool
    {
        if (!$pass && self::$crashes) $detail .= ' [child errors: '.implode(' | ', array_slice(array_unique(self::$crashes), 0, 2)).']';
        self::$crashes = [];
        self::$results[] = ['scenario' => self::$scenario, 'check' => $name, 'pass' => $pass, 'detail' => $detail];
        echo ($pass ? 'PASS' : 'FAIL').'  ['.self::$scenario.'] '.$name.($detail !== '' ? ' — '.$detail : '')."\n";
        return $pass;
    }

    public static function info(string $line): void { echo '      '.$line."\n"; }

    /** Count results by HTTP status (and optional error code) from a race. */
    public static function tally(array $race): array
    {
        $t = [];
        foreach ($race as $r) {
            $x = $r['result'] ?? [];
            if (isset($r['crash']) || isset($x['crash'])) self::$crashes[] = substr(($r['crash'] ?? $x['crash']).' '.trim((string) ($r['stderr'] ?? '')), 0, 240);
            elseif (($x['status'] ?? 0) >= 500) self::$crashes[] = 'HTTP '.$x['status'].' '.substr(json_encode($x['json']), 0, 200);
            $k = isset($r['crash']) || isset($x['crash']) ? 'crash' : (($x['status'] ?? '?').(isset($x['json']['code']) ? ':'.$x['json']['code'] : ''));
            $t[$k] = ($t[$k] ?? 0) + 1;
        }
        ksort($t);
        return $t;
    }

    public static function fmt(array $t): string
    {
        return implode(', ', array_map(fn ($k, $v) => $v.'×'.$k, array_keys($t), $t));
    }
}
