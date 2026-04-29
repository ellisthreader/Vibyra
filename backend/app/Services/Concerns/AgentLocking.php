<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait AgentLocking
{
    public function startAgent(string $projectId, string $prompt, string $model, string $reasoningEffort): array
    {
        $lockPath = storage_path('app/vibyra/agent.lock');
        File::ensureDirectoryExists(dirname($lockPath));
        $lock = fopen($lockPath, 'c');

        if (! $lock || ! flock($lock, LOCK_EX | LOCK_NB)) {
            abort(response()->json([
                'ok' => false,
                'error' => 'An OpenAI task is already running. Wait for it to finish before sending another prompt.',
            ], 429));
        }

        try {
            return $this->startAgentLocked($projectId, $prompt, $model, $reasoningEffort);
        } finally {
            $state = $this->read();
            $state['activeAgentRun'] = null;
            $state['lastPromptCompletedAt'] = now()->toISOString();
            $this->write($state);

            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
