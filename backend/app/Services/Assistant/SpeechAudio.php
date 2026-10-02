<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\Response;

final class SpeechAudio
{
    public function read(Response $response): array
    {
        $audio = ''; $done = false; $cost = null;
        foreach (Events::read($response) as $data) {
            $event = json_decode($data, true, 64, JSON_THROW_ON_ERROR);
            if (($event['type'] ?? '') === 'speech.audio.delta') {
                $part = base64_decode($event['audio'] ?? '', true);
                if (!is_string($part)) throw new \RuntimeException('assistant_audio_invalid');
                $audio .= $part;
                if (strlen($audio) > 16_000_000) throw new \RuntimeException('assistant_audio_size');
            } elseif (($event['type'] ?? '') === 'speech.audio.done') {
                $done = true; $usage = $event['usage'] ?? null;
                if (is_int($usage['input_tokens'] ?? null) && $usage['input_tokens'] >= 0
                    && is_int($usage['output_tokens'] ?? null) && $usage['output_tokens'] >= 0) {
                    $cost = (int) ceil($usage['input_tokens'] * 0.6 + $usage['output_tokens'] * 12);
                }
                break;
            } else { throw new \RuntimeException('assistant_audio_event'); }
        }
        if (!$done || $audio === '' || $cost === null) throw new \RuntimeException('assistant_audio_incomplete');
        return [$audio, $cost];
    }
}
