<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait AgentExecution
{
    private function startAgentLocked(string $projectId, string $projectPath, string $prompt, string $model, string $reasoningEffort, bool $apply): array
    {
        $allowedModels = ['auto', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5-codex', 'claude-opus-4', 'claude-sonnet-4', 'claude-3-5-haiku', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        $allowedEfforts = ['none', 'low', 'medium', 'high', 'xhigh'];
        $model = in_array($model, $allowedModels, true) ? $model : 'gpt-5.5';
        $reasoningEffort = in_array($reasoningEffort, $allowedEfforts, true) ? $reasoningEffort : 'medium';
        $prompt = trim($prompt);
        $state = $this->recoverStaleActiveAgentRun($this->read());
        $project = $this->projectById($state, $projectId) ?? $this->projectFromTrustedPath($projectPath);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'No project selected'], 422));
        }

        if ($prompt === '' || mb_strlen($prompt) < 3) {
            abort(response()->json(['ok' => false, 'error' => 'Enter a prompt before starting the desktop AI agent.'], 422));
        }

        if (mb_strlen($prompt) > 8000) {
            abort(response()->json(['ok' => false, 'error' => 'Prompt is too long. Keep it under 8,000 characters.'], 422));
        }

        $lastCompletedAt = isset($state['lastPromptCompletedAt']) ? strtotime((string) $state['lastPromptCompletedAt']) : 0;
        $cooldownRemaining = self::AGENT_COOLDOWN_SECONDS - max(0, time() - $lastCompletedAt);

        if ($cooldownRemaining > 0) {
            abort(response()->json([
                'ok' => false,
                'error' => 'Please wait '.$cooldownRemaining.'s before sending another desktop AI prompt.',
            ], 429));
        }

        $promptHash = hash('sha256', implode('|', [$project['id'], $model, $reasoningEffort, $prompt]));
        $recentPromptHashes = $this->freshRecentPromptHashes($state['recentPromptHashes'] ?? []);

        if (isset($recentPromptHashes[$promptHash])) {
            abort(response()->json([
                'ok' => false,
                'error' => 'That exact desktop AI prompt was already sent. Change the prompt before running it again.',
            ], 409));
        }

        if (! empty($state['activeAgentRun'])) {
            abort(response()->json($this->agentBusyPayload($state, 'active-run'), 429));
        }

        if (! config('services.openrouter.key')) {
            abort(response()->json(['ok' => false, 'error' => 'OPENROUTER_API_KEY is not configured on the desktop backend'], 422));
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
            'file' => 'OpenRouter stream',
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
        $outputPath = $outputDir.'/'.$runId.'.md';
        $this->recordEvent('OpenRouter', 'Starting '.$model.' with '.$reasoningEffort.' reasoning', 'info');
        $this->recordEvent('OpenRouter', 'Prompt: '.Str::limit($prompt, 180), 'info');
        $responseText = $this->streamOpenAiResponse($project, $prompt, $model, $reasoningEffort);
        $state = $this->read();
        $generatedFiles = $this->extractGeneratedFiles($project, $responseText);
        $summary = implode("\n", [
            '# Vibyra Agent Run',
            '',
            'Prompt: '.$prompt,
            'Model: '.$model,
            'Reasoning effort: '.$reasoningEffort,
            'Project: '.$project['name'],
            'Created: '.now()->toISOString(),
            '',
            'OpenRouter response:',
            '',
            $responseText,
        ]);

        if (! $apply) {
            return $this->storePendingAgent($state, $project, [
                'runId' => $runId,
                'projectId' => $project['id'],
                'prompt' => $prompt,
                'model' => $model,
                'reasoningEffort' => $reasoningEffort,
                'generatedFiles' => $generatedFiles,
                'outputPath' => $outputPath,
                'artifactPath' => Str::after($outputPath, rtrim($project['path'], '/').'/'),
                'summary' => $summary,
                'responseText' => $responseText,
            ]);
        }

        $appliedFiles = $this->applyGeneratedFiles($project, $generatedFiles);
        File::ensureDirectoryExists($outputDir);
        File::put($outputPath, $summary);
        $artifactFile = $this->fileEntry($project, Str::after($outputPath, rtrim($project['path'], '/').'/'), true);
        $returnedFiles = array_values(array_filter([...$appliedFiles, $artifactFile]));
        $changes = $this->changesForFiles($runId, $appliedFiles, 'applied');

        $changes[] = [
            'id' => $runId.'-artifact',
            'file' => $outputPath,
            'summary' => 'Saved OpenAI run artifact',
            'additions' => count(explode("\n", $summary)),
            'deletions' => 0,
            'status' => 'applied',
        ];

        $state['selectedProjectId'] = $project['id'];
        $previewUrl = $this->previewEntryPath($project) !== ''
            ? $this->previewUrl($project['id'], $state['token'])
            : null;
        $state['latestPreview'] = [
            'state' => $previewUrl ? 'delivered' : 'live',
            'url' => $previewUrl,
            'title' => $project['name'],
            'message' => $previewUrl ? 'Updated preview captured from Vibyra Desktop' : 'No runnable browser preview found for this project yet.',
            'capturedAt' => now()->toISOString(),
        ];

        $newEvents = [
            $this->event('Preview', $previewUrl ? 'Updated preview delivered to iPhone' : 'No runnable browser preview found for this project yet', $previewUrl ? 'success' : 'warning'),
            $this->event('Agent', 'Captured refreshed project preview', 'success'),
            $this->event('Dev Server', 'Project reloaded after local apply', 'success'),
            $this->event(
                'Agent',
                count($appliedFiles) > 0
                    ? 'Applied '.count($appliedFiles).' generated file(s) to '.$project['path']
                    : 'No file changes found in OpenRouter response; saved run artifact only',
                count($appliedFiles) > 0 ? 'success' : 'warning'
            ),
            $this->event($model, 'OpenRouter response saved to '.$outputPath, 'success'),
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
