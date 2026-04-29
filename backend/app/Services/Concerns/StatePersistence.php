<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait StatePersistence
{
    private function recordEvent(string $source, string $message, string $tone): void
    {
        $state = $this->read();
        $state['events'] = $this->pushEvent($state['events'], $source, $message, $tone);
        $this->write($state);
    }

    private function ensureState(): void
    {
        File::ensureDirectoryExists(dirname($this->statePath));

        if (File::exists($this->statePath)) {
            return;
        }

        $pairCode = collect(range(1, 6))
            ->map(fn () => substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', random_int(0, 31), 1))
            ->implode('');

        $state = [
            'machineName' => gethostname() ?: 'Vibyra Desktop',
            'pairCode' => $pairCode,
            'token' => 'vibyra-'.Str::random(40),
            'startedAt' => now()->toISOString(),
            'pairedDevice' => null,
            'pendingPair' => null,
            'activeAgentRun' => null,
            'lastPromptStartedAt' => null,
            'lastPromptCompletedAt' => null,
            'recentPromptHashes' => [],
            'selectedProjectId' => null,
            'latestPreview' => null,
            'projects' => $this->discoverProjectsWithoutState(),
            'events' => [
                $this->event('Desktop', 'Vibyra Desktop is ready', 'success'),
                $this->event('Pairing', 'Pair code '.$pairCode.' is showing in Vibyra Desktop', 'info'),
            ],
        ];

        $this->write($state);
    }

    private function read(): array
    {
        $state = json_decode(File::get($this->statePath), true);
        $state += [
            'activeAgentRun' => null,
            'lastPromptStartedAt' => null,
            'lastPromptCompletedAt' => null,
            'recentPromptHashes' => [],
        ];

        return $state;
    }

    private function write(array $state): void
    {
        File::put($this->statePath, json_encode($state, JSON_PRETTY_PRINT));
    }

    private function freshRecentPromptHashes(array $hashes): array
    {
        $fresh = [];

        foreach ($hashes as $hash => $timestamp) {
            if (time() - strtotime((string) $timestamp) <= self::DUPLICATE_PROMPT_WINDOW_SECONDS) {
                $fresh[$hash] = $timestamp;
            }
        }

        return array_slice($fresh, 0, 25, true);
    }

    private function event(string $source, string $message, string $tone): array
    {
        return [
            'id' => 'evt-'.now()->timestamp.'-'.random_int(100, 999),
            'source' => $source,
            'message' => $message,
            'tone' => $tone,
            'time' => 'Now',
        ];
    }

    private function pushEvent(array $events, string $source, string $message, string $tone): array
    {
        return array_slice([$this->event($source, $message, $tone), ...$events], 0, 50);
    }

    private function connectionUrls(): array
    {
        $output = trim((string) shell_exec("hostname -I 2>/dev/null"));
        $addresses = array_values(array_filter(explode(' ', $output)));

        return collect($addresses)
            ->filter(fn ($address) => filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4))
            ->map(fn ($address) => 'http://'.$address.':4317')
            ->values()
            ->all();
    }
}
