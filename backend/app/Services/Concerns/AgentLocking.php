<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait AgentLocking
{
    public function startAgent(string $projectId, string $projectPath, string $prompt, string $model, string $reasoningEffort, bool $apply): array
    {
        $lockPath = storage_path('app/vibyra/agent.lock');
        File::ensureDirectoryExists(dirname($lockPath));
        $lock = fopen($lockPath, 'c');

        if (! $lock || ! flock($lock, LOCK_EX | LOCK_NB)) {
            $state = $this->recoverStaleActiveAgentRun($this->read());
            abort(response()->json($this->agentBusyPayload($state, 'lock'), 429));
        }

        try {
            return $this->startAgentLocked($projectId, $projectPath, $prompt, $model, $reasoningEffort, $apply);
        } finally {
            $state = $this->read();
            $hadActiveRun = ! empty($state['activeAgentRun']);
            $state['activeAgentRun'] = null;
            if ($hadActiveRun) {
                $state['lastPromptCompletedAt'] = now()->toISOString();
            }
            $this->write($state);

            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
