<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait CommandRunner
{
    public function runCommand(string $projectId, string $command): array
    {
        $allowed = ['git status', 'npm install', 'npm run dev', 'npm run build', 'npm test', 'pytest'];

        if (! in_array($command, $allowed, true)) {
            abort(response()->json(['ok' => false, 'error' => 'Command is not allowed yet: '.$command], 422));
        }

        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'No project selected'], 422));
        }

        $process = Process::fromShellCommandline($command, $project['path']);
        $process->setTimeout(20);
        $process->run();

        $output = trim($process->getOutput().$process->getErrorOutput()) ?: 'Command finished with no output.';
        $event = $this->event('Terminal', $command.': '.Str::limit($output, 180), $process->isSuccessful() ? 'success' : 'error');
        $state['events'] = array_slice([$event, ...$state['events']], 0, 50);
        $this->write($state);

        return [
            'ok' => $process->isSuccessful(),
            'command' => $command,
            'output' => $output,
            'event' => $event,
            'buildState' => Str::contains($command, ['build', 'test'])
                ? ($process->isSuccessful() ? 'passed' : 'failed')
                : 'idle',
        ];
    }
}
