<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\Response;

final class ChatStream
{
    public function relay(Response $response, string $reservation): void
    {
        $previous = ignore_user_abort(true);
        $cost = null; $done = false;
        try {
            foreach (Events::read($response) as $data) {
                if ($data === '[DONE]') { $done = true; break; }
                $frame = json_decode($data, true, 64, JSON_THROW_ON_ERROR);
                if (!is_array($frame) || isset($frame['error'])) throw new \RuntimeException('assistant_stream_error');
                $usage = $frame['usage'] ?? null;
                if (is_int($usage['prompt_tokens'] ?? null) && $usage['prompt_tokens'] >= 0
                    && is_int($usage['completion_tokens'] ?? null) && $usage['completion_tokens'] >= 0) {
                    $cached = min($usage['prompt_tokens'], max(0, (int) ($usage['prompt_tokens_details']['cached_tokens'] ?? 0)));
                    $cost = (int) ceil(($usage['prompt_tokens'] - $cached) * 0.25 + $cached * 0.025 + $usage['completion_tokens'] * 2);
                }
                // Strip upstream metadata. The existing native parser consumes only choices/usage.
                $public = array_intersect_key($frame, array_flip(['choices', 'usage']));
                if ($public) $this->send(json_encode($public, JSON_THROW_ON_ERROR));
            }
            if (!$done) throw new \RuntimeException('assistant_stream_incomplete');
            app(Budget::class)->finish($reservation, $cost);
            $this->send('[DONE]');
        } catch (\Throwable) {
            app(Budget::class)->finish($reservation, $cost);
            $this->send(json_encode(['error' => ['message' => 'The reply was interrupted. Please try again.']]));
        } finally { ignore_user_abort((bool) $previous); }
    }

    private function send(string $data): void
    {
        if (connection_aborted()) return; // Still drain usage and settle after the client presses Stop.
        echo 'data: '.$data."\n\n";
        if (!app()->runningUnitTests()) { if (ob_get_level()) @ob_flush(); flush(); }
    }
}
