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

    public function desktopFolders(): array
    {
        return ['folders' => $this->discoverDesktopFolders()];
    }

    public function desktopSearch(string $query): array
    {
        return ['matches' => $this->searchDesktopFolders($query)];
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
        File::put($path.'/index.html', $this->starterPreviewHtml($projectName));

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
            'url' => $project ? $this->previewUrl($project['id'], $state['token']) : null,
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

    private function starterPreviewHtml(string $projectName): string
    {
        return '<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>'.e($projectName).'</title>
    <style>
      :root { color-scheme: dark; --bg: #080910; --panel: #12131d; --line: #2d2541; --text: #fbf8ff; --muted: #beb8ce; --violet: #7c3cff; --green: #6df4a6; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 22px; background: linear-gradient(145deg, #080910, #151122 58%, #0c1620); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(680px, 100%); border: 1px solid var(--line); border-radius: 22px; background: rgba(18, 19, 29, .88); padding: clamp(22px, 7vw, 42px); box-shadow: 0 22px 60px rgba(0, 0, 0, .32); }
      .kicker { color: var(--green); font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      h1 { margin: 14px 0 12px; font-size: clamp(38px, 11vw, 76px); line-height: .94; }
      p { margin: 0; color: var(--muted); font-size: clamp(16px, 4vw, 20px); font-weight: 750; line-height: 1.55; }
      .button { display: inline-flex; align-items: center; min-height: 48px; margin-top: 26px; border-radius: 14px; background: linear-gradient(135deg, var(--violet), #63a6ff); padding: 0 18px; color: #fff; font-weight: 900; }
    </style>
  </head>
  <body><main><div class="kicker">Live Vibyra workspace</div><h1>'.e($projectName).'</h1><p>This workspace is ready for a phone-viewable build.</p><div class="button">Open preview</div></main></body>
</html>';
    }
}
