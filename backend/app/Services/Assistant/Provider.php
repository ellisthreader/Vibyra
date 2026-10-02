<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\{PendingRequest, Response};
use Illuminate\Support\Facades\Http;

final class Provider
{
    private function client(): PendingRequest
    {
        return Http::withToken((string) config('services.openai.key'))->connectTimeout(10)->timeout(90)
            ->withOptions(['allow_redirects' => false, 'stream' => true, 'read_timeout' => 30]);
    }

    public function chat(array $body): Response
    {
        return $this->check($this->client()->post('https://api.openai.com/v1/chat/completions', $body));
    }

    public function speech(array $body): Response
    {
        return $this->check($this->client()->post('https://api.openai.com/v1/audio/speech', $body));
    }

    public function transcription(string $wav, ?string $language): array
    {
        $body = ['model' => 'whisper-1', 'response_format' => 'json'];
        if ($language) $body['language'] = $language;
        $response = $this->check($this->client()->attach('file', $wav, 'audio.wav', ['Content-Type' => 'audio/wav'])
            ->post('https://api.openai.com/v1/audio/transcriptions', $body));
        $stream = $response->toPsrResponse()->getBody();
        $raw = '';
        while (!$stream->eof()) {
            $raw .= $stream->read(8192);
            if (strlen($raw) > 128_000) throw new \RuntimeException('transcription_size');
        }
        $parsed = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        if (!is_string($parsed['text'] ?? null)) throw new \RuntimeException('transcription_invalid');
        return ['text' => $parsed['text']];
    }

    private function check(Response $response): Response
    {
        if (!$response->successful()) {
            $response->toPsrResponse()->getBody()->close();
            // Never surface or log the provider body, request, token or exception.
            throw new \RuntimeException('assistant_provider_refused');
        }
        return $response;
    }
}
