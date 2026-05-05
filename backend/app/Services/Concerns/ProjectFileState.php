<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait ProjectFileState
{
    public function projects(): array
    {
        $state = $this->read();
        $state['projects'] = $this->discoverProjects();
        $this->write($state);

        return ['projects' => $state['projects']];
    }

    public function createProject(string $name): array
    {
        $state = $this->read();
        $home = rtrim((string) getenv('HOME'), '/');
        $baseDirectory = $home.'/Desktop/Vibyra Projects';
        $projectName = trim($name) ?: 'Untitled Workspace';
        $slug = Str::slug($projectName) ?: 'untitled-workspace';
        $path = $baseDirectory.'/'.$slug;
        $suffix = 2;

        while (File::exists($path)) {
            $path = $baseDirectory.'/'.$slug.'-'.$suffix;
            $suffix += 1;
        }

        File::ensureDirectoryExists($path);
        $readme = implode("\n", [
            '# '.$projectName,
            '',
            'Created from Vibyra mobile on '.now()->toDayDateTimeString().'.',
            '',
            'Edit this project from your desktop or request changes from Vibyra.',
            '',
        ]);
        File::put($path.'/README.md', $readme);

        $project = $this->projectFromPath($path, 'New project');
        $state['projects'] = [$project, ...array_values(array_filter(
            $this->discoverProjects(),
            fn ($existing) => $existing['id'] !== $project['id']
        ))];
        $state['selectedProjectId'] = $project['id'];
        $event = $this->event('Projects', 'Created '.$project['name'].' at '.$path, 'success');
        $state['events'] = $this->pushEvent($state['events'], $event['source'], $event['message'], $event['tone']);
        $this->write($state);

        return [
            'project' => $project,
            'projects' => $state['projects'],
            'files' => $this->filesForProject($project),
            'events' => [$event],
        ];
    }

    public function files(string $projectId): array
    {
        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'Project not found'], 404));
        }

        return ['files' => $this->filesForProject($project)];
    }

    public function createFile(string $projectId, string $path, string $content): array
    {
        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'Project not found'], 404));
        }

        $relativePath = $this->safeRelativePath($project, $path);

        if (! $relativePath) {
            abort(response()->json(['ok' => false, 'error' => 'Choose a safe file path inside the project'], 422));
        }

        $content = $content !== '' ? $content : "# ".$relativePath."\n\n";

        if (strlen($content) > 200000) {
            abort(response()->json(['ok' => false, 'error' => 'File content is too large'], 422));
        }

        $fullPath = rtrim($project['path'], '/').'/'.$relativePath;
        File::ensureDirectoryExists(dirname($fullPath));
        File::put($fullPath, $content);

        $file = $this->fileEntry($project, $relativePath, true);
        if ($file) {
            $file['changed'] = 'added';
        }

        $event = $this->event('Files', 'Created '.$relativePath, 'success');
        $state['events'] = $this->pushEvent($state['events'], $event['source'], $event['message'], $event['tone']);
        $this->write($state);

        return [
            'file' => $file,
            'files' => $this->filesForProject($project),
            'events' => [$event],
        ];
    }

    public function readFile(string $projectId, string $relativePath): array
    {
        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'Project not found'], 404));
        }

        $file = $this->fileEntry($project, $relativePath, true);

        if (! $file) {
            abort(response()->json(['ok' => false, 'error' => 'File not found or cannot be opened'], 404));
        }

        return ['file' => $file];
    }

    public function events(): array
    {
        $state = $this->read();

        return [
            'events' => $state['events'],
            'preview' => $state['latestPreview'],
            'selectedProjectId' => $state['selectedProjectId'],
            'activeAgentRun' => $state['activeAgentRun'],
        ];
    }

    public function startPreview(string $projectId): array
    {
        $state = $this->read();
        $project = $this->projectById($state, $projectId);
        $state['selectedProjectId'] = $projectId;
        $state['latestPreview'] = [
            'state' => 'live',
            'url' => 'http://localhost:3000/'.Str::slug($project['name'] ?? 'project'),
            'title' => $project['name'] ?? 'Project',
            'message' => 'Live preview stream started',
            'capturedAt' => now()->toISOString(),
        ];
        $event = $this->event('Preview', 'Live preview started for '.($project['name'] ?? 'project'), 'success');
        array_unshift($state['events'], $event);
        $state['events'] = array_slice($state['events'], 0, 50);
        $this->write($state);

        return ['preview' => $state['latestPreview'], 'events' => [$event]];
    }
}
