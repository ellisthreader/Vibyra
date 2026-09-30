<?php
/** Reads the throwaway cluster's server log (CONC_PG_LOG) so lock problems are counted from Postgres itself, not inferred. */
final class ConcPg
{
    public static function count(string $needle): int
    {
        $log = getenv('CONC_PG_LOG');
        return $log && is_file($log) ? substr_count((string) file_get_contents($log), $needle) : 0;
    }

    /** @return array<string, int> ERROR/FATAL lines grouped by message, digits and quoted names folded */
    public static function errors(): array
    {
        $log = getenv('CONC_PG_LOG');
        $out = [];
        foreach (is_file((string) $log) ? file($log, FILE_IGNORE_NEW_LINES) : [] as $line) {
            if (!preg_match('/\b(ERROR|FATAL):\s+(.*)$/', $line, $m)) continue;
            $k = $m[1].': '.substr(preg_replace('/"[^"]*"/', '"…"', $m[2]), 0, 90);
            $out[$k] = ($out[$k] ?? 0) + 1;
        }
        arsort($out);
        return $out;
    }
}
