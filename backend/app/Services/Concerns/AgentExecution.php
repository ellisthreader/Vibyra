<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait AgentExecution
{
    private function startAgentLocked(string $projectId, string $prompt, string $model, string $reasoningEffort): array
    {
        $allowedModels = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5-codex'];
        $allowedEfforts = ['none', 'low', 'medium', 'high', 'xhigh'];
        $model = in_array($model, $allowedModels, true) ? $model : 'gpt-5.5';
        $reasoningEffort = in_array($reasoningEffort, $allowedEfforts, true) ? $reasoningEffort : 'medium';
        $prompt = trim($prompt);
        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'No project selected'], 422));
        }

        if ($prompt === '' || mb_strlen($prompt) < 3) {
            abort(response()->json(['ok' => false, 'error' => 'Enter a prompt before starting OpenAI.'], 422));
        }

        if (mb_strlen($prompt) > 8000) {
            abort(response()->json(['ok' => false, 'error' => 'Prompt is too long. Keep it under 8,000 characters.'], 422));
        }

        $lastCompletedAt = isset($state['lastPromptCompletedAt']) ? strtotime((string) $state['lastPromptCompletedAt']) : 0;
        $cooldownRemaining = self::AGENT_COOLDOWN_SECONDS - max(0, time() - $lastCompletedAt);

        if ($cooldownRemaining > 0) {
            abort(response()->json([
                'ok' => false,
                'error' => 'Please wait '.$cooldownRemaining.'s before sending another OpenAI prompt.',
            ], 429));
        }

        $promptHash = hash('sha256', implode('|', [$project['id'], $model, $reasoningEffort, $prompt]));
        $recentPromptHashes = $this->freshRecentPromptHashes($state['recentPromptHashes'] ?? []);

        if (isset($recentPromptHashes[$promptHash])) {
            abort(response()->json([
                'ok' => false,
                'error' => 'That exact OpenAI prompt was already sent. Change the prompt before running it again.',
            ], 409));
        }

        if (! empty($state['activeAgentRun'])) {
            abort(response()->json([
                'ok' => false,
                'error' => 'An OpenAI task is already running. Wait for it to finish before sending another prompt.',
            ], 429));
        }

        if (! env('OPENAI_API_KEY')) {
            abort(response()->json(['ok' => false, 'error' => 'OPENAI_API_KEY is not configured on the desktop backend'], 422));
        }

        $runId = 'run-'.now()->timestamp.'-'.random_int(100, 999);
        $state['activeAgentRun'] = [
            'id' => $runId,
            'projectId' => $project['id'],
            'model' => $model,
            'reasoningEffort' => $reasoningEffort,
            'promptHash' => $promptHash,
            'title' => $prompt,
            'progress' => 12,
            'state' => 'running',
            'file' => 'OpenAI stream',
            'startedAt' => now()->toISOString(),
            'updatedAt' => now()->toISOString(),
        ];
        $state['lastPromptStartedAt'] = now()->toISOString();
        $state['recentPromptHashes'] = [
            $promptHash => now()->toISOString(),
            ...$recentPromptHashes,
        ];
        $this->write($state);

        $outputDir = $project['path'].'/.vibyra-agent/runs';
        File::ensureDirectoryExists($outputDir);
        $outputPath = $outputDir.'/'.$runId.'.md';
        $this->recordEvent('OpenAI', 'Starting '.$model.' with '.$reasoningEffort.' reasoning', 'info');
        $this->recordEvent('OpenAI', 'Prompt: '.Str::limit($prompt, 180), 'info');
        $responseText = $this->streamOpenAiResponse($project, $prompt, $model, $reasoningEffort);
        $state = $this->read();
        $appliedFiles = $this->applyGeneratedFiles($project, $this->extractGeneratedFiles($project, $responseText));
        $summary = implode("\n", [
            '# Vibyra Agent Run',
            '',
            'Prompt: '.$prompt,
            'Model: '.$model,
            'Reasoning effort: '.$reasoningEffort,
            'Project: '.$project['name'],
            'Created: '.now()->toISOString(),
            '',
            'OpenAI response:',
            '',
            $responseText,
        ]);
        File::put($outputPath, $summary);
        $artifactFile = $this->fileEntry($project, Str::after($outputPath, rtrim($project['path'], '/').'/'), true);
        $returnedFiles = array_values(array_filter([...$appliedFiles, $artifactFile]));
        $changes = [];

        foreach ($appliedFiles as $index => $file) {
            $changes[] = [
                'id' => $runId.'-applied-'.$index,
                'file' => $file['path'],
                'summary' => 'Applied Vibyra generated file',
                'additions' => count(explode("\n", $file['body'])),
                'deletions' => 0,
                'status' => 'applied',
            ];
        }

        $changes[] = [
            'id' => $runId.'-artifact',
            'file' => $outputPath,
            'summary' => 'Saved OpenAI run artifact',
            'additions' => count(explode("\n", $summary)),
            'deletions' => 0,
            'status' => 'applied',
        ];

        $state['selectedProjectId'] = $project['id'];
        $state['latestPreview'] = [
            'state' => 'delivered',
            'url' => $this->previewUrl($project['id'], $state['token']),
            'title' => $project['name'],
            'message' => 'Updated preview captured from Vibyra Desktop',
            'capturedAt' => now()->toISOString(),
        ];

        $newEvents = [
            $this->event('Preview', 'Updated preview delivered to iPhone', 'success'),
            $this->event('Agent', 'Captured refreshed project preview', 'success'),
            $this->event('Dev Server', 'Project reloaded after local apply', 'success'),
            $this->event(
                'Agent',
                count($appliedFiles) > 0
                    ? 'Applied '.count($appliedFiles).' generated file(s) to '.$project['path']
                    : 'No file changes found in OpenAI response; saved run artifact only',
                count($appliedFiles) > 0 ? 'success' : 'warning'
            ),
            $this->event($model, 'OpenAI response saved to '.$outputPath, 'success'),
            $this->event('Backend', 'Prompt sent to '.$model.' with '.$reasoningEffort.' reasoning', 'info'),
        ];
        $state['events'] = array_slice([...$newEvents, ...$state['events']], 0, 50);
        $state['activeAgentRun'] = null;
        $state['lastPromptCompletedAt'] = now()->toISOString();
        $this->write($state);

        return [
            'agent' => [
                'id' => $runId,
                'title' => $prompt,
                'model' => $model,
                'projectId' => $project['id'],
                'state' => 'complete',
                'progress' => 100,
                'file' => $outputPath,
            ],
            'changes' => $changes,
            'files' => $returnedFiles,
            'reply' => $responseText,
            'events' => $newEvents,
            'preview' => $state['latestPreview'],
            'buildState' => 'passed',
        ];
    }
}
