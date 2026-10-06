<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/** Independent PDO connections released together; never fork an open connection. */
trait RemotePostgresWorkers
{
    private function race(array $operations): array
    {
        DB::disconnect();
        $workers = [];
        foreach ($operations as $operation) {
            $pipes = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, 0);
            if ($pipes === false) throw new \RuntimeException('Cannot create worker channel');
            $pid = pcntl_fork();
            if ($pid < 0) throw new \RuntimeException('Cannot fork database worker');
            if ($pid === 0) {
                fclose($pipes[0]);
                fread($pipes[1], 1);
                try {
                    DB::purge();
                    // DatabaseStore holds a connection object: discard it after fork/purge.
                    \Illuminate\Support\Facades\Cache::purge();
                    DB::statement("SET statement_timeout = '8s'");
                    $result = ['value' => $operation()];
                } catch (\Throwable $error) {
                    $result = ['error' => get_class($error).': '.$error->getMessage()];
                }
                fwrite($pipes[1], json_encode($result, JSON_THROW_ON_ERROR));
                fclose($pipes[1]);
                DB::disconnect();
                exit(0);
            }
            fclose($pipes[1]);
            stream_set_timeout($pipes[0], 15);
            $workers[] = [$pid, $pipes[0]];
        }
        foreach ($workers as [, $pipe]) fwrite($pipe, '1');
        $results = [];
        foreach ($workers as [$pid, $pipe]) {
            $bytes = stream_get_contents($pipe);
            $timedOut = stream_get_meta_data($pipe)['timed_out'];
            fclose($pipe);
            if ($timedOut) posix_kill($pid, SIGKILL);
            pcntl_waitpid($pid, $status);
            $this->assertFalse($timedOut, 'Concurrent database operation timed out');
            $this->assertSame(0, pcntl_wexitstatus($status));
            $result = json_decode($bytes, true, flags: JSON_THROW_ON_ERROR);
            $this->assertArrayNotHasKey('error', $result, $result['error'] ?? '');
            $results[] = $result['value'];
        }
        return $results;
    }
}
