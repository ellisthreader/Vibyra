<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\Response;

/** Bounded SSE decoder; transport chunks need not align with UTF-8 or frames. */
final class Events
{
    public static function read(Response $response): \Generator
    {
        $stream = $response->toPsrResponse()->getBody();
        $pending = ''; $data = []; $total = 0; $frameBytes = 0;
        try {
            while (!$stream->eof()) {
                $chunk = $stream->read(8192);
                if ($chunk === '' && !$stream->eof()) throw new \RuntimeException('assistant_stream_stalled');
                $pending .= $chunk; $total += strlen($chunk);
                if ($total > 24_000_000 || strlen($pending) > 1_000_000) throw new \RuntimeException('assistant_stream_size');
                while (($end = strpos($pending, "\n")) !== false) {
                    $line = rtrim(substr($pending, 0, $end), "\r");
                    $pending = substr($pending, $end + 1);
                    if ($line === '') {
                        if ($data !== []) yield implode("\n", $data);
                        $data = []; $frameBytes = 0;
                    } elseif (str_starts_with($line, 'data:')) {
                        $value = substr($line, 5);
                        if (str_starts_with($value, ' ')) $value = substr($value, 1);
                        $frameBytes += strlen($value);
                        if ($frameBytes > 1_000_000) throw new \RuntimeException('assistant_frame_size');
                        $data[] = $value;
                    }
                }
            }
            if (trim($pending) !== '' || $data !== []) throw new \RuntimeException('assistant_stream_incomplete');
        } finally { $stream->close(); }
    }
}
