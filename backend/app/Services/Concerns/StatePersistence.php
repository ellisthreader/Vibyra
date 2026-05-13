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
            'pendingAgentApplies' => [],
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
            'pendingAgentApplies' => [],
            'lastPromptStartedAt' => null,
            'lastPromptCompletedAt' => null,
            'recentPromptHashes' => [],
        ];

        return $state;
    }

    private function recoverStaleActiveAgentRun(array $state): array
    {
        $run = $state['activeAgentRun'] ?? null;
        if (! is_array($run) || ! $this->activeAgentRunIsStale($run)) {
            return $state;
        }

        $state['activeAgentRun'] = null;
        $state['lastPromptCompletedAt'] = $run['updatedAt'] ?? $run['startedAt'] ?? $state['lastPromptCompletedAt'] ?? null;
        $state['events'] = $this->pushEvent(
            $state['events'] ?? [],
            'Agent',
            'Cleared stale desktop AI run state',
            'warning'
        );
        $this->write($state);

        return $state;
    }

    private function agentBusyPayload(array $state, string $reason): array
    {
        $run = is_array($state['activeAgentRun'] ?? null) ? $state['activeAgentRun'] : [];
        $project = isset($run['projectId']) ? $this->projectById($state, (string) $run['projectId']) : null;
        $timestamp = $run['startedAt'] ?? $run['updatedAt'] ?? $state['lastPromptStartedAt'] ?? null;
        $startedAt = is_string($timestamp) && trim($timestamp) !== '' ? $timestamp : null;
        $elapsedSeconds = null;
        if ($startedAt) {
            $time = strtotime($startedAt);
            if ($time !== false) {
                $elapsedSeconds = max(0, time() - $time);
            }
        }

        return [
            'ok' => false,
            'error' => 'An AI task is already running. Wait for it to finish before sending another prompt.',
            'busyReason' => $reason,
            'activeAgentRun' => [
                'id' => $run['id'] ?? null,
                'title' => $run['title'] ?? 'AI request',
                'model' => $run['model'] ?? null,
                'projectId' => $run['projectId'] ?? null,
                'projectName' => $project['name'] ?? null,
                'projectPath' => $project['path'] ?? null,
                'state' => $run['state'] ?? 'running',
                'progress' => $run['progress'] ?? null,
                'file' => $run['file'] ?? null,
                'startedAt' => $startedAt,
                'updatedAt' => $run['updatedAt'] ?? null,
                'elapsedSeconds' => $elapsedSeconds,
            ],
        ];
    }

    private function activeAgentRunIsStale(array $run): bool
    {
        $timestamp = $run['updatedAt'] ?? $run['startedAt'] ?? null;
        if (! is_string($timestamp) || trim($timestamp) === '') {
            return true;
        }

        $time = strtotime($timestamp);
        if ($time === false) {
            return true;
        }

        return time() - $time > self::STALE_AGENT_RUN_SECONDS;
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
