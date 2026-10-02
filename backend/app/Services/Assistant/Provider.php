<?php
namespace App\Services\Assistant;

use Illuminate\Http\Client\{PendingRequest, Response};
use Illuminate\Support\Facades\Http;

final class Provider
{
    private function client(): PendingRequest
    {
        return Http::withToken((string) config('services.openai.key'))->connectTimeout(10)->timeout(90)
            ->withOptions(['allow_redirects' => false, 'stream' => true, 'read_timeout' => 10]);
    }

    public function chat(array $body): Response
    {
        $start = Body::time();
        return Body::mark($this->check($this->client()->post('https://api.openai.com/v1/chat/completions', $body)), $start);
    }

    public function speech(array $body): Response
    {
        $start = Body::time();
        return Body::mark($this->check($this->client()->post('https://api.openai.com/v1/audio/speech', $body)), $start);
    }

    public function transcription(string $wav, ?string $language): array
    {
        $body = ['model' => 'whisper-1', 'response_format' => 'json'];
        if ($language) $body['language'] = $language;
        $start = Body::time();
        $response = Body::mark($this->check($this->client()->attach('file', $wav, 'audio.wav', ['Content-Type' => 'audio/wav'])
            ->post('https://api.openai.com/v1/audio/transcriptions', $body)), $start);
        $raw = '';
        foreach (Body::chunks($response, 128_000) as $chunk) $raw .= $chunk;
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
