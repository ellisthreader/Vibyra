<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

trait PendingAgentApproval
{
    private function storePendingAgent(array $state, array $project, array $payload): array
    {
        $files = $this->previewGeneratedFiles($project, $payload['generatedFiles']);
        $artifact = $this->fileEntryFromContent($payload['outputPath'], $payload['artifactPath'], $payload['summary'], null);
        $changes = $this->changesForFiles($payload['runId'], $files, 'pending');
        $changes[] = $this->artifactChange($payload['runId'], $payload['outputPath'], $payload['summary'], 'pending');
        $events = [
            $this->event('Agent', 'Prepared '.count($files).' generated file(s) for approval', count($files) > 0 ? 'warning' : 'info'),
            $this->event($payload['model'], 'OpenRouter response ready for approval', 'info'),
            $this->event('Backend', 'Prompt sent to '.$payload['model'].' with '.$payload['reasoningEffort'].' reasoning', 'info'),
        ];
        $state['pendingAgentApplies'][$payload['runId']] = $payload;
        $state['events'] = array_slice([...$events, ...$state['events']], 0, 50);
        $state['activeAgentRun'] = null;
        $state['lastPromptCompletedAt'] = now()->toISOString();
        $this->write($state);

        return [
            'agent' => ['id' => $payload['runId'], 'title' => $payload['prompt'], 'model' => $payload['model'], 'projectId' => $project['id'], 'state' => 'waiting', 'progress' => 92, 'file' => 'Awaiting edit permission'],
            'changes' => $changes,
            'files' => [...$files, $artifact],
            'reply' => $payload['responseText']."\n\nVibyra is waiting for your permission before editing files on this computer.",
            'events' => $events,
            'preview' => ['state' => 'live', 'url' => $state['latestPreview']['url'] ?? null, 'title' => $project['name']],
            'buildState' => 'idle',
            'pendingApplyId' => $payload['runId'],
        ];
    }

    public function applyPendingAgent(string $runId): array
    {
        $state = $this->read();
        $pending = $state['pendingAgentApplies'][$runId] ?? null;
        if (! $pending) abort(response()->json(['ok' => false, 'error' => 'No pending agent edits found'], 404));
        $project = $this->projectById($state, (string) $pending['projectId']);
        if (! $project) abort(response()->json(['ok' => false, 'error' => 'Project not found'], 404));

        $outputPath = (string) $pending['outputPath'];
        File::ensureDirectoryExists(dirname($outputPath));
        $appliedFiles = $this->applyGeneratedFiles($project, $pending['generatedFiles'] ?? []);
        File::put($outputPath, (string) $pending['summary']);
        $artifactFile = $this->fileEntry($project, Str::after($outputPath, rtrim($project['path'], '/').'/'), true);
        $events = [
            $this->event('Preview', 'Updated preview delivered to iPhone', 'success'),
            $this->event('Agent', 'Applied approved generated edits to '.$project['path'], 'success'),
            $this->event((string) $pending['model'], 'OpenRouter response saved to '.$outputPath, 'success'),
        ];
        unset($state['pendingAgentApplies'][$runId]);
        $state['selectedProjectId'] = $project['id'];
        $state['latestPreview'] = $this->deliveredPreview($project, $state);
        $state['events'] = array_slice([...$events, ...$state['events']], 0, 50);
        $this->write($state);

        return $this->agentResult($runId, $pending, $project, $outputPath, $appliedFiles, $artifactFile, $events, $state['latestPreview']);
    }

    public function discardPendingAgent(string $runId): array
    {
        $state = $this->read();
        if (! isset($state['pendingAgentApplies'][$runId])) return ['ok' => true, 'events' => []];
        unset($state['pendingAgentApplies'][$runId]);
        $event = $this->event('Agent', 'Discarded pending edits before applying them', 'info');
        $state['events'] = array_slice([$event, ...$state['events']], 0, 50);
        $this->write($state);
        return ['ok' => true, 'events' => [$event]];
    }

    private function artifactChange(string $runId, string $path, string $summary, string $status): array
    {
        return ['id' => $runId.'-artifact', 'file' => $path, 'summary' => 'Saved OpenAI run artifact', 'additions' => count(explode("\n", $summary)), 'deletions' => 0, 'status' => $status];
    }

    private function deliveredPreview(array $project, array $state): array
    {
        return ['state' => 'delivered', 'url' => $this->previewUrl($project['id'], $state['token']), 'title' => $project['name'], 'message' => 'Updated preview captured from Vibyra Desktop', 'capturedAt' => now()->toISOString()];
    }

    private function agentResult(string $runId, array $pending, array $project, string $path, array $files, ?array $artifact, array $events, array $preview): array
    {
        $changes = $this->changesForFiles($runId, $files, 'applied');
        $changes[] = $this->artifactChange($runId, $path, (string) $pending['summary'], 'applied');
        return ['agent' => ['id' => $runId, 'title' => (string) $pending['prompt'], 'model' => (string) $pending['model'], 'projectId' => $project['id'], 'state' => 'complete', 'progress' => 100, 'file' => $path], 'changes' => $changes, 'files' => array_values(array_filter([...$files, $artifact])), 'reply' => (string) $pending['responseText'], 'events' => $events, 'preview' => $preview, 'buildState' => 'passed'];
    }
}
