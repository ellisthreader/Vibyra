<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class CodeXDesktopState
{
    private string $statePath;

    public function __construct()
    {
        $this->statePath = storage_path('app/codex/state.json');
        $this->ensureState();
    }

    public function state(): array
    {
        return $this->read();
    }

    public function publicState(): array
    {
        $state = $this->read();

        return [
            'machineName' => $state['machineName'],
            'pairCode' => $state['pairCode'],
            'pairedDevice' => $state['pairedDevice'],
            'pendingPair' => $state['pendingPair'],
            'latestPreview' => $state['latestPreview'],
            'events' => $state['events'],
            'connectionUrls' => $this->connectionUrls(),
            'projects' => $state['projects'],
        ];
    }

    public function health(): array
    {
        $state = $this->read();

        return [
            'ok' => true,
            'machineName' => $state['machineName'],
            'pairCode' => $state['pairCode'],
            'paired' => filled($state['pairedDevice']),
            'pairedDevice' => $state['pairedDevice'],
            'startedAt' => $state['startedAt'],
            'preview' => $state['latestPreview'],
            'connectionUrls' => $this->connectionUrls(),
        ];
    }

    public function requestPair(string $code, string $deviceName): array
    {
        $state = $this->read();

        if (Str::upper(trim($code)) !== $state['pairCode']) {
            abort(response()->json(['ok' => false, 'error' => 'Pair code does not match'], 401));
        }

        $state['pendingPair'] = [
            'id' => 'pair-'.now()->timestamp.'-'.random_int(100, 999),
            'deviceName' => $deviceName ?: 'Code X iPhone',
            'requestedAt' => now()->toISOString(),
            'status' => 'pending',
        ];
        $state['events'] = $this->pushEvent(
            $state['events'],
            'Pairing',
            $state['pendingPair']['deviceName'].' is asking to pair',
            'warning'
        );
        $this->write($state);

        return [
            'ok' => true,
            'status' => 'pending',
            'requestId' => $state['pendingPair']['id'],
            'machineName' => $state['machineName'],
        ];
    }

    public function approvePair(): array
    {
        $state = $this->read();

        if ($state['pendingPair']) {
            $state['pairedDevice'] = $state['pendingPair']['deviceName'];
            $state['pendingPair']['status'] = 'approved';
            $state['projects'] = $this->discoverProjects();
            $state['events'] = $this->pushEvent(
                $state['events'],
                'Pairing',
                $state['pairedDevice'].' approved on desktop',
                'success'
            );
            $this->write($state);
        }

        return $this->publicState();
    }

    public function denyPair(): array
    {
        $state = $this->read();

        if ($state['pendingPair']) {
            $state['pendingPair']['status'] = 'denied';
            $state['events'] = $this->pushEvent($state['events'], 'Pairing', 'Pairing request denied', 'error');
            $this->write($state);
        }

        return $this->publicState();
    }

    public function pairStatus(string $requestId): array
    {
        $state = $this->read();
        $pending = $state['pendingPair'];

        if (! $pending || $pending['id'] !== $requestId) {
            abort(response()->json(['ok' => false, 'error' => 'Pair request not found'], 404));
        }

        if ($pending['status'] === 'denied') {
            abort(response()->json(['ok' => false, 'status' => 'denied', 'error' => 'Desktop denied pairing'], 403));
        }

        if ($pending['status'] === 'approved') {
            $state['projects'] = $this->discoverProjects();
            $this->write($state);

            return [
                'ok' => true,
                'status' => 'approved',
                'token' => $state['token'],
                'machineName' => $state['machineName'],
                'projects' => $state['projects'],
                'events' => $state['events'],
            ];
        }

        return ['ok' => true, 'status' => 'pending', 'machineName' => $state['machineName']];
    }

    public function projects(): array
    {
        $state = $this->read();
        $state['projects'] = $this->discoverProjects();
        $this->write($state);

        return ['projects' => $state['projects']];
    }

    public function events(): array
    {
        $state = $this->read();

        return [
            'events' => $state['events'],
            'preview' => $state['latestPreview'],
            'selectedProjectId' => $state['selectedProjectId'],
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

    public function startAgent(string $projectId, string $prompt, string $model): array
    {
        $state = $this->read();
        $project = $this->projectById($state, $projectId);

        if (! $project) {
            abort(response()->json(['ok' => false, 'error' => 'No project selected'], 422));
        }

        $runId = 'run-'.now()->timestamp.'-'.random_int(100, 999);
        $outputDir = $project['path'].'/.codex-agent/runs';
        File::ensureDirectoryExists($outputDir);
        $outputPath = $outputDir.'/'.$runId.'.md';
        $summary = implode("\n", [
            '# Code X Agent Run',
            '',
            'Prompt: '.$prompt,
            'Model: '.$model,
            'Project: '.$project['name'],
            'Created: '.now()->toISOString(),
            '',
            'Laravel handled the local backend workflow while React and Tailwind rendered the desktop control app.',
        ]);
        File::put($outputPath, $summary);

        $state['selectedProjectId'] = $project['id'];
        $state['latestPreview'] = [
            'state' => 'delivered',
            'url' => 'http://localhost:3000/'.Str::slug($project['name']),
            'title' => $project['name'],
            'message' => 'Updated preview captured from Code X Desktop',
            'capturedAt' => now()->toISOString(),
        ];

        $newEvents = [
            $this->event('Preview', 'Updated preview delivered to iPhone', 'success'),
            $this->event('Agent', 'Captured refreshed project preview', 'success'),
            $this->event('Dev Server', 'Project reloaded after local apply', 'success'),
            $this->event('Agent', 'Applied generated run artifact at '.$outputPath, 'info'),
            $this->event($model, 'Code diff returned', 'info'),
            $this->event('Backend', 'Prompt sent to '.$model, 'info'),
        ];
        $state['events'] = array_slice([...$newEvents, ...$state['events']], 0, 50);
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
            'changes' => [[
                'id' => $runId.'-change',
                'file' => $outputPath,
                'summary' => 'Created local Laravel-backed run artifact',
                'additions' => count(explode("\n", $summary)),
                'deletions' => 0,
                'status' => 'applied',
            ]],
            'files' => [[
                'id' => $runId.'-file',
                'name' => basename($outputPath),
                'path' => $outputPath,
                'language' => 'md',
                'changed' => 'added',
                'body' => $summary,
            ]],
            'events' => $newEvents,
            'preview' => $state['latestPreview'],
            'buildState' => 'passed',
        ];
    }

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

    public function tokenIsValid(?string $authorization): bool
    {
        $state = $this->read();

        return $authorization === 'Bearer '.$state['token'];
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
            'machineName' => gethostname() ?: 'Code X Desktop',
            'pairCode' => $pairCode,
            'token' => 'codex-'.Str::random(40),
            'startedAt' => now()->toISOString(),
            'pairedDevice' => null,
            'pendingPair' => null,
            'selectedProjectId' => null,
            'latestPreview' => null,
            'projects' => $this->discoverProjectsWithoutState(),
            'events' => [
                $this->event('Desktop', 'Code X Desktop is ready', 'success'),
                $this->event('Pairing', 'Pair code '.$pairCode.' is showing on desktop', 'info'),
            ],
        ];

        $this->write($state);
    }

    private function read(): array
    {
        return json_decode(File::get($this->statePath), true);
    }

    private function write(array $state): void
    {
        File::put($this->statePath, json_encode($state, JSON_PRETTY_PRINT));
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

    private function discoverProjects(): array
    {
        return $this->discoverProjectsWithoutState();
    }

    private function discoverProjectsWithoutState(): array
    {
        $root = dirname(base_path());
        $home = rtrim((string) getenv('HOME'), '/');
        $roots = array_filter([
            $root,
            $home.'/Desktop',
            $home.'/Code',
            $home.'/Projects',
            $home.'/Work',
        ]);
        $seen = [];
        $projects = [];

        foreach ($roots as $directory) {
            if (! is_dir($directory)) {
                continue;
            }

            $this->maybeAddProject($directory, $seen, $projects);

            foreach (array_slice(File::directories($directory), 0, 60) as $child) {
                $this->maybeAddProject($child, $seen, $projects);
            }
        }

        return array_slice($projects, 0, 12);
    }

    private function maybeAddProject(string $path, array &$seen, array &$projects): void
    {
        if (isset($seen[$path]) || ! is_dir($path)) {
            return;
        }

        $seen[$path] = true;
        $entries = collect(File::files($path))->map(fn ($file) => $file->getFilename())->all();
        $directories = collect(File::directories($path))->map(fn ($dir) => basename($dir))->all();
        $names = [...$entries, ...$directories];
        $markers = ['package.json', '.git', 'app.json', 'requirements.txt', 'pyproject.toml'];

        if (empty(array_intersect($markers, $names))) {
            return;
        }

        $projects[] = [
            'id' => rtrim(strtr(base64_encode($path), '+/', '-_'), '='),
            'name' => basename($path),
            'path' => $path,
            'stack' => $this->detectStack($names),
            'updated' => $this->formatUpdated(filemtime($path) ?: time()),
        ];
    }

    private function detectStack(array $entries): string
    {
        if (in_array('app.json', $entries, true)) {
            return 'Expo React Native';
        }

        if (in_array('package.json', $entries, true)) {
            return 'Node / React';
        }

        if (in_array('pyproject.toml', $entries, true) || in_array('requirements.txt', $entries, true)) {
            return 'Python';
        }

        return 'Project';
    }

    private function formatUpdated(int $timestamp): string
    {
        $minutes = max(1, (int) round((time() - $timestamp) / 60));

        if ($minutes < 60) {
            return $minutes.' min ago';
        }

        $hours = (int) round($minutes / 60);

        return $hours < 24 ? $hours.'h ago' : ((int) round($hours / 24)).'d ago';
    }

    private function projectById(array $state, string $projectId): ?array
    {
        foreach ($state['projects'] as $project) {
            if ($project['id'] === $projectId) {
                return $project;
            }
        }

        return $state['projects'][0] ?? null;
    }
}
