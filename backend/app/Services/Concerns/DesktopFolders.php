<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;

trait DesktopFolders
{
    private function discoverDesktopFolders(): array
    {
        $home = rtrim((string) getenv('HOME'), '/');
        if (! $home) {
            return [];
        }
        $desktop = $home.'/Desktop';
        if (! is_dir($desktop)) {
            return [];
        }

        $skip = $this->desktopFolderSkipList();
        $folders = [];

        foreach (File::directories($desktop) as $child) {
            $name = basename($child);
            if ($name === '' || $name[0] === '.') {
                continue;
            }
            if (in_array(strtolower($name), $skip, true)) {
                continue;
            }
            $folders[] = $this->projectFromPath($child, $this->detectStackFromDirectory($child), 'desktop');
        }

        usort($folders, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $folders;
    }

    private function desktopFolderSkipList(): array
    {
        return [
            '.trash',
            '$recycle.bin',
            'system volume information',
            'icon\r',
            '.ds_store',
            '.localized',
            '.spotlight-v100',
            '.fseventsd',
            '.temporaryitems',
            '.documentrevisions-v100',
            'vibyra projects',
        ];
    }

    private function detectStackFromDirectory(string $path): string
    {
        $entries = collect(File::files($path))->map(fn ($file) => $file->getFilename())->all();
        $directories = collect(File::directories($path))->map(fn ($dir) => basename($dir))->all();
        return $this->detectStack([...$entries, ...$directories]);
    }

    private function searchDesktopFolders(string $query, int $limit = 8): array
    {
        $needle = strtolower(trim($query));
        if ($needle === '') {
            return [];
        }
        $folders = [...$this->discoverDesktopFolders(), ...$this->discoverProjectsWithoutState()];
        $seen = [];
        $unique = [];
        foreach ($folders as $folder) {
            if (isset($seen[$folder['path']])) {
                continue;
            }
            $seen[$folder['path']] = true;
            $unique[] = $folder;
        }

        $tokens = array_values(array_filter(preg_split('/\s+/', $needle) ?: []));
        $scored = [];
        foreach ($unique as $folder) {
            $haystack = strtolower($folder['name'].' '.$folder['path'].' '.$folder['stack']);
            $score = 0;
            foreach ($tokens as $token) {
                if (str_contains($haystack, $token)) {
                    $score += str_contains(strtolower($folder['name']), $token) ? 3 : 1;
                }
            }
            if ($score > 0) {
                $scored[] = ['score' => $score, 'folder' => $folder];
            }
        }

        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score']);
        return array_slice(array_map(fn ($entry) => $entry['folder'], $scored), 0, $limit);
    }

    private function projectFromDesktopId(?string $projectId): ?array
    {
        if (! $projectId) {
            return null;
        }
        $padded = $projectId.str_repeat('=', (4 - strlen($projectId) % 4) % 4);
        $decoded = base64_decode(strtr($padded, '-_', '+/'), true);
        if ($decoded === false) {
            return null;
        }
        $home = rtrim((string) getenv('HOME'), '/');
        if (! $home) {
            return null;
        }
        $real = realpath($decoded);
        if (! $real || ! is_dir($real)) {
            return null;
        }
        $homeReal = realpath($home) ?: $home;
        if (! str_starts_with($real.'/', $homeReal.'/')) {
            return null;
        }
        return $this->projectFromPath($real, null, 'desktop');
    }
}
