<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;

trait ProjectDiscovery
{
    use DesktopFolders;

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

        $projects[] = $this->projectFromPath($path, $this->detectStack($names));
    }

    private function projectFromPath(string $path, ?string $stack = null, string $source = 'pc'): array
    {
        $entries = is_dir($path)
            ? collect(File::files($path))->map(fn ($file) => $file->getFilename())->all()
            : [];

        return [
            'id' => rtrim(strtr(base64_encode($path), '+/', '-_'), '='),
            'name' => basename($path),
            'path' => $path,
            'stack' => $stack ?: $this->detectStack($entries),
            'updated' => $this->formatUpdated(filemtime($path) ?: time()),
            'source' => $source,
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

        $desktopMatch = $this->projectFromDesktopId($projectId);
        if ($desktopMatch) {
            return $desktopMatch;
        }

        return null;
    }

    private function projectFromTrustedPath(string $path): ?array
    {
        if (trim($path) === '') {
            return null;
        }

        $real = realpath($path);
        if (! $real || ! is_dir($real)) {
            return null;
        }
        $home = rtrim((string) getenv('HOME'), '/');
        $homeReal = $home ? (realpath($home) ?: $home) : '';
        if (! $homeReal || ! str_starts_with($real.'/', $homeReal.'/')) {
            return null;
        }
        return $this->projectFromPath($real, null, 'desktop');
    }
}
