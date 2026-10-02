<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\Response;

/** Total request deadline, including headers; individual blocking reads are capped at 10s. */
final class Body
{
    private static ?\WeakMap $starts = null;

    public static function mark(Response $response, float $start): Response
    {
        self::$starts ??= new \WeakMap;
        self::$starts[$response] = $start;
        return $response;
    }

    public static function time(): float { return hrtime(true) / 1e9; }

    public static function chunks(Response $response, int $maximum, ?callable $clock = null): \Generator
    {
        $clock ??= self::time(...);
        $start = self::$starts[$response] ?? $clock();
        $stream = $response->toPsrResponse()->getBody(); $total = 0;
        try {
            while (!$stream->eof()) {
                if ($clock() - $start >= 90) throw new \RuntimeException('assistant_deadline');
                $chunk = $stream->read(8192);
                // Stream transports may apply timeout only until headers. Recheck after every bounded read.
                if ($clock() - $start >= 90) throw new \RuntimeException('assistant_deadline');
                if ($chunk === '' && !$stream->eof()) throw new \RuntimeException('assistant_stream_stalled');
                $total += strlen($chunk);
                if ($total > $maximum) throw new \RuntimeException('assistant_stream_size');
                yield $chunk;
            }
        } finally { $stream->close(); }
    }
}
