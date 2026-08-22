<?php

namespace App\Services\Deployments\Concerns;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

trait HandlesRailwayGraphql
{
    private function railwayGraphql(string $query, array $variables, ?string $projectToken = null): ?array
    {
        $this->lastRailwayError = '';
        $token = trim((string) ($projectToken ?: config('services.railway.api_token', '')));
        if ($token === '') {
            $this->lastRailwayError = 'The Railway API token is missing.';

            return null;
        }
        $request = $projectToken
            ? Http::withHeaders(['project-access-token' => $token])
            : Http::withToken($token);
        $response = $request
            ->acceptJson()
            ->timeout(30)
            ->post(self::GRAPHQL_URL, compact('query', 'variables'));
        if (! $response->successful()) {
            $this->lastRailwayError = $this->providerOutputDetail($response->body())
                ?: 'Railway API returned HTTP '.$response->status().'.';

            return null;
        }
        $errors = $response->json('errors');
        if (is_array($errors) && $errors !== []) {
            $messages = collect($errors)
                ->map(fn ($error) => trim((string) data_get($error, 'message', '')))
                ->filter()
                ->unique()
                ->take(3)
                ->implode(' ');
            $this->lastRailwayError = Str::limit(
                $messages !== '' ? $messages : 'Railway returned an unknown GraphQL error.',
                500,
                '',
            );

            return null;
        }
        $data = $response->json('data');
        if (! is_array($data)) {
            $this->lastRailwayError = 'Railway returned an invalid API response.';

            return null;
        }

        return $data;
    }

    private function withRailwayError(string $message): string
    {
        return $this->lastRailwayError === ''
            ? $message
            : rtrim($message).' Railway said: '.$this->lastRailwayError;
    }

    private function withProviderOutput(string $message, string $output): string
    {
        $detail = $this->providerOutputDetail($output);

        return $detail === '' ? $message : rtrim($message).' Railway said: '.$detail;
    }

    private function providerOutputDetail(string $output): string
    {
        $decoded = $this->decodeJsonPayload($output);
        if (is_array($decoded)) {
            $messages = [];
            foreach ((array) ($decoded['errors'] ?? []) as $error) {
                $messages[] = trim((string) data_get($error, 'message', ''));
            }
            foreach (['message', 'detail', 'error'] as $key) {
                if (is_string($decoded[$key] ?? null)) {
                    $messages[] = trim($decoded[$key]);
                }
            }
            $status = trim((string) data_get($decoded, 'deployment.status', ''));
            if ($status !== '') {
                $messages[] = 'Deployment status: '.$status.'.';
            }
            $detail = collect($messages)->filter()->unique()->take(3)->implode(' ');
            if ($detail !== '') {
                return Str::limit($detail, 500, '');
            }
        }
        $plain = trim(preg_replace('/\s+/', ' ', strip_tags($output)) ?? '');

        return Str::limit($plain, 500, '');
    }

    private function humanList(array $values): string
    {
        if (count($values) < 2) {
            return (string) ($values[0] ?? '');
        }

        return implode(', ', array_slice($values, 0, -1)).' and '.$values[array_key_last($values)];
    }
}
